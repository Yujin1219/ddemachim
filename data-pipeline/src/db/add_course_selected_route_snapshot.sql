-- Preserve the exact route selected for each stop without rewriting existing courses.
ALTER TABLE course_stop
    ADD COLUMN IF NOT EXISTS selected_route_snapshot jsonb;
