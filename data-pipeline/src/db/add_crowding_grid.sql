BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS crowding_grid (
    id                  bigserial PRIMARY KEY,
    grid_code           varchar(64) UNIQUE NOT NULL,
    grid_x              integer NOT NULL,
    grid_y              integer NOT NULL,
    geometry            geometry(Polygon, 4326) NOT NULL,
    center_latitude     double precision NOT NULL,
    center_longitude    double precision NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_crowding_grid_coordinates UNIQUE (grid_x, grid_y)
);

CREATE INDEX IF NOT EXISTS idx_crowding_grid_geometry
    ON crowding_grid USING gist (geometry);

COMMIT;
