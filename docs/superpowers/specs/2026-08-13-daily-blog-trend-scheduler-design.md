# Daily Blog Trend Scheduler Design

## Goal

Run `data-pipeline/scripts/repeated_blog_trend.py` once every day from the existing Spring Boot scheduler so repeated observations accumulate without manual commands.

## Design

Reuse `DataPipelineSchedulerProperties`, `EventDataPipelineScheduler`, and `PipelineProcessRunner`. Add a `repeated-blog-trend` job configured with:

- script: `scripts/repeated_blog_trend.py`
- cron: `0 30 4 * * *`
- timezone: the existing shared `Asia/Seoul` setting
- timeout: the existing shared 30-minute setting

The Python script already defaults to the current date, 20 search results per query, a 30-body limit, and the persistent repeated-trend output path. No process arguments are required.

The scheduler uses its own `AtomicBoolean` so overlapping runs of this job are skipped inside one backend process. The existing global `enabled` switch disables it together with the other data-pipeline jobs. Multi-instance distributed locking and database persistence are outside this MVP scope.

## Verification

Property tests cover defaults and validation. Scheduler tests prove the configured Python command is delegated and the global disabled switch prevents execution. The focused scheduler tests and complete backend test suite must pass.
