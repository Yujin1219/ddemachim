-- Keep existing revisions while extending the strategy check used by new course previews.
ALTER TABLE course_revision
    DROP CONSTRAINT IF EXISTS chk_course_revision_route_strategy;

ALTER TABLE course_revision
    ADD CONSTRAINT chk_course_revision_route_strategy
    CHECK (route_strategy IN ('EASY', 'FAST', 'QUIET', 'PLEASANT'));
