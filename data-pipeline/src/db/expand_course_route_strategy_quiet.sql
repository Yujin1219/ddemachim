-- Replace the legacy PLEASANT strategy while preserving existing revisions.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.course_revision
    DROP CONSTRAINT IF EXISTS chk_course_revision_route_strategy;

UPDATE public.course_revision SET route_strategy = 'QUIET'
WHERE route_strategy = 'PLEASANT';

ALTER TABLE public.course_revision
    ADD CONSTRAINT chk_course_revision_route_strategy
    CHECK (route_strategy IN ('EASY', 'FAST', 'QUIET'));
COMMIT;
