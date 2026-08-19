#!/usr/bin/env python3
"""Validated, repeatable loader for the fixed Jongno DEM table."""

from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Sequence

import numpy as np


EXPECTED_SIZE = (6576, 7388)
EXPECTED_GEOTRANSFORM = (195488.0, 1.0, 0.0, 559197.0, 0.0, -1.0)
EXPECTED_SRID = 5186
CRS_EQUIVALENCE_TOLERANCE_METERS = 0.001
CRS_CONTROL_POINTS = (
    (195488.0, 559197.0),
    (202064.0, 559197.0),
    (195488.0, 551809.0),
    (202064.0, 551809.0),
    (198776.0, 555503.0),
)
TARGET_TABLE = "public.dem_jongno"
NODATA = -9999.0
TILE_SIZE = "256x256"
REQUIRED_TOOLS = ("gdalinfo", "gdal_calc.py", "raster2pgsql", "psql")
REQUIRED_DATABASE_KEYS = ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER")
OPTIONAL_DATABASE_KEYS = ("PGPASSWORD",)
LOCAL_IMAGE = "ddemachim-dem-loader:pg18-postgis36"
LOCAL_DATABASE_CONTAINER = "ddemachim-db"
LOCAL_DATABASE = "ddemachim"
LOCAL_DATABASE_USER = "postgres"
LOCAL_NETWORK = "ddemachim_default"


class DemLoaderError(RuntimeError):
    """Base class for safe operator-facing loader failures."""


class ValidationError(DemLoaderError):
    """The source or cleaned raster violates the locked data contract."""


class ConfigurationError(DemLoaderError):
    """Required explicit database configuration is missing."""


class ToolError(DemLoaderError):
    """A required command-line tool is unavailable."""


class LoadError(DemLoaderError):
    """The raster SQL producer or database consumer failed."""


@dataclass(frozen=True)
class SourceMetadata:
    width: int
    height: int
    valid_sentinel_pixels: int


@dataclass(frozen=True)
class CleanMetadata:
    band_count: int
    nodata: float


def _gdal_dependencies(
    gdal_module: object | None, osr_module: object | None
) -> tuple[object, object]:
    if gdal_module is not None and osr_module is not None:
        return gdal_module, osr_module
    try:
        from osgeo import gdal, osr
    except ImportError as exc:
        raise ToolError("Python GDAL bindings (osgeo) are unavailable") from exc
    return gdal, osr


def _open_dataset(path: Path, gdal_module: object) -> object:
    dataset = gdal_module.Open(str(path), gdal_module.GA_ReadOnly)
    if dataset is None:
        raise ValidationError(f"cannot open raster: {path}")
    return dataset


def _validate_grid(dataset: object, osr_module: object) -> None:
    actual_size = (dataset.RasterXSize, dataset.RasterYSize)
    if actual_size != EXPECTED_SIZE:
        raise ValidationError(
            f"unexpected raster size {actual_size}; expected {EXPECTED_SIZE}"
        )

    actual_transform = dataset.GetGeoTransform()
    if len(actual_transform) != 6 or any(
        not math.isclose(actual, expected, rel_tol=0.0, abs_tol=1e-9)
        for actual, expected in zip(actual_transform, EXPECTED_GEOTRANSFORM)
    ):
        raise ValidationError(
            f"unexpected geotransform {actual_transform}; expected {EXPECTED_GEOTRANSFORM}"
        )

    actual_crs = dataset.GetSpatialRef()
    expected_crs = osr_module.SpatialReference()
    if expected_crs.ImportFromEPSG(EXPECTED_SRID) != 0:
        raise ToolError(f"GDAL could not construct EPSG:{EXPECTED_SRID}")
    if actual_crs is None or not _crs_matches_epsg5186(
        actual_crs, expected_crs, osr_module
    ):
        raise ValidationError(f"raster CRS is not semantically EPSG:{EXPECTED_SRID}")


def _crs_matches_epsg5186(
    actual_crs: object, expected_crs: object, osr_module: object
) -> bool:
    if bool(actual_crs.IsSame(expected_crs)):
        return True

    try:
        source = actual_crs.Clone()
        target = expected_crs.Clone()
        source.SetAxisMappingStrategy(osr_module.OAMS_TRADITIONAL_GIS_ORDER)
        target.SetAxisMappingStrategy(osr_module.OAMS_TRADITIONAL_GIS_ORDER)
        transformation = osr_module.CoordinateTransformation(source, target)
        for x, y in CRS_CONTROL_POINTS:
            transformed = transformation.TransformPoint(x, y)
            if len(transformed) < 2 or not all(
                math.isfinite(value) for value in transformed[:2]
            ):
                return False
            if (
                abs(transformed[0] - x) > CRS_EQUIVALENCE_TOLERANCE_METERS
                or abs(transformed[1] - y) > CRS_EQUIVALENCE_TOLERANCE_METERS
            ):
                return False
    except (AttributeError, RuntimeError, TypeError, ValueError):
        return False
    return True


def _count_valid_sentinel_pixels(dataset: object) -> int:
    elevation = dataset.GetRasterBand(1)
    alpha = dataset.GetRasterBand(2)
    block_width, block_height = elevation.GetBlockSize()
    if block_width <= 0 or block_height <= 0:
        block_width, block_height = 256, 256

    count = 0
    for y_offset in range(0, dataset.RasterYSize, block_height):
        height = min(block_height, dataset.RasterYSize - y_offset)
        for x_offset in range(0, dataset.RasterXSize, block_width):
            width = min(block_width, dataset.RasterXSize - x_offset)
            values = elevation.ReadAsArray(x_offset, y_offset, width, height)
            mask = alpha.ReadAsArray(x_offset, y_offset, width, height)
            if values is None or mask is None:
                raise ValidationError("could not read raster pixels during validation")
            count += int(np.count_nonzero((mask != 0) & (values == NODATA)))
    return count


def validate_source(
    source: Path, *, gdal_module: object | None = None, osr_module: object | None = None
) -> SourceMetadata:
    gdal_module, osr_module = _gdal_dependencies(gdal_module, osr_module)
    dataset = _open_dataset(source, gdal_module)
    _validate_grid(dataset, osr_module)

    if dataset.RasterCount != 2:
        raise ValidationError(
            f"source must have exactly two bands; found {dataset.RasterCount}"
        )
    elevation = dataset.GetRasterBand(1)
    alpha = dataset.GetRasterBand(2)
    if elevation.DataType != gdal_module.GDT_Float32:
        raise ValidationError("source elevation band must be Float32")
    if elevation.GetNoDataValue() is not None:
        raise ValidationError("source elevation band unexpectedly declares NoData")
    if alpha.DataType != gdal_module.GDT_Float32:
        raise ValidationError("source alpha band must be Float32")
    if alpha.GetColorInterpretation() != gdal_module.GCI_AlphaBand:
        raise ValidationError("source band 2 must be the alpha band")

    valid_sentinel_pixels = _count_valid_sentinel_pixels(dataset)
    if valid_sentinel_pixels:
        raise ValidationError(
            f"found {valid_sentinel_pixels} valid elevation pixels equal to reserved -9999 NoData"
        )
    return SourceMetadata(
        width=dataset.RasterXSize,
        height=dataset.RasterYSize,
        valid_sentinel_pixels=valid_sentinel_pixels,
    )


def build_clean_command(source: Path, output: Path) -> list[str]:
    return [
        "gdal_calc.py",
        "--quiet",
        "--overwrite",
        "-A",
        str(source),
        "--A_band",
        "1",
        "-B",
        str(source),
        "--B_band",
        "2",
        "--calc",
        "where(B==0,-9999,A)",
        "--type",
        "Float32",
        "--NoDataValue",
        "-9999",
        "--co",
        "TILED=YES",
        "--co",
        "BLOCKXSIZE=256",
        "--co",
        "BLOCKYSIZE=256",
        "--co",
        "COMPRESS=DEFLATE",
        "--outfile",
        str(output),
    ]


def run_clean(source: Path, output: Path) -> None:
    result = subprocess.run(
        build_clean_command(source, output),
        check=False,
        shell=False,
    )
    if result.returncode != 0:
        raise DemLoaderError(
            f"gdal_calc.py failed with exit status {result.returncode}"
        )


def validate_clean_output(
    output: Path, *, gdal_module: object | None = None, osr_module: object | None = None
) -> CleanMetadata:
    gdal_module, osr_module = _gdal_dependencies(gdal_module, osr_module)
    dataset = _open_dataset(output, gdal_module)
    _validate_grid(dataset, osr_module)
    if dataset.RasterCount != 1:
        raise ValidationError(
            f"cleaned raster must have exactly one band; found {dataset.RasterCount}"
        )
    elevation = dataset.GetRasterBand(1)
    if elevation.DataType != gdal_module.GDT_Float32:
        raise ValidationError("cleaned elevation band must be Float32")
    nodata = elevation.GetNoDataValue()
    if nodata is None or not math.isclose(
        float(nodata), NODATA, rel_tol=0.0, abs_tol=0.0
    ):
        raise ValidationError(
            f"cleaned elevation band NoData must be {NODATA}; found {nodata}"
        )
    return CleanMetadata(band_count=dataset.RasterCount, nodata=float(nodata))


def build_raster_command(output: Path) -> list[str]:
    return [
        "raster2pgsql",
        "-s",
        str(EXPECTED_SRID),
        "-b",
        "1",
        "-t",
        TILE_SIZE,
        "-d",
        "-I",
        "-C",
        "-M",
        "-k",
        str(output),
        TARGET_TABLE,
    ]


def build_local_producer_command(source: Path) -> list[str]:
    return [
        "docker",
        "run",
        "--rm",
        "--platform",
        "linux/amd64",
        "--network",
        LOCAL_NETWORK,
        "--mount",
        f"type=bind,source={source},target=/input/jongro_gu.tif,readonly",
        "--mount",
        "type=tmpfs,destination=/work,tmpfs-size=1073741824",
        "-e",
        "DEM_WORK_DIR=/work",
        LOCAL_IMAGE,
        "--emit-sql",
        "/input/jongro_gu.tif",
    ]


def build_local_consumer_command() -> list[str]:
    return [
        "docker",
        "exec",
        "-i",
        LOCAL_DATABASE_CONTAINER,
        "psql",
        "-X",
        "-U",
        LOCAL_DATABASE_USER,
        "-d",
        LOCAL_DATABASE,
        "-v",
        "ON_ERROR_STOP=1",
    ]


def build_database_environment(environ: Mapping[str, str]) -> dict[str, str]:
    missing = [key for key in REQUIRED_DATABASE_KEYS if not environ.get(key)]
    if missing:
        raise ConfigurationError(
            "missing explicit database settings: " + ", ".join(missing)
        )
    if not environ["PGPORT"].isdigit():
        raise ConfigurationError("PGPORT must be numeric")
    allowed_keys = REQUIRED_DATABASE_KEYS + OPTIONAL_DATABASE_KEYS
    return {key: environ[key] for key in allowed_keys if environ.get(key)}


def load_raster(
    output: Path,
    database_environment: Mapping[str, str],
    *,
    popen: Callable[..., object] | None = None,
) -> None:
    if popen is None:
        popen = subprocess.Popen
    raster_process = popen(
        build_raster_command(output),
        stdout=subprocess.PIPE,
        shell=False,
    )
    if raster_process.stdout is None:
        raise LoadError("raster2pgsql did not expose its SQL output")
    try:
        psql_process = popen(
            ["psql", "-X", "-v", "ON_ERROR_STOP=1"],
            stdin=raster_process.stdout,
            env=dict(database_environment),
            shell=False,
        )
    except BaseException:
        if hasattr(raster_process, "terminate"):
            raster_process.terminate()
        raster_process.wait()
        raise
    finally:
        raster_process.stdout.close()

    psql_status = psql_process.wait()
    raster_status = raster_process.wait()
    if raster_status != 0 or psql_status != 0:
        raise LoadError(
            "DEM load pipeline failed: "
            f"raster2pgsql={raster_status}, psql={psql_status}; "
            "the transaction is rolled back unless failure occurred during the post-commit -M vacuum"
        )


def load_via_local_docker(
    source: Path, *, popen: Callable[..., object] | None = None
) -> None:
    if popen is None:
        popen = subprocess.Popen
    producer = popen(
        build_local_producer_command(source),
        stdout=subprocess.PIPE,
        shell=False,
    )
    if producer.stdout is None:
        raise LoadError("Docker DEM producer did not expose its SQL output")
    try:
        consumer = popen(
            build_local_consumer_command(),
            stdin=producer.stdout,
            shell=False,
        )
    except BaseException:
        if hasattr(producer, "terminate"):
            producer.terminate()
        producer.wait()
        raise
    finally:
        producer.stdout.close()

    consumer_status = consumer.wait()
    producer_status = producer.wait()
    if producer_status != 0 or consumer_status != 0:
        raise LoadError(
            "local Docker DEM load failed: "
            f"producer={producer_status}, database={consumer_status}; "
            "the transaction is rolled back unless failure occurred during the post-commit -M vacuum"
        )


def emit_raster_sql(output: Path) -> None:
    result = subprocess.run(
        build_raster_command(output),
        check=False,
        shell=False,
    )
    if result.returncode != 0:
        raise LoadError(
            f"raster2pgsql failed with exit status {result.returncode}"
        )


def require_tools(*, which: Callable[[str], str | None] | None = None) -> None:
    if which is None:
        which = shutil.which
    missing = [tool for tool in REQUIRED_TOOLS if which(tool) is None]
    if missing:
        raise ToolError("missing required tools: " + ", ".join(missing))


def main(
    argv: Sequence[str] | None = None, *, environ: Mapping[str, str] | None = None
) -> int:
    parser = argparse.ArgumentParser(
        description=f"Replace the fixed in-db raster table {TARGET_TABLE}"
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--emit-sql",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    mode.add_argument(
        "--local-docker-exec",
        action="store_true",
        help=(
            "run the fixed loader image and stream SQL through docker exec to "
            "ddemachim-db/ddemachim"
        ),
    )
    parser.add_argument("source", type=Path, help="two-band Jongno source GeoTIFF")
    args = parser.parse_args(argv)

    process_environment = os.environ if environ is None else environ
    if args.local_docker_exec:
        if not args.source.is_file():
            raise ValidationError(f"source raster does not exist: {args.source}")
        if shutil.which("docker") is None:
            raise ToolError("missing required tool: docker")
        load_via_local_docker(args.source.resolve())
        print(
            f"Loaded {TARGET_TABLE} through fixed container {LOCAL_DATABASE_CONTAINER}"
        )
        return 0

    require_tools()
    source_metadata = validate_source(args.source)
    database_environment = (
        None
        if args.emit_sql
        else build_database_environment(process_environment)
    )
    report_stream = sys.stderr if args.emit_sql else sys.stdout
    print(
        "Validated source: "
        f"{source_metadata.width}x{source_metadata.height}, "
        f"EPSG:{EXPECTED_SRID}, valid_reserved_nodata=0",
        file=report_stream,
    )

    work_root_value = process_environment.get("DEM_WORK_DIR")
    work_root = Path(work_root_value) if work_root_value else None
    with tempfile.TemporaryDirectory(prefix="dem-jongno-", dir=work_root) as temp_dir:
        clean_output = Path(temp_dir) / "dem_jongno_clean.tif"
        run_clean(args.source, clean_output)
        clean_metadata = validate_clean_output(clean_output)
        print(
            "Validated cleaned raster: "
            f"bands={clean_metadata.band_count}, nodata={clean_metadata.nodata:g}",
            file=report_stream,
        )
        if args.emit_sql:
            emit_raster_sql(clean_output)
        else:
            if database_environment is None:
                raise ConfigurationError("database environment was not initialized")
            load_raster(clean_output, database_environment)

    if args.emit_sql:
        print("Raster SQL emitted; temporary raster removed", file=sys.stderr)
    else:
        print(f"Loaded {TARGET_TABLE}; temporary raster removed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DemLoaderError as exc:
        print(f"DEM load failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
