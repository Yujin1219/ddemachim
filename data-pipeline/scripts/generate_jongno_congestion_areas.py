#!/usr/bin/env python3
"""Generate Jongno-clipped Seoul real-time city data area GeoJSON files."""

from __future__ import annotations

import csv
import json
from argparse import ArgumentParser
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union
from shapely.validation import make_valid


REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_CITY_AREAS_SHP = Path(
    "/Users/yujin/Downloads/서울시 주요 121장소 영역/서울시 주요 121장소 영역.shp"
)
DEFAULT_UMD_SHP = Path(
    "/Users/yujin/Downloads/LSMD_ADM_SECT_UMD_서울/LSMD_ADM_SECT_UMD_11_202607.shp"
)

RESULT_DIR = REPO_ROOT / "data-pipeline" / "results" / "jongno_congestion"
PUBLIC_DATA_DIR = REPO_ROOT / "FE" / "public" / "data"

JONGNO_SGG_CODE = "11110"


def clean_geometry(geometry):
    if geometry.is_empty:
        return geometry
    if geometry.is_valid:
        return geometry
    return make_valid(geometry)


def read_features(path: Path, encoding: str):
    reader = shapefile.Reader(str(path), encoding=encoding)
    fields = [field[0] for field in reader.fields[1:]]
    for record, shp in zip(reader.records(), reader.shapes()):
        properties = dict(zip(fields, record))
        geometry = clean_geometry(shape(shp.__geo_interface__))
        yield properties, geometry


def feature_collection(features):
    return {"type": "FeatureCollection", "features": features}


def write_geojson(path: Path, features):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        json.dump(feature_collection(features), fp, ensure_ascii=False, separators=(",", ":"))
        fp.write("\n")


def parse_args():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument(
        "--city-areas-shp",
        type=Path,
        default=DEFAULT_CITY_AREAS_SHP,
        help="서울시 주요 121장소 영역 SHP path",
    )
    parser.add_argument(
        "--umd-shp",
        type=Path,
        default=DEFAULT_UMD_SHP,
        help="서울 법정동 행정경계 SHP path",
    )
    parser.add_argument(
        "--result-dir",
        type=Path,
        default=RESULT_DIR,
        help="Directory for generated review artifacts",
    )
    parser.add_argument(
        "--public-data-dir",
        type=Path,
        default=PUBLIC_DATA_DIR,
        help="Optional FE public data directory for app-readable GeoJSON",
    )
    parser.add_argument(
        "--skip-public-copy",
        action="store_true",
        help="Only write data-pipeline result artifacts",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    city_to_meter = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True).transform
    meter_to_city = Transformer.from_crs("EPSG:5186", "EPSG:4326", always_xy=True).transform

    jongno_parts = []
    jongno_names = []
    for properties, geometry in read_features(args.umd_shp, "euc-kr"):
        emd_code = str(properties.get("EMD_CD", "")).strip()
        sgg_code = str(properties.get("COL_ADM_SE", "")).strip()
        if sgg_code == JONGNO_SGG_CODE or emd_code.startswith(JONGNO_SGG_CODE):
            jongno_parts.append(geometry)
            jongno_names.append(str(properties.get("EMD_NM", "")).strip())

    if not jongno_parts:
        raise RuntimeError("No Jongno legal-dong polygons found in UMD shapefile.")

    jongno_boundary_meter = clean_geometry(unary_union(jongno_parts))
    jongno_boundary_wgs84 = clean_geometry(transform(meter_to_city, jongno_boundary_meter))

    boundary_feature = {
        "type": "Feature",
        "properties": {
            "sggCode": JONGNO_SGG_CODE,
            "sggName": "종로구",
            "source": args.umd_shp.stem,
            "legalDongCount": len(jongno_parts),
            "legalDongNames": sorted(jongno_names),
        },
        "geometry": mapping(jongno_boundary_wgs84),
    }

    area_features = []
    summary_rows = []
    for properties, geometry_wgs84 in read_features(args.city_areas_shp, "utf-8"):
        area_code = str(properties.get("AREA_CD", "")).strip()
        area_name = str(properties.get("AREA_NM", "")).strip()
        category = str(properties.get("CATEGORY", "")).strip()
        geometry_meter = clean_geometry(transform(city_to_meter, geometry_wgs84))
        clipped_meter = clean_geometry(geometry_meter.intersection(jongno_boundary_meter))
        if clipped_meter.is_empty or clipped_meter.area <= 0:
            continue

        original_area = float(geometry_meter.area)
        clipped_area = float(clipped_meter.area)
        clipped_wgs84 = clean_geometry(transform(meter_to_city, clipped_meter))
        centroid = clipped_wgs84.representative_point()

        area_features.append(
            {
                "type": "Feature",
                "properties": {
                    "areaCode": area_code,
                    "areaName": area_name,
                    "category": category,
                    "district": "종로구",
                    "congestionLevel": "정보없음",
                    "originalAreaM2": round(original_area),
                    "jongnoAreaM2": round(clipped_area),
                    "jongnoOverlapRatio": round(clipped_area / original_area, 4) if original_area else 0,
                    "labelLongitude": round(centroid.x, 7),
                    "labelLatitude": round(centroid.y, 7),
                },
                "geometry": mapping(clipped_wgs84),
            }
        )
        summary_rows.append(
            {
                "areaCode": area_code,
                "areaName": area_name,
                "category": category,
                "originalAreaM2": round(original_area),
                "jongnoAreaM2": round(clipped_area),
                "jongnoOverlapRatio": round(clipped_area / original_area, 4) if original_area else 0,
            }
        )

    area_features.sort(key=lambda feature: feature["properties"]["areaCode"])
    summary_rows.sort(key=lambda row: row["areaCode"])

    write_geojson(args.result_dir / "jongno-boundary.geojson", [boundary_feature])
    write_geojson(args.result_dir / "jongno-city-areas.geojson", area_features)
    if not args.skip_public_copy:
        write_geojson(args.public_data_dir / "jongno-boundary.geojson", [boundary_feature])
        write_geojson(args.public_data_dir / "jongno-city-areas.geojson", area_features)

    args.result_dir.mkdir(parents=True, exist_ok=True)
    with (args.result_dir / "jongno-city-areas-summary.csv").open("w", newline="", encoding="utf-8") as fp:
        writer = csv.DictWriter(
            fp,
            fieldnames=[
                "areaCode",
                "areaName",
                "category",
                "originalAreaM2",
                "jongnoAreaM2",
                "jongnoOverlapRatio",
            ],
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(summary_rows)

    print(f"Jongno legal-dong polygons: {len(jongno_parts)}")
    print(f"Intersecting city-data areas: {len(area_features)}")
    for row in summary_rows:
        print(
            f"{row['areaCode']}\t{row['areaName']}\t{row['category']}\t"
            f"{row['jongnoAreaM2']}m2\t{row['jongnoOverlapRatio']:.2%}"
        )


if __name__ == "__main__":
    main()
