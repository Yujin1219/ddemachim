-- Add the default visit duration to both catalog-backed and member-owned places.
ALTER TABLE place
    ADD COLUMN IF NOT EXISTS default_dwell_minutes integer NOT NULL DEFAULT 60;

ALTER TABLE user_place
    ADD COLUMN IF NOT EXISTS default_dwell_minutes integer NOT NULL DEFAULT 60;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_place_default_dwell_minutes'
          AND conrelid = 'place'::regclass
    ) THEN
        ALTER TABLE place
            ADD CONSTRAINT chk_place_default_dwell_minutes
            CHECK (default_dwell_minutes BETWEEN 1 AND 1440);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_user_place_default_dwell_minutes'
          AND conrelid = 'user_place'::regclass
    ) THEN
        ALTER TABLE user_place
            ADD CONSTRAINT chk_user_place_default_dwell_minutes
            CHECK (default_dwell_minutes BETWEEN 1 AND 1440);
    END IF;
END
$$;

-- A course is the stable member-owned aggregate. The revision pointer is added
-- after course_revision exists to avoid a creation-order cycle.
CREATE TABLE IF NOT EXISTS course (
    id                  bigserial NOT NULL,
    member_id           bigint NOT NULL,
    title               varchar(200) NOT NULL,
    status              varchar(20) NOT NULL,
    planned_stop_count  integer NOT NULL DEFAULT 0,
    version             bigint NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pk_course'
          AND conrelid = 'course'::regclass
    ) THEN
        ALTER TABLE course
            ADD CONSTRAINT pk_course PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_course_member'
          AND conrelid = 'course'::regclass
    ) THEN
        ALTER TABLE course
            ADD CONSTRAINT fk_course_member
            FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_status'
          AND conrelid = 'course'::regclass
    ) THEN
        ALTER TABLE course
            ADD CONSTRAINT chk_course_status
            CHECK (status IN ('READY', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_planned_stop_count'
          AND conrelid = 'course'::regclass
    ) THEN
        ALTER TABLE course
            ADD CONSTRAINT chk_course_planned_stop_count
            CHECK (planned_stop_count >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_version'
          AND conrelid = 'course'::regclass
    ) THEN
        ALTER TABLE course
            ADD CONSTRAINT chk_course_version
            CHECK (version >= 0);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_course_member_updated_at
    ON course (member_id, updated_at DESC);

-- Revisions are immutable snapshots of the selected route and its inputs.
CREATE TABLE IF NOT EXISTS course_revision (
    id                  bigserial NOT NULL,
    course_id           bigint NOT NULL,
    revision_no         integer NOT NULL,
    route_strategy      varchar(20) NOT NULL,
    service_date        date NOT NULL,
    desired_start_time  time NOT NULL,
    desired_end_time    time NOT NULL,
    start_type          varchar(30) NOT NULL,
    start_name          varchar(200),
    start_latitude      double precision NOT NULL,
    start_longitude     double precision NOT NULL,
    algorithm_version   varchar(50) NOT NULL,
    replan_reason       varchar(30) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pk_course_revision'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT pk_course_revision PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_course_revision_course'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT fk_course_revision_course
            FOREIGN KEY (course_id) REFERENCES course(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_course_revision_course_revision_no'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT uq_course_revision_course_revision_no
            UNIQUE (course_id, revision_no);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_revision_revision_no'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT chk_course_revision_revision_no
            CHECK (revision_no >= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_revision_route_strategy'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT chk_course_revision_route_strategy
            CHECK (route_strategy IN ('EASY', 'FAST', 'PLEASANT'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_revision_desired_time_range'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT chk_course_revision_desired_time_range
            CHECK (desired_end_time > desired_start_time);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_revision_start_type'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT chk_course_revision_start_type
            CHECK (start_type IN ('CURRENT_LOCATION', 'SEARCHED_PLACE'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_revision_start_name'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT chk_course_revision_start_name
            CHECK (start_type <> 'SEARCHED_PLACE' OR start_name IS NOT NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_revision_latitude'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT chk_course_revision_latitude
            CHECK (start_latitude BETWEEN -90.0 AND 90.0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_revision_longitude'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT chk_course_revision_longitude
            CHECK (start_longitude BETWEEN -180.0 AND 180.0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_revision_replan_reason'
          AND conrelid = 'course_revision'::regclass
    ) THEN
        ALTER TABLE course_revision
            ADD CONSTRAINT chk_course_revision_replan_reason
            CHECK (replan_reason IN ('INITIAL', 'DWELL_OVERRUN', 'USER_EDIT'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_course_revision_course_revision_no
    ON course_revision (course_id, revision_no DESC);

-- Stops retain snapshots so deleting source records never removes route history.
CREATE TABLE IF NOT EXISTS course_stop (
    id                              bigserial NOT NULL,
    course_revision_id              bigint NOT NULL,
    sequence_no                     integer NOT NULL,
    source_basket_item_id           bigint,
    place_id                        bigint,
    user_place_id                   bigint,
    place_name_snapshot             varchar(200) NOT NULL,
    address_snapshot                text,
    latitude_snapshot               double precision NOT NULL,
    longitude_snapshot              double precision NOT NULL,
    default_dwell_minutes           integer NOT NULL,
    dwell_minutes                   integer NOT NULL,
    dwell_source                    varchar(20) NOT NULL,
    arrival_deadline                time,
    arrival_buffer_minutes          integer NOT NULL DEFAULT 10,
    scheduled_arrival               time NOT NULL,
    scheduled_departure             time NOT NULL,
    travel_minutes_from_previous    integer NOT NULL,
    travel_distance_meters          integer NOT NULL,
    ascent_meters                   numeric(10,2),
    congestion_score_snapshot       numeric(5,2),
    hours_source_type               varchar(20) NOT NULL,
    open_time_snapshot              time NOT NULL,
    close_time_snapshot             time NOT NULL,
    event_id                        bigint,
    event_end_time_snapshot         time,
    created_at                      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pk_course_stop'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT pk_course_stop PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_course_stop_revision'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT fk_course_stop_revision
            FOREIGN KEY (course_revision_id) REFERENCES course_revision(id)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_course_stop_place'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT fk_course_stop_place
            FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_course_stop_user_place'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT fk_course_stop_user_place
            FOREIGN KEY (user_place_id) REFERENCES user_place(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_course_stop_event'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT fk_course_stop_event
            FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_course_stop_revision_sequence'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT uq_course_stop_revision_sequence
            UNIQUE (course_revision_id, sequence_no);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_sequence_no'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_sequence_no
            CHECK (sequence_no >= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_at_most_one_place'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_at_most_one_place
            CHECK (place_id IS NULL OR user_place_id IS NULL);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_latitude'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_latitude
            CHECK (latitude_snapshot BETWEEN -90.0 AND 90.0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_longitude'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_longitude
            CHECK (longitude_snapshot BETWEEN -180.0 AND 180.0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_default_dwell_minutes'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_default_dwell_minutes
            CHECK (default_dwell_minutes BETWEEN 1 AND 1440);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_dwell_minutes'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_dwell_minutes
            CHECK (dwell_minutes BETWEEN 1 AND 1440);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_dwell_source'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_dwell_source
            CHECK (dwell_source IN ('DEFAULT', 'USER_MODIFIED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_arrival_buffer_minutes'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_arrival_buffer_minutes
            CHECK (arrival_buffer_minutes BETWEEN 0 AND 1440);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_schedule'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_schedule
            CHECK (scheduled_departure >= scheduled_arrival);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_travel_minutes'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_travel_minutes
            CHECK (travel_minutes_from_previous >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_travel_distance'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_travel_distance
            CHECK (travel_distance_meters >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_congestion_score'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_congestion_score
            CHECK (
                congestion_score_snapshot IS NULL
                OR congestion_score_snapshot BETWEEN 0.0 AND 100.0
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_course_stop_hours_source_type'
          AND conrelid = 'course_stop'::regclass
    ) THEN
        ALTER TABLE course_stop
            ADD CONSTRAINT chk_course_stop_hours_source_type
            CHECK (hours_source_type IN ('REAL', 'DEMO_DEFAULT'));
    END IF;
END
$$;

-- Add the current revision pointer only after the referenced table exists.
ALTER TABLE course
    ADD COLUMN IF NOT EXISTS current_revision_id bigint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_course_current_revision'
          AND conrelid = 'course'::regclass
    ) THEN
        ALTER TABLE course
            ADD CONSTRAINT fk_course_current_revision
            FOREIGN KEY (current_revision_id) REFERENCES course_revision(id)
            ON DELETE SET NULL;
    END IF;
END
$$;
