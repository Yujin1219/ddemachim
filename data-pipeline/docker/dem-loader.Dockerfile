FROM postgis/postgis:18-3.6@sha256:93edcf470afb105e34d83bab74296537f63e773eda55026bd1bebbb5326c8a96

ARG POSTGIS_TOOLS_VERSION=3.6.4+dfsg-2.pgdg13+1
ARG GDAL_VERSION=3.13.2+dfsg-1.pgdg13+1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        "postgis=${POSTGIS_TOOLS_VERSION}" \
        "gdal-bin=${GDAL_VERSION}" \
        "python3-gdal=${GDAL_VERSION}" \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY scripts/load_dem_postgis.py /app/scripts/load_dem_postgis.py

RUN command -v gdalinfo \
    && command -v gdal_calc.py \
    && command -v raster2pgsql \
    && command -v psql \
    && python3 -c "from osgeo import gdal, osr; import numpy"

ENTRYPOINT ["python3", "/app/scripts/load_dem_postgis.py"]
