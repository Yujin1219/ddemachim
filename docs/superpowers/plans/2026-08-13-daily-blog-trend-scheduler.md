# Daily Blog Trend Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily Spring job that executes the repeated blog trend Python pipeline.

**Architecture:** Extend the existing data-pipeline job properties and scheduler instead of introducing a second scheduling mechanism. Reuse the existing process runner, timeout, working directory, logging, and overlap protection.

**Tech Stack:** Java 21, Spring Boot scheduling, JUnit 5, Mockito, AssertJ, Python subprocess.

## Global Constraints

- Preserve unrelated backend and frontend changes.
- Do not read or expose credentials.
- Run at `04:30 Asia/Seoul` once per day.
- Do not add process arguments because the Python script defaults match the daily job.

---

### Task 1: Scheduler Contract Tests

**Files:**
- Modify: `BE/src/test/java/com/ddemachim/server/global/properties/DataPipelineSchedulerPropertiesTest.java`
- Modify: `BE/src/test/java/com/ddemachim/server/domain/event/scheduler/EventDataPipelineSchedulerTest.java`

- [ ] Add failing assertions for the daily cron and `scripts/repeated_blog_trend.py` default.
- [ ] Add a failing scheduler test that captures the `repeated-blog-trend` process command.
- [ ] Run both test classes and confirm failures come from the missing job contract.

### Task 2: Daily Job Implementation

**Files:**
- Modify: `BE/src/main/java/com/ddemachim/server/global/properties/DataPipelineSchedulerProperties.java`
- Modify: `BE/src/main/java/com/ddemachim/server/domain/event/scheduler/EventDataPipelineScheduler.java`
- Modify: `BE/src/main/resources/application.yaml`

- [ ] Add the default job, validation, getter, and relaxed-binding setter.
- [ ] Add a dedicated overlap flag and `@Scheduled` method using the shared timezone.
- [ ] Add the explicit application configuration.
- [ ] Run both focused test classes and confirm they pass.

### Task 3: Verification

**Files:**
- Verify all files from Tasks 1 and 2.

- [ ] Run `./gradlew test --tests '*DataPipelineSchedulerPropertiesTest' --tests '*EventDataPipelineSchedulerTest'` from `BE`.
- [ ] Run `./gradlew test` from `BE`.
- [ ] Run `git diff --check` for the changed scheduler files.
