from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np


PIPELINE_DIR = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PIPELINE_DIR / "scripts" / "load_dem_postgis.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("load_dem_postgis", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


loader = _load_module()


class FakeSpatialReference:
    def __init__(
        self, epsg: int, *, transform_delta: tuple[float, float] = (0.0, 0.0)
    ) -> None:
        self.epsg = epsg
        self.transform_delta = transform_delta

    def IsSame(self, other: "FakeSpatialReference") -> int:
        return int(self.epsg == other.epsg)

    def Clone(self) -> "FakeSpatialReference":
        return FakeSpatialReference(
            self.epsg, transform_delta=self.transform_delta
        )

    def SetAxisMappingStrategy(self, _strategy: int) -> None:
        return None


class FakeOsr:
    OAMS_TRADITIONAL_GIS_ORDER = 0

    class SpatialReference(FakeSpatialReference):
        def __init__(self) -> None:
            super().__init__(0)

        def ImportFromEPSG(self, epsg: int) -> int:
            self.epsg = epsg
            return 0

    class CoordinateTransformation:
        def __init__(
            self, source: FakeSpatialReference, _target: FakeSpatialReference
        ) -> None:
            self.delta = source.transform_delta

        def TransformPoint(self, x: float, y: float) -> tuple[float, float, float]:
            return (x + self.delta[0], y + self.delta[1], 0.0)


class FakeBand:
    def __init__(
        self,
        *,
        data_type: int,
        color_interpretation: int,
        nodata: float | None = None,
        value: float = 12.5,
    ) -> None:
        self.DataType = data_type
        self._color_interpretation = color_interpretation
        self._nodata = nodata
        self._value = value

    def GetColorInterpretation(self) -> int:
        return self._color_interpretation

    def GetNoDataValue(self) -> float | None:
        return self._nodata

    def GetBlockSize(self) -> tuple[int, int]:
        return (6576, 7388)

    def ReadAsArray(self, *_args: int) -> np.ndarray:
        return np.array([[self._value]], dtype=np.float32)


class FakeDataset:
    def __init__(
        self,
        *,
        width: int = 6576,
        height: int = 7388,
        geotransform: tuple[float, ...] = (
            195488.0,
            1.0,
            0.0,
            559197.0,
            0.0,
            -1.0,
        ),
        epsg: int = 5186,
        spatial_reference: FakeSpatialReference | None = None,
        bands: list[FakeBand] | None = None,
    ) -> None:
        self.RasterXSize = width
        self.RasterYSize = height
        self.RasterCount = len(bands or [])
        self._geotransform = geotransform
        self._spatial_reference = spatial_reference or FakeSpatialReference(epsg)
        self._bands = bands or []

    def GetGeoTransform(self) -> tuple[float, ...]:
        return self._geotransform

    def GetSpatialRef(self) -> FakeSpatialReference:
        return self._spatial_reference

    def GetRasterBand(self, number: int) -> FakeBand:
        return self._bands[number - 1]


class FakeGdal:
    GA_ReadOnly = 0
    GDT_Float32 = 6
    GCI_Undefined = 0
    GCI_AlphaBand = 6

    def __init__(self, dataset: FakeDataset | None) -> None:
        self.dataset = dataset

    def Open(self, _path: str, _mode: int) -> FakeDataset | None:
        return self.dataset


def source_dataset(**overrides: object) -> FakeDataset:
    bands = overrides.pop("bands", None) or [
        FakeBand(data_type=FakeGdal.GDT_Float32, color_interpretation=FakeGdal.GCI_Undefined),
        FakeBand(data_type=FakeGdal.GDT_Float32, color_interpretation=FakeGdal.GCI_AlphaBand, value=255),
    ]
    return FakeDataset(bands=bands, **overrides)


def clean_dataset(**overrides: object) -> FakeDataset:
    bands = overrides.pop("bands", None) or [
        FakeBand(
            data_type=FakeGdal.GDT_Float32,
            color_interpretation=FakeGdal.GCI_Undefined,
            nodata=-9999.0,
        )
    ]
    return FakeDataset(bands=bands, **overrides)


class SourceValidationTest(unittest.TestCase):
    def test_accepts_only_the_expected_source_contract(self) -> None:
        metadata = loader.validate_source(
            Path("/input/jongro_gu.tif"),
            gdal_module=FakeGdal(source_dataset()),
            osr_module=FakeOsr,
        )

        self.assertEqual(metadata.width, 6576)
        self.assertEqual(metadata.height, 7388)
        self.assertEqual(metadata.valid_sentinel_pixels, 0)

    def test_accepts_user_defined_crs_with_submillimetre_epsg5186_transform(self) -> None:
        dataset = source_dataset(
            spatial_reference=FakeSpatialReference(
                0, transform_delta=(-0.00000003, 0.00000070)
            )
        )

        metadata = loader.validate_source(
            Path("/input/jongro_gu.tif"),
            gdal_module=FakeGdal(dataset),
            osr_module=FakeOsr,
        )

        self.assertEqual((metadata.width, metadata.height), (6576, 7388))

    def test_rejects_wrong_grid_before_any_database_process(self) -> None:
        for label, dataset in (
            ("width", source_dataset(width=6575)),
            (
                "pixel size",
                source_dataset(
                    geotransform=(195488.0, 2.0, 0.0, 559197.0, 0.0, -1.0)
                ),
            ),
            (
                "skew",
                source_dataset(
                    geotransform=(195488.0, 1.0, 0.25, 559197.0, 0.0, -1.0)
                ),
            ),
            (
                "CRS",
                source_dataset(
                    spatial_reference=FakeSpatialReference(
                        4326, transform_delta=(100000.0, 100000.0)
                    )
                ),
            ),
        ):
            with self.subTest(label=label):
                with self.assertRaises(loader.ValidationError):
                    loader.validate_source(
                        Path("/input/jongro_gu.tif"),
                        gdal_module=FakeGdal(dataset),
                        osr_module=FakeOsr,
                    )

    def test_rejects_wrong_band_contract(self) -> None:
        cases = (
            (
                "band count",
                source_dataset(
                    bands=[
                        FakeBand(
                            data_type=FakeGdal.GDT_Float32,
                            color_interpretation=FakeGdal.GCI_Undefined,
                        )
                    ]
                ),
            ),
            (
                "elevation type",
                source_dataset(
                    bands=[
                        FakeBand(data_type=3, color_interpretation=FakeGdal.GCI_Undefined),
                        FakeBand(
                            data_type=FakeGdal.GDT_Float32,
                            color_interpretation=FakeGdal.GCI_AlphaBand,
                            value=255,
                        ),
                    ]
                ),
            ),
            (
                "alpha interpretation",
                source_dataset(
                    bands=[
                        FakeBand(
                            data_type=FakeGdal.GDT_Float32,
                            color_interpretation=FakeGdal.GCI_Undefined,
                        ),
                        FakeBand(
                            data_type=FakeGdal.GDT_Float32,
                            color_interpretation=FakeGdal.GCI_Undefined,
                            value=255,
                        ),
                    ]
                ),
            ),
        )

        for label, dataset in cases:
            with self.subTest(label=label):
                with self.assertRaises(loader.ValidationError):
                    loader.validate_source(
                        Path("/input/jongro_gu.tif"),
                        gdal_module=FakeGdal(dataset),
                        osr_module=FakeOsr,
                    )

    def test_rejects_valid_elevation_equal_to_reserved_nodata(self) -> None:
        dataset = source_dataset()
        dataset.GetRasterBand(1)._value = -9999.0
        dataset.GetRasterBand(2)._value = 255

        with self.assertRaisesRegex(loader.ValidationError, "valid.*-9999"):
            loader.validate_source(
                Path("/input/jongro_gu.tif"),
                gdal_module=FakeGdal(dataset),
                osr_module=FakeOsr,
            )


class CommandContractTest(unittest.TestCase):
    def test_clean_command_materializes_alpha_as_nodata_in_one_float_band(self) -> None:
        command = loader.build_clean_command(
            Path("/input/jongro_gu.tif"), Path("/work/clean.tif")
        )

        self.assertEqual(
            command,
            [
                "gdal_calc.py",
                "--quiet",
                "--overwrite",
                "-A",
                "/input/jongro_gu.tif",
                "--A_band",
                "1",
                "-B",
                "/input/jongro_gu.tif",
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
                "/work/clean.tif",
            ],
        )

    def test_raster_command_is_fixed_in_db_and_constrained(self) -> None:
        command = loader.build_raster_command(Path("/work/clean.tif"))

        self.assertEqual(
            command,
            [
                "raster2pgsql",
                "-s",
                "5186",
                "-b",
                "1",
                "-t",
                "256x256",
                "-d",
                "-I",
                "-C",
                "-M",
                "-k",
                "/work/clean.tif",
                "public.dem_jongno",
            ],
        )
        self.assertNotIn("-R", command)
        self.assertNotIn("-e", command)
        self.assertNotIn("CASCADE", " ".join(command).upper())

    def test_cli_does_not_accept_a_destination_override(self) -> None:
        with self.assertRaises(SystemExit):
            loader.main(["/input/jongro_gu.tif", "--table", "public.other"])


class CleanOutputValidationTest(unittest.TestCase):
    def test_accepts_only_one_float_band_with_exact_nodata_and_grid(self) -> None:
        metadata = loader.validate_clean_output(
            Path("/work/clean.tif"),
            gdal_module=FakeGdal(clean_dataset()),
            osr_module=FakeOsr,
        )

        self.assertEqual(metadata.band_count, 1)
        self.assertEqual(metadata.nodata, -9999.0)

    def test_rejects_clean_output_without_reserved_nodata(self) -> None:
        with self.assertRaises(loader.ValidationError):
            loader.validate_clean_output(
                Path("/work/clean.tif"),
                gdal_module=FakeGdal(clean_dataset(bands=[FakeBand(data_type=6, color_interpretation=0)])),
                osr_module=FakeOsr,
            )


@unittest.skipUnless(
    os.environ.get("DEM_GDAL_INTEGRATION") == "1",
    "set DEM_GDAL_INTEGRATION=1 inside the loader image",
)
class GdalCalcIntegrationTest(unittest.TestCase):
    def test_clean_command_executes_and_materializes_alpha_zero_as_nodata(self) -> None:
        from osgeo import gdal

        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "source.tif"
            output = Path(temp_dir) / "clean.tif"
            dataset = gdal.GetDriverByName("GTiff").Create(
                str(source), 2, 2, 2, gdal.GDT_Float32
            )
            dataset.GetRasterBand(1).WriteArray(
                np.array([[10.0, 20.0], [-5.0, 30.0]], dtype=np.float32)
            )
            alpha = dataset.GetRasterBand(2)
            alpha.SetColorInterpretation(gdal.GCI_AlphaBand)
            alpha.WriteArray(
                np.array([[255.0, 0.0], [255.0, 255.0]], dtype=np.float32)
            )
            dataset.FlushCache()
            dataset = None

            loader.run_clean(source, output)

            cleaned = gdal.Open(str(output), gdal.GA_ReadOnly)
            self.assertIsNotNone(cleaned)
            self.assertEqual(cleaned.RasterCount, 1)
            self.assertEqual(cleaned.GetRasterBand(1).DataType, gdal.GDT_Float32)
            self.assertEqual(cleaned.GetRasterBand(1).GetNoDataValue(), -9999.0)
            np.testing.assert_array_equal(
                cleaned.GetRasterBand(1).ReadAsArray(),
                np.array([[10.0, -9999.0], [-5.0, 30.0]], dtype=np.float32),
            )

    def test_raster_command_keeps_an_entirely_nodata_tile(self) -> None:
        from osgeo import gdal, osr

        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "two_tiles.tif"
            dataset = gdal.GetDriverByName("GTiff").Create(
                str(source), 512, 256, 1, gdal.GDT_Float32
            )
            dataset.SetGeoTransform((195488.0, 1.0, 0.0, 559197.0, 0.0, -1.0))
            crs = osr.SpatialReference()
            crs.ImportFromEPSG(5186)
            dataset.SetSpatialRef(crs)
            band = dataset.GetRasterBand(1)
            band.SetNoDataValue(-9999.0)
            band.Fill(-9999.0)
            band.WriteArray(np.array([[12.5]], dtype=np.float32), 0, 0)
            dataset.FlushCache()
            dataset = None

            result = subprocess.run(
                loader.build_raster_command(source),
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.count("INSERT INTO"), 2)


class ProcessSafetyTest(unittest.TestCase):
    class FakeProcess:
        def __init__(self, returncode: int, stdout: object | None = None) -> None:
            self.returncode = returncode
            self.stdout = stdout

        def wait(self) -> int:
            return self.returncode

    class ClosablePipe:
        def __init__(self) -> None:
            self.closed = False

        def close(self) -> None:
            self.closed = True

    def test_database_environment_requires_explicit_values_and_filters_secrets(self) -> None:
        with self.assertRaises(loader.ConfigurationError):
            loader.build_database_environment({"PGHOST": "db"})

        result = loader.build_database_environment(
            {
                "PGHOST": "db",
                "PGPORT": "5432",
                "PGDATABASE": "ddemachim",
                "PGUSER": "postgres",
                "PGPASSWORD": "secret",
                "UNRELATED_SECRET": "must-not-pass",
            }
        )

        self.assertEqual(
            result,
            {
                "PGHOST": "db",
                "PGPORT": "5432",
                "PGDATABASE": "ddemachim",
                "PGUSER": "postgres",
                "PGPASSWORD": "secret",
            },
        )

    def test_load_uses_checked_no_shell_pipeline_and_closes_parent_pipe(self) -> None:
        calls: list[tuple[list[str], dict[str, object]]] = []
        pipe = self.ClosablePipe()
        processes = [self.FakeProcess(0, pipe), self.FakeProcess(0)]

        def popen(command: list[str], **kwargs: object) -> ProcessSafetyTest.FakeProcess:
            calls.append((command, kwargs))
            return processes.pop(0)

        db_env = {
            "PGHOST": "db",
            "PGPORT": "5432",
            "PGDATABASE": "ddemachim",
            "PGUSER": "postgres",
        }
        loader.load_raster(Path("/work/clean.tif"), db_env, popen=popen)

        self.assertEqual(calls[0][0][-1], "public.dem_jongno")
        self.assertEqual(calls[1][0], ["psql", "-X", "-v", "ON_ERROR_STOP=1"])
        self.assertIs(calls[1][1]["stdin"], pipe)
        self.assertEqual(calls[1][1]["env"], db_env)
        self.assertTrue(all(call[1]["shell"] is False for call in calls))
        self.assertTrue(pipe.closed)

    def test_load_propagates_either_producer_or_consumer_failure(self) -> None:
        db_env = {
            "PGHOST": "db",
            "PGPORT": "5432",
            "PGDATABASE": "ddemachim",
            "PGUSER": "postgres",
        }
        for raster_status, psql_status in ((9, 0), (0, 7)):
            with self.subTest(raster=raster_status, psql=psql_status):
                processes = [
                    self.FakeProcess(raster_status, self.ClosablePipe()),
                    self.FakeProcess(psql_status),
                ]

                def popen(_command: list[str], **_kwargs: object) -> ProcessSafetyTest.FakeProcess:
                    return processes.pop(0)

                with self.assertRaises(loader.LoadError):
                    loader.load_raster(Path("/work/clean.tif"), db_env, popen=popen)

    def test_main_validates_source_before_database_mutation_and_cleans_temp(self) -> None:
        observed_clean_paths: list[Path] = []
        mutation_attempted = False

        def run_clean(_source: Path, output: Path) -> None:
            output.touch()
            observed_clean_paths.append(output)

        def load_raster(_output: Path, _env: dict[str, str]) -> None:
            nonlocal mutation_attempted
            mutation_attempted = True

        environment = {
            "PGHOST": "db",
            "PGPORT": "5432",
            "PGDATABASE": "ddemachim",
            "PGUSER": "postgres",
        }
        with tempfile.TemporaryDirectory() as source_dir:
            source = Path(source_dir) / "source.tif"
            source.touch()
            with (
                mock.patch.object(loader, "require_tools"),
                mock.patch.object(loader, "validate_source", side_effect=loader.ValidationError("bad source")),
                mock.patch.object(loader, "run_clean", side_effect=run_clean),
                mock.patch.object(loader, "validate_clean_output"),
                mock.patch.object(loader, "load_raster", side_effect=load_raster),
            ):
                with self.assertRaises(loader.ValidationError):
                    loader.main([str(source)], environ=environment)

        self.assertFalse(mutation_attempted)
        self.assertEqual(observed_clean_paths, [])

        with tempfile.TemporaryDirectory() as source_dir:
            source = Path(source_dir) / "source.tif"
            source.touch()
            with (
                mock.patch.object(loader, "require_tools"),
                mock.patch.object(
                    loader,
                    "validate_source",
                    return_value=loader.SourceMetadata(6576, 7388, 0),
                ),
                mock.patch.object(loader, "run_clean", side_effect=run_clean),
                mock.patch.object(
                    loader,
                    "validate_clean_output",
                    return_value=loader.CleanMetadata(1, -9999.0),
                ),
                mock.patch.object(loader, "load_raster", side_effect=load_raster),
            ):
                self.assertEqual(loader.main([str(source)], environ=environment), 0)

        self.assertTrue(mutation_attempted)
        self.assertEqual(len(observed_clean_paths), 1)
        self.assertFalse(observed_clean_paths[0].exists())

    def test_tool_preflight_reports_missing_binary_before_work(self) -> None:
        with self.assertRaisesRegex(loader.ToolError, "raster2pgsql"):
            loader.require_tools(which=lambda name: None if name == "raster2pgsql" else f"/usr/bin/{name}")


class LocalDockerExecutorTest(unittest.TestCase):
    class FakeProcess:
        def __init__(self, returncode: int, stdout: object | None = None) -> None:
            self.returncode = returncode
            self.stdout = stdout

        def wait(self) -> int:
            return self.returncode

    class ClosablePipe:
        def __init__(self) -> None:
            self.closed = False

        def close(self) -> None:
            self.closed = True

    def test_local_producer_is_fixed_to_read_only_source_and_ephemeral_work(self) -> None:
        command = loader.build_local_producer_command(
            Path("/Users/yujin/Project/jongro_gu.tif")
        )

        self.assertEqual(
            command,
            [
                "docker",
                "run",
                "--rm",
                "--platform",
                "linux/amd64",
                "--network",
                "ddemachim_default",
                "--mount",
                "type=bind,source=/Users/yujin/Project/jongro_gu.tif,target=/input/jongro_gu.tif,readonly",
                "--mount",
                "type=tmpfs,destination=/work,tmpfs-size=1073741824",
                "-e",
                "DEM_WORK_DIR=/work",
                "ddemachim-dem-loader:pg18-postgis36",
                "--emit-sql",
                "/input/jongro_gu.tif",
            ],
        )

    def test_local_consumer_is_fixed_to_exact_container_and_database(self) -> None:
        self.assertEqual(
            loader.build_local_consumer_command(),
            [
                "docker",
                "exec",
                "-i",
                "ddemachim-db",
                "psql",
                "-X",
                "-U",
                "postgres",
                "-d",
                "ddemachim",
                "-v",
                "ON_ERROR_STOP=1",
            ],
        )

    def test_local_executor_checks_both_no_shell_processes_and_closes_pipe(self) -> None:
        calls: list[tuple[list[str], dict[str, object]]] = []
        pipe = self.ClosablePipe()
        processes = [self.FakeProcess(0, pipe), self.FakeProcess(0)]

        def popen(command: list[str], **kwargs: object) -> LocalDockerExecutorTest.FakeProcess:
            calls.append((command, kwargs))
            return processes.pop(0)

        loader.load_via_local_docker(
            Path("/Users/yujin/Project/jongro_gu.tif"), popen=popen
        )

        self.assertEqual(calls[0][0][0:2], ["docker", "run"])
        self.assertEqual(calls[1][0][0:4], ["docker", "exec", "-i", "ddemachim-db"])
        self.assertIs(calls[1][1]["stdin"], pipe)
        self.assertTrue(all(call[1]["shell"] is False for call in calls))
        self.assertTrue(pipe.closed)

    def test_local_executor_propagates_producer_and_database_failures(self) -> None:
        for producer_status, database_status in ((4, 0), (0, 5)):
            with self.subTest(producer=producer_status, database=database_status):
                processes = [
                    self.FakeProcess(producer_status, self.ClosablePipe()),
                    self.FakeProcess(database_status),
                ]

                def popen(_command: list[str], **_kwargs: object) -> LocalDockerExecutorTest.FakeProcess:
                    return processes.pop(0)

                with self.assertRaises(loader.LoadError):
                    loader.load_via_local_docker(
                        Path("/Users/yujin/Project/jongro_gu.tif"), popen=popen
                    )


if __name__ == "__main__":
    unittest.main()
