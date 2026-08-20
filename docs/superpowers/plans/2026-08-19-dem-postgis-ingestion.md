# Jongno DEM PostGIS Ingestion Implementation Plan


**Goal:** Reproducibly validate, clean, tile, and idempotently replace `public.dem_jongno` with the one-metre Jongno elevation band from `/Users/yujin/Project/jongro_gu.tif`.

**Architecture:** A Python entry point validates the source grid and semantic EPSG:5186 equivalence through GDAL/OSR before any database command. It materializes one Float32 band with alpha-zero cells set to `-9999`, streams fixed in-db `raster2pgsql` SQL to `psql` with checked producer and consumer statuses, and exposes a Docker image containing compatible GDAL, PostGIS client, and PostgreSQL client tools.

**Tech Stack:** Python 3.12, `unittest`, GDAL/OSR, `gdal_calc.py`, `raster2pgsql`, PostgreSQL 18 client, PostGIS 3.6 raster, Docker.

**Spec:** `docs/superpowers/specs/2026-08-18-course-preview-engine-design.md`

## Global Constraints

- The destination is hardcoded as exactly `public.dem_jongno`; no schema or table override is accepted.
- Preserve the 6576×7388 north-up grid, one-metre pixel size, and semantic EPSG:5186 CRS; load only Float32 elevation band 1.
- Materialize alpha-band-zero/outside pixels as `NoData=-9999`; reject any valid elevation pixel already equal to `-9999`.
- Use in-db 256×256 tiles with `raster2pgsql -s 5186 -b 1 -t 256x256 -d -I -C -M -k`; `-k` preserves all-NoData tiles so the full grid remains 754 rows/48,583,488 stored pixels. Never use `-R`, `-e`, `CASCADE`, wildcard cleanup, extension/schema mutations, or unrelated staging tables.
- Default network mode reads database configuration only from the explicit process environment; the fixed local fallback streams through `docker exec -i ddemachim-db psql -U postgres -d ddemachim` without reading credentials. Never load `.env` or print credentials.
- Do not copy or commit the 388 MB source or cleaned derivative; mount the source read-only and auto-clean temporary output.
- Replacement may mutate only `public.dem_jongno` and must be safe to repeat.

---

### Task 1: Lock the validation and command contracts with behavior tests

**Files:**
- Create: `data-pipeline/tests/test_load_dem_postgis.py`
- Create later: `data-pipeline/scripts/load_dem_postgis.py`

**Interfaces:**
- Consumes: mocked `osgeo.gdal`/`osgeo.osr` dataset metadata and injected subprocess functions.
- Produces: tests for `validate_source(path)`, `build_clean_command(source, output)`, `build_raster_command(output)`, `load_raster(output, env)`, `require_tools()`, and `main(argv)`.

- [ ] **Step 1: Write behavior-level failing tests**

```python
def test_raster_command_is_fixed_in_db_and_constrained():
    command = loader.build_raster_command(Path("/tmp/clean.tif"))
    assert command == ["raster2pgsql", "-s", "5186", "-b", "1", "-t", "256x256", "-d", "-I", "-C", "-M", "-k", "/tmp/clean.tif", "public.dem_jongno"]
    assert "-R" not in command and "-e" not in command and "CASCADE" not in command
```

Also cover wrong dimensions/geotransform/CRS/bands before mutation, alpha cleaning and output validation, valid `-9999` rejection, locked target/no override, `shell=False`, producer/consumer failure propagation, and temporary-file cleanup.

- [ ] **Step 2: Run tests and record the expected RED**

Run: `cd data-pipeline && python3 -m unittest -v tests.test_load_dem_postgis`

Expected: assertions fail because the wished-for functions explicitly raise `NotImplementedError`; an import/missing-module error alone is not accepted.

### Task 2: Implement the minimal validated loader and tool image

**Files:**
- Create: `data-pipeline/scripts/load_dem_postgis.py`
- Create: `data-pipeline/docker/dem-loader.Dockerfile`
- Test: `data-pipeline/tests/test_load_dem_postgis.py`

**Interfaces:**
- Consumes: a source path argument plus explicit `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and optional `PGPASSWORD`.
- Produces: exit 0 only after validated source, validated cleaned derivative, and checked `raster2pgsql | psql -v ON_ERROR_STOP=1` completion.

- [ ] **Step 1: Implement strict metadata validation**

```python
EXPECTED_SIZE = (6576, 7388)
EXPECTED_GEOTRANSFORM = (195488.0, 1.0, 0.0, 559197.0, 0.0, -1.0)
TARGET_TABLE = "public.dem_jongno"
NODATA = -9999.0
```

Use `osr.SpatialReference.IsSame()` against `ImportFromEPSG(5186)`, require band 1 `GDT_Float32`, band 2 alpha interpretation, and inspect valid band-1 cells for an existing `-9999` before any database process starts.

- [ ] **Step 2: Implement deterministic cleaning and post-clean validation**

Run `gdal_calc.py -A <source> --A_band 1 -B <source> --B_band 2 --calc 'where(B==0,-9999,A)' --type Float32 --NoDataValue -9999 --co TILED=YES --co COMPRESS=DEFLATE --outfile <clean>`, then reopen the derivative and verify its exact size, transform, semantic CRS, one Float32 band, and NoData value.

- [ ] **Step 3: Implement the checked load pipeline**

```python
raster = subprocess.Popen(raster_command, stdout=subprocess.PIPE, shell=False)
psql = subprocess.Popen(psql_command, stdin=raster.stdout, shell=False, env=db_env)
```

Close the parent copy of the pipe, wait for both processes, and raise on either nonzero status. Preflight `gdalinfo`, `gdal_calc.py`, `raster2pgsql`, and `psql`; clean the temporary directory through `TemporaryDirectory` on success and failure.

- [ ] **Step 4: Pin the compatible operational image**

Use `postgis/postgis:18-3.6` and install the matching PostgreSQL/PostGIS client plus GDAL Python bindings; fail the image build if all four required tools and `osgeo` cannot be imported.

- [ ] **Step 5: Run focused GREEN and the full data suite**

Run: `cd data-pipeline && python3 -m unittest -v tests.test_load_dem_postgis`

Run: `cd data-pipeline && python3 -m unittest discover -s tests -v`

Expected: all tests pass with no database or network access.

### Task 3: Document and execute the repeatable operation

**Files:**
- Modify: `data-pipeline/README.md`
- Use without committing: `/Users/yujin/Project/jongro_gu.tif`

**Interfaces:**
- Consumes: the Docker image, read-only source mount, temporary writable work directory, DB network, and explicit PostgreSQL environment.
- Produces: `public.dem_jongno` only, with observable verification evidence.

- [ ] **Step 1: Record pre-load inventory**

Run read-only queries for installed extensions and the sorted inventory of non-target `public` relations and record stable hashes/counts; confirm `public.dem_jongno` is absent or the sole replace target.

- [ ] **Step 2: Build the temporary loader image**

Run: `docker build -f data-pipeline/docker/dem-loader.Dockerfile -t ddemachim-dem-loader:pg18-postgis36 data-pipeline`

- [ ] **Step 3: Load twice**

Run the image twice with `/Users/yujin/Project/jongro_gu.tif:/input/jongro_gu.tif:ro`, an ephemeral writable `/work`, and the `ddemachim_default` network. Use explicit `PG*` variables when available; otherwise run `python3 data-pipeline/scripts/load_dem_postgis.py --local-docker-exec /Users/yujin/Project/jongro_gu.tif`, whose fixed checked pipe targets only `ddemachim-db`/`ddemachim`. Each run must exit 0.

- [ ] **Step 4: Verify live raster invariants after each run**

Query extensions, `raster_columns`, SRID, width/height/block bounds, scale/skew, band count/pixel type/NoData, exact extent, tile and total-grid-pixel counts (`754`, `48,583,488`), include/exclude-NoData counts, valid elevation statistics, GiST index, raster constraints, and total relation size.

- [ ] **Step 5: Prove the second run is idempotent and scoped**

Compare both invariant snapshots and confirm the non-target relation and extension inventories are identical before and after; only `public.dem_jongno` may be replaced.

- [ ] **Step 6: Run final quality checks**

Run: `git diff --check`

Run: `git diff -- data-pipeline docs/superpowers/plans/2026-08-19-dem-postgis-ingestion.md`

Expected: no whitespace errors, no TIFF/derivative in the diff, and only the five assigned files changed.
