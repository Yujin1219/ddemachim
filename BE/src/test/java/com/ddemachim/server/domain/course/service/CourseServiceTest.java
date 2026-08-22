package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.dto.CourseCreateRequest;
import com.ddemachim.server.domain.course.dto.CourseDetailResponse;
import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.dto.CourseStartRequest;
import com.ddemachim.server.domain.course.entity.Course;
import com.ddemachim.server.domain.course.entity.CourseRevision;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.enums.CourseStartTiming;
import com.ddemachim.server.domain.course.enums.CourseStartType;
import com.ddemachim.server.domain.course.enums.CourseStatus;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.repository.CourseRepository;
import com.ddemachim.server.domain.course.repository.CourseRevisionRepository;
import com.ddemachim.server.domain.course.repository.CourseStopRepository;
import com.ddemachim.server.domain.course.repository.CourseBasketItemRepository;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import tools.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class CourseServiceTest {

    @Mock MemberRepository memberRepository;
    @Mock CourseRepository courseRepository;
    @Mock CourseRevisionRepository courseRevisionRepository;
    @Mock CourseStopRepository courseStopRepository;
    @Mock CourseBasketItemRepository courseBasketItemRepository;
    @Mock CoursePreviewService coursePreviewService;
    @Mock CoursePreviewInputResolver inputResolver;

    private CourseService service;
    private Member member;

    @BeforeEach
    void setUp() {
        member = Member.create("course@example.com", "encoded", "course-user", Role.USER);
        ReflectionTestUtils.setField(member, "id", 3L);
        service = new CourseService(
                memberRepository,
                courseRepository,
                courseRevisionRepository,
                courseStopRepository,
                courseBasketItemRepository,
                coursePreviewService,
                inputResolver,
                new ObjectMapper(),
                Clock.fixed(Instant.parse("2026-08-20T00:35:00Z"), ZoneId.of("Asia/Seoul")));
    }

    @Test
    void savesSelectedCourseAsReadyForScheduledTiming() {
        stubCreation();

        CourseDetailResponse result = service.create(3L, createRequest(CourseStartTiming.SCHEDULED, false));

        assertThat(result.status()).isEqualTo(CourseStatus.READY);
        assertThat(result.title()).isEqualTo("경복궁");
        verify(courseStopRepository).saveAll(any());
        verify(courseBasketItemRepository).deleteAllByMemberIdAndIdIn(3L, List.of(10L));
    }

    @Test
    void savesSelectedCourseAsInProgressForNowTiming() {
        stubCreation();
        when(courseRepository.findFirstByMemberIdAndStatusOrderByUpdatedAtDesc(3L, CourseStatus.IN_PROGRESS))
                .thenReturn(Optional.empty());

        CourseDetailResponse result = service.create(3L, createRequest(CourseStartTiming.NOW, false));

        assertThat(result.status()).isEqualTo(CourseStatus.IN_PROGRESS);
    }

    @Test
    void archivesActiveCourseBeforeStartingReadyCourseWhenConfirmed() {
        Course active = course(20L, "기존 코스", true);
        Course target = course(21L, "새 코스", false);
        CourseRevision revision = CourseRevision.create(
                target, 1, CourseRouteStrategy.FAST, LocalDate.of(2026, 8, 23),
                LocalTime.of(10, 0), LocalTime.of(11, 0), CourseStartType.CURRENT_LOCATION,
                "현재 위치", 37.56, 126.98, "preview-v1",
                com.ddemachim.server.domain.course.enums.CourseReplanReason.INITIAL);
        ReflectionTestUtils.setField(revision, "id", 22L);
        target.changeCurrentRevision(revision, 0);
        when(memberRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(member));
        when(courseRepository.findByIdAndMemberId(21L, 3L)).thenReturn(Optional.of(target));
        when(courseRepository.findFirstByMemberIdAndStatusOrderByUpdatedAtDesc(3L, CourseStatus.IN_PROGRESS))
                .thenReturn(Optional.of(active));
        when(courseStopRepository.findAllByCourseRevisionIdOrderBySequenceNoAsc(22L)).thenReturn(List.of());

        service.start(3L, 21L, new CourseStartRequest(true));

        assertThat(active.getStatus()).isEqualTo(CourseStatus.ARCHIVED);
        assertThat(target.getStatus()).isEqualTo(CourseStatus.IN_PROGRESS);
    }

    @Test
    void rejectsStartingAnotherMembersCourse() {
        when(memberRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(member));
        when(courseRepository.findByIdAndMemberId(999L, 3L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.start(3L, 999L, new CourseStartRequest(false)))
                .isInstanceOfSatisfying(CourseException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(CourseErrorStatus.COURSE_NOT_FOUND));
    }

    private void stubCreation() {
        Place place = new TestPlace();
        ReflectionTestUtils.setField(place, "id", 40L);
        ReflectionTestUtils.setField(place, "name", "경복궁");
        when(memberRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(member));
        when(coursePreviewService.preview(any(), any())).thenReturn(preview());
        when(inputResolver.resolve(any(), any(), any())).thenReturn(List.of(
                new CoursePreviewInputResolver.ResolvedPlace(
                        10L, place, null, "경복궁", "서울 종로구", 37.57, 126.97,
                        60, 60, CourseDwellSource.DEFAULT, null,
                        CourseHoursSourceType.DEMO_DEFAULT, LocalTime.of(9, 0), LocalTime.of(22, 0), false)));
        when(courseRepository.save(any(Course.class))).thenAnswer(invocation -> {
            Course saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 30L);
            return saved;
        });
        when(courseRevisionRepository.save(any(CourseRevision.class))).thenAnswer(invocation -> {
            CourseRevision saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 31L);
            return saved;
        });
    }

    private static CourseCreateRequest createRequest(CourseStartTiming timing, boolean replaceActive) {
        return new CourseCreateRequest(
                previewRequest(),
                CourseRouteStrategy.FAST,
                Map.of(),
                timing,
                replaceActive);
    }

    private static CoursePreviewRequest previewRequest() {
        return new CoursePreviewRequest(
                LocalDate.of(2026, 8, 23),
                LocalTime.of(10, 0),
                new CoursePreviewRequest.Start(CourseStartType.CURRENT_LOCATION, "현재 위치", 37.56, 126.98),
                List.of(new CoursePreviewRequest.Place(10L, 60, null)));
    }

    private static CoursePreviewResponse preview() {
        RouteOption route = new RouteOption(
                RouteMode.WALK, RouteStatus.AVAILABLE, 600, 700, null, null, 700, null, List.of());
        CoursePreviewResponse.Stop stop = new CoursePreviewResponse.Stop(
                1, 10L, "경복궁", "서울 종로구", 37.57, 126.97,
                60, 60, CourseDwellSource.DEFAULT, null, 10,
                LocalTime.of(10, 10), LocalTime.of(11, 10), 10, 700,
                null, null, CourseHoursSourceType.DEMO_DEFAULT,
                LocalTime.of(9, 0), LocalTime.of(22, 0), null, null,
                RouteMode.WALK, route, null, route);
        return new CoursePreviewResponse(
                Instant.parse("2026-08-20T05:35:00Z"),
                LocalDate.of(2026, 8, 23),
                LocalTime.of(10, 0),
                List.of(new CoursePreviewResponse.Option(
                        CourseRouteStrategy.FAST, 1, 70, 10, 700,
                        null, null, LocalTime.of(10, 0), LocalTime.of(11, 10), List.of(stop))));
    }

    private Course course(Long id, String title, boolean active) {
        Course course = Course.create(member, title);
        ReflectionTestUtils.setField(course, "id", id);
        if (active) course.start();
        return course;
    }

    private static class TestPlace extends Place {}
}
