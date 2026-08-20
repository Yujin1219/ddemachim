# Blog Trend Persistence Simplification Design

## Goal

Persist only operational run state and frontend-ready Naver Search Trend results. Blog search metadata, post evidence, author counts, keyword analysis, and intermediate aggregates remain transient pipeline data.

## Data Model

`place` remains the single source of truth for place name, address, coordinates, category, phone, image, and external place identity.

`blog_trend_run` stores one logical row per Monday-based collection week. It records `RUNNING`, `SUCCESS`, or `FAILED`, start and finish timestamps, processed and stored-result counts, and a safe failure type for retry diagnostics.

`place_trend_result` stores one frontend-visible result per place and run. It contains only `WATCH` or `TRENDING`, recent and previous Search Trend averages, percentage change, measurement time, and expiry time.

The obsolete `blog_trend_observation`, `place_trend_snapshot`, and `place_trend_keyword` tables and their data are removed. No `place` data is deleted.

## Pipeline

The collector continues to use blog data transiently to discover candidate places. It resolves candidates into `place`, queries Naver Search Trend, and writes only visible final results. Re-running the same week reuses the weekly run row and replaces that run's result rows. A failed write rolls back partial results and records the run as failed.

## Backend

The existing place trend list and place detail APIs remain at their current paths. They read only results belonging to a successful run whose `expires_at` is in the future. Responses expose status, recent average, previous average, percentage change, and measurement time.

## Migration Safety

The migration runs in one PostgreSQL transaction, creates the replacement tables first, then drops only the three obsolete trend tables. It does not alter or delete `place` or unrelated domain tables.
