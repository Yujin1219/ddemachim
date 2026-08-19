package com.ddemachim.server.domain.course.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.course.enums.CourseStartType;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class CoursePreviewRequestTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void acceptsValidPreviewRequest() {
        CoursePreviewRequest request = validRequest();

        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void rejectsEndTimeThatIsNotAfterStartTime() {
        CoursePreviewRequest request = new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(18, 0),
                LocalTime.of(18, 0),
                currentLocation(),
                List.of(place(1L, 60, null)));

        assertThat(paths(validator.validate(request))).contains("desiredTimeRangeValid");
    }

    @Test
    void rejectsDuplicateBasketItems() {
        CoursePreviewRequest request = new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                currentLocation(),
                List.of(place(1L, 60, null), place(1L, 45, LocalTime.of(15, 0))));

        assertThat(paths(validator.validate(request))).contains("basketItemIdsUnique");
    }

    @Test
    void rejectsEmptyPlacesAndInvalidDwellMinutes() {
        CoursePreviewRequest empty = new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                currentLocation(),
                List.of());
        CoursePreviewRequest invalidDwell = new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                currentLocation(),
                List.of(place(1L, 0, null)));

        assertThat(paths(validator.validate(empty))).contains("places");
        assertThat(paths(validator.validate(invalidDwell))).contains("places[0].dwellMinutes");
    }

    @Test
    void rejectsMoreThanFivePlaces() {
        CoursePreviewRequest request = new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                currentLocation(),
                List.of(
                        place(1L, 30, null),
                        place(2L, 30, null),
                        place(3L, 30, null),
                        place(4L, 30, null),
                        place(5L, 30, null),
                        place(6L, 30, null)));

        assertThat(paths(validator.validate(request))).contains("places");
    }

    @Test
    void acceptsExactlyFivePlaces() {
        CoursePreviewRequest request = new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                currentLocation(),
                List.of(
                        place(1L, 30, null),
                        place(2L, 30, null),
                        place(3L, 30, null),
                        place(4L, 30, null),
                        place(5L, 30, null)));

        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void searchedPlaceRequiresNameAndCoordinatesMustBeBounded() {
        CoursePreviewRequest.Start searchedWithoutName = new CoursePreviewRequest.Start(
                CourseStartType.SEARCHED_PLACE, " ", 91.0, 181.0);
        CoursePreviewRequest request = new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                searchedWithoutName,
                List.of(place(1L, 60, null)));

        assertThat(paths(validator.validate(request)))
                .contains("start.searchedPlaceNameValid", "start.latitude", "start.longitude");
    }

    @Test
    void requiresCoreFieldsAndPositiveBasketItemId() {
        CoursePreviewRequest request = new CoursePreviewRequest(
                null,
                null,
                null,
                null,
                List.of(place(0L, 60, null)));

        assertThat(paths(validator.validate(request)))
                .contains("serviceDate", "desiredStartTime", "desiredEndTime", "start", "places[0].basketItemId");
    }

    private static CoursePreviewRequest validRequest() {
        return new CoursePreviewRequest(
                LocalDate.of(2026, 8, 18),
                LocalTime.of(10, 0),
                LocalTime.of(18, 0),
                currentLocation(),
                List.of(place(1L, 60, LocalTime.of(15, 0)), place(2L, 45, null)));
    }

    private static CoursePreviewRequest.Start currentLocation() {
        return new CoursePreviewRequest.Start(
                CourseStartType.CURRENT_LOCATION, "현재 위치", 37.5665, 126.9780);
    }

    private static CoursePreviewRequest.Place place(
            Long basketItemId, Integer dwellMinutes, LocalTime arrivalDeadline) {
        return new CoursePreviewRequest.Place(basketItemId, dwellMinutes, arrivalDeadline);
    }

    private static Set<String> paths(Set<? extends ConstraintViolation<?>> violations) {
        return violations.stream()
                .map(violation -> violation.getPropertyPath().toString())
                .collect(java.util.stream.Collectors.toSet());
    }
}
