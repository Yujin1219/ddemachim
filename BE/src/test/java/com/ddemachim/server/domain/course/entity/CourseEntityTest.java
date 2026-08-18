package com.ddemachim.server.domain.course.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseReplanReason;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.ddemachim.server.domain.course.enums.CourseStatus;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.UserPlace;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class CourseEntityTest {

    @Test
    void courseFactoryInitializesReadyStateAndOptimisticVersion() {
        Course course = Course.create(member(1L), "서울 하루 코스");

        assertThat(course.getStatus()).isEqualTo(CourseStatus.READY);
        assertThat(course.getCurrentRevision()).isNull();
        assertThat(course.getPlannedStopCount()).isZero();
        assertThat(course.getVersion()).isZero();
    }

    @Test
    void courseFactoryRejectsMissingRequiredValues() {
        Member member = member(1L);

        assertThatIllegalArgumentException().isThrownBy(() -> Course.create(null, "서울 하루 코스"));
        assertThatIllegalArgumentException().isThrownBy(() -> Course.create(member, null));
    }

    @Test
    void revisionFactoryPreservesSelectedRouteAndStartSnapshot() {
        Course course = Course.create(member(1L), "서울 하루 코스");

        CourseRevision revision = revision(course, 1, CourseStartType.SEARCHED_PLACE, "서울역");

        assertThat(revision.getCourse()).isSameAs(course);
        assertThat(revision.getRevisionNo()).isEqualTo(1);
        assertThat(revision.getRouteStrategy()).isEqualTo(CourseRouteStrategy.PLEASANT);
        assertThat(revision.getServiceDate()).isEqualTo(LocalDate.of(2026, 8, 18));
        assertThat(revision.getDesiredStartTime()).isEqualTo(LocalTime.of(10, 0));
        assertThat(revision.getDesiredEndTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(revision.getStartType()).isEqualTo(CourseStartType.SEARCHED_PLACE);
        assertThat(revision.getStartName()).isEqualTo("서울역");
        assertThat(revision.getStartLatitude()).isEqualTo(37.5547);
        assertThat(revision.getStartLongitude()).isEqualTo(126.9707);
        assertThat(revision.getAlgorithmVersion()).isEqualTo("course-v1");
        assertThat(revision.getReplanReason()).isEqualTo(CourseReplanReason.INITIAL);
    }

    @Test
    void revisionFactoryRejectsInvalidRevisionScheduleAndStartSnapshot() {
        Course course = Course.create(member(1L), "서울 하루 코스");

        assertThatIllegalArgumentException()
                .isThrownBy(() -> CourseRevision.create(
                        course,
                        0,
                        CourseRouteStrategy.EASY,
                        LocalDate.of(2026, 8, 18),
                        LocalTime.of(10, 0),
                        LocalTime.of(18, 0),
                        CourseStartType.CURRENT_LOCATION,
                        null,
                        37.5547,
                        126.9707,
                        "course-v1",
                        CourseReplanReason.INITIAL));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> CourseRevision.create(
                        course,
                        1,
                        CourseRouteStrategy.EASY,
                        LocalDate.of(2026, 8, 18),
                        LocalTime.of(18, 0),
                        LocalTime.of(18, 0),
                        CourseStartType.CURRENT_LOCATION,
                        null,
                        37.5547,
                        126.9707,
                        "course-v1",
                        CourseReplanReason.INITIAL));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> revision(course, 1, CourseStartType.SEARCHED_PLACE, null));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> CourseRevision.create(
                        course,
                        1,
                        CourseRouteStrategy.EASY,
                        LocalDate.of(2026, 8, 18),
                        LocalTime.of(10, 0),
                        LocalTime.of(18, 0),
                        CourseStartType.CURRENT_LOCATION,
                        null,
                        Double.NaN,
                        126.9707,
                        "course-v1",
                        CourseReplanReason.INITIAL));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> CourseRevision.create(
                        course,
                        1,
                        CourseRouteStrategy.EASY,
                        LocalDate.of(2026, 8, 18),
                        LocalTime.of(10, 0),
                        LocalTime.of(18, 0),
                        CourseStartType.CURRENT_LOCATION,
                        null,
                        37.5547,
                        181.0,
                        "course-v1",
                        CourseReplanReason.INITIAL));
    }

    @Test
    void changeCurrentRevisionUpdatesPointerAndCountTogether() {
        Course course = Course.create(member(1L), "서울 하루 코스");
        CourseRevision revision = revision(course, 1, CourseStartType.CURRENT_LOCATION, null);

        course.changeCurrentRevision(revision, 3);

        assertThat(course.getCurrentRevision()).isSameAs(revision);
        assertThat(course.getPlannedStopCount()).isEqualTo(3);
        assertThat(course.getVersion()).isZero();
    }

    @Test
    void changeCurrentRevisionAcceptsSamePersistedCourseIdentity() {
        Course course = Course.create(member(1L), "서울 하루 코스");
        Course detachedCourse = Course.create(member(1L), "서울 하루 코스");
        ReflectionTestUtils.setField(course, "id", 10L);
        ReflectionTestUtils.setField(detachedCourse, "id", 10L);
        CourseRevision revision = revision(detachedCourse, 2, CourseStartType.CURRENT_LOCATION, null);

        course.changeCurrentRevision(revision, 2);

        assertThat(course.getCurrentRevision()).isSameAs(revision);
        assertThat(course.getPlannedStopCount()).isEqualTo(2);
    }

    @Test
    void rejectedRevisionChangeLeavesExistingPointerAndCountUntouched() {
        Course course = Course.create(member(1L), "서울 하루 코스");
        CourseRevision current = revision(course, 1, CourseStartType.CURRENT_LOCATION, null);
        course.changeCurrentRevision(current, 2);
        Course foreignCourse = Course.create(member(2L), "다른 코스");
        CourseRevision foreignRevision = revision(foreignCourse, 1, CourseStartType.CURRENT_LOCATION, null);

        assertThatIllegalArgumentException()
                .isThrownBy(() -> course.changeCurrentRevision(foreignRevision, 4));
        assertThat(course.getCurrentRevision()).isSameAs(current);
        assertThat(course.getPlannedStopCount()).isEqualTo(2);

        CourseRevision next = revision(course, 2, CourseStartType.CURRENT_LOCATION, null);
        assertThatIllegalArgumentException().isThrownBy(() -> course.changeCurrentRevision(next, -1));
        assertThat(course.getCurrentRevision()).isSameAs(current);
        assertThat(course.getPlannedStopCount()).isEqualTo(2);

        assertThatIllegalArgumentException().isThrownBy(() -> course.changeCurrentRevision(null, 3));
        assertThat(course.getCurrentRevision()).isSameAs(current);
        assertThat(course.getPlannedStopCount()).isEqualTo(2);
    }

    @Test
    void placeStopFactoryPreservesSourceAndScheduleSnapshotsWithDefaultBuffer() {
        CourseRevision revision = revision(
                Course.create(member(1L), "서울 하루 코스"),
                1,
                CourseStartType.CURRENT_LOCATION,
                null);
        Place place = new TestPlace();

        CourseStop stop = CourseStop.forPlace(
                revision,
                1,
                101L,
                place,
                "경복궁",
                "서울 종로구 사직로 161",
                37.5776,
                126.9769,
                60,
                90,
                CourseDwellSource.USER_MODIFIED,
                LocalTime.of(13, 0),
                LocalTime.of(11, 0),
                LocalTime.of(12, 30),
                20,
                1400,
                new BigDecimal("12.50"),
                new BigDecimal("35.25"),
                CourseHoursSourceType.REAL,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0),
                null,
                null);

        assertThat(stop.getCourseRevision()).isSameAs(revision);
        assertThat(stop.getSequenceNo()).isEqualTo(1);
        assertThat(stop.getSourceBasketItemId()).isEqualTo(101L);
        assertThat(stop.getPlace()).isSameAs(place);
        assertThat(stop.getUserPlace()).isNull();
        assertThat(stop.getPlaceNameSnapshot()).isEqualTo("경복궁");
        assertThat(stop.getDwellMinutes()).isEqualTo(90);
        assertThat(stop.getArrivalBufferMinutes()).isEqualTo(10);
        assertThat(stop.getCongestionScoreSnapshot()).isEqualByComparingTo("35.25");
    }

    @Test
    void userPlaceStopFactoryPreservesMemberOwnedSourceSnapshot() {
        CourseRevision revision = revision(
                Course.create(member(1L), "서울 하루 코스"),
                1,
                CourseStartType.CURRENT_LOCATION,
                null);
        UserPlace userPlace = userPlace(member(1L));

        CourseStop stop = CourseStop.forUserPlace(
                revision,
                2,
                null,
                userPlace,
                "카카오 장소",
                null,
                37.5,
                127.0,
                60,
                60,
                CourseDwellSource.DEFAULT,
                null,
                LocalTime.of(13, 0),
                LocalTime.of(14, 0),
                10,
                800,
                null,
                null,
                CourseHoursSourceType.DEMO_DEFAULT,
                LocalTime.of(9, 0),
                LocalTime.of(22, 0),
                null,
                null);

        assertThat(stop.getPlace()).isNull();
        assertThat(stop.getUserPlace()).isSameAs(userPlace);
        assertThat(stop.getAddressSnapshot()).isNull();
        assertThat(stop.getDwellSource()).isEqualTo(CourseDwellSource.DEFAULT);
        assertThat(stop.getHoursSourceType()).isEqualTo(CourseHoursSourceType.DEMO_DEFAULT);
    }

    @Test
    void stopFactoriesRejectMissingSourceAndInvalidScheduleMetrics() {
        CourseRevision revision = revision(
                Course.create(member(1L), "서울 하루 코스"),
                1,
                CourseStartType.CURRENT_LOCATION,
                null);

        assertThatIllegalArgumentException().isThrownBy(() -> placeStop(revision, null, 1, 60, 60,
                37.5, 127.0, LocalTime.of(10, 0), LocalTime.of(11, 0), 0, 0, null));
        assertThatIllegalArgumentException().isThrownBy(() -> placeStop(revision, new TestPlace(), 0, 60, 60,
                37.5, 127.0, LocalTime.of(10, 0), LocalTime.of(11, 0), 0, 0, null));
        assertThatIllegalArgumentException().isThrownBy(() -> placeStop(revision, new TestPlace(), 1, 0, 60,
                37.5, 127.0, LocalTime.of(10, 0), LocalTime.of(11, 0), 0, 0, null));
        assertThatIllegalArgumentException().isThrownBy(() -> placeStop(revision, new TestPlace(), 1, 60, 1441,
                37.5, 127.0, LocalTime.of(10, 0), LocalTime.of(11, 0), 0, 0, null));
        assertThatIllegalArgumentException().isThrownBy(() -> placeStop(revision, new TestPlace(), 1, 60, 60,
                91.0, 127.0, LocalTime.of(10, 0), LocalTime.of(11, 0), 0, 0, null));
        assertThatIllegalArgumentException().isThrownBy(() -> placeStop(revision, new TestPlace(), 1, 60, 60,
                37.5, 127.0, LocalTime.of(11, 0), LocalTime.of(10, 0), 0, 0, null));
        assertThatIllegalArgumentException().isThrownBy(() -> placeStop(revision, new TestPlace(), 1, 60, 60,
                37.5, 127.0, LocalTime.of(10, 0), LocalTime.of(11, 0), -1, 0, null));
        assertThatIllegalArgumentException().isThrownBy(() -> placeStop(revision, new TestPlace(), 1, 60, 60,
                37.5, 127.0, LocalTime.of(10, 0), LocalTime.of(11, 0), 0, -1, null));
        assertThatIllegalArgumentException().isThrownBy(() -> placeStop(revision, new TestPlace(), 1, 60, 60,
                37.5, 127.0, LocalTime.of(10, 0), LocalTime.of(11, 0), 0, 0, new BigDecimal("100.01")));
    }

    private static CourseRevision revision(
            Course course, int revisionNo, CourseStartType startType, String startName) {
        return CourseRevision.create(
                course,
                revisionNo,
                CourseRouteStrategy.PLEASANT,
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                startType,
                startName,
                37.5547,
                126.9707,
                "course-v1",
                CourseReplanReason.INITIAL);
    }

    private static CourseStop placeStop(
            CourseRevision revision,
            Place place,
            int sequenceNo,
            int defaultDwellMinutes,
            int dwellMinutes,
            double latitude,
            double longitude,
            LocalTime arrival,
            LocalTime departure,
            int travelMinutes,
            int travelDistance,
            BigDecimal congestionScore) {
        return CourseStop.forPlace(
                revision,
                sequenceNo,
                null,
                place,
                "장소",
                null,
                latitude,
                longitude,
                defaultDwellMinutes,
                dwellMinutes,
                CourseDwellSource.DEFAULT,
                null,
                arrival,
                departure,
                travelMinutes,
                travelDistance,
                null,
                congestionScore,
                CourseHoursSourceType.REAL,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0),
                null,
                null);
    }

    private static Member member(Long id) {
        Member member = Member.create("member" + id + "@example.com", "encoded", "member" + id, Role.USER);
        ReflectionTestUtils.setField(member, "id", id);
        return member;
    }

    private static UserPlace userPlace(Member member) {
        return UserPlace.createKakao(
                member,
                "27560651",
                "경복궁",
                "여행 > 관광,명소 > 궁궐",
                "AT4",
                "서울 종로구 사직로 161",
                "서울 종로구 세종로 1-1",
                126.976896737645,
                37.5776087830657,
                "02-3700-3900");
    }

    private static class TestPlace extends Place {}
}
