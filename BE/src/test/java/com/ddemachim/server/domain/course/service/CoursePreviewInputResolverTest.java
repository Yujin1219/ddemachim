package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.repository.CourseBasketItemRepository;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.UserPlace;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class CoursePreviewInputResolverTest {

    @Mock
    private CourseBasketItemRepository courseBasketItemRepository;

    @InjectMocks
    private CoursePreviewInputResolver resolver;

    @Test
    void resolvesMemberBasketItemsInRequestOrderAndDeterminesDwellSource() {
        Member member = member(3L);
        CourseBasketItem internal = item(7L, member, place(40L, "운현궁", "서울 종로구 삼일대로 464", 37.576, 126.986));
        CourseBasketItem kakao = userPlaceItem(8L, member, userPlace(50L, member));
        when(courseBasketItemRepository.findAllByMemberIdAndIdIn(3L, List.of(7L, 8L)))
                .thenReturn(List.of(kakao, internal));

        List<CoursePreviewInputResolver.ResolvedPlace> result = resolver.resolve(
                3L,
                List.of(
                        input(7L, 60, null),
                        input(8L, 45, LocalTime.of(15, 0))));

        assertThat(result)
                .extracting(CoursePreviewInputResolver.ResolvedPlace::basketItemId)
                .containsExactly(7L, 8L);
        assertThat(result)
                .extracting(CoursePreviewInputResolver.ResolvedPlace::dwellSource)
                .containsExactly(CourseDwellSource.DEFAULT, CourseDwellSource.USER_MODIFIED);
        assertThat(result.get(0).placeName()).isEqualTo("운현궁");
        assertThat(result.get(0).address()).isEqualTo("서울 종로구 삼일대로 464");
        assertThat(result.get(0).latitude()).isEqualTo(37.576);
        assertThat(result.get(0).longitude()).isEqualTo(126.986);
        assertThat(result.get(0).place()).isNotNull();
        assertThat(result.get(0).userPlace()).isNull();
        assertThat(result.get(1).place()).isNull();
        assertThat(result.get(1).userPlace()).isNotNull();
        assertThat(result.get(1).defaultDwellMinutes()).isEqualTo(60);
        assertThat(result.get(1).dwellMinutes()).isEqualTo(45);
        assertThat(result.get(1).arrivalDeadline()).isEqualTo(LocalTime.of(15, 0));
        verify(courseBasketItemRepository).findAllByMemberIdAndIdIn(3L, List.of(7L, 8L));
    }

    @Test
    void rejectsBasketItemThatDoesNotBelongToMember() {
        when(courseBasketItemRepository.findAllByMemberIdAndIdIn(3L, List.of(7L, 99L)))
                .thenReturn(List.of());

        assertThatThrownBy(() -> resolver.resolve(
                        3L,
                        List.of(input(7L, 60, null), input(99L, 60, null))))
                .isInstanceOfSatisfying(CourseException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(CourseErrorStatus.BASKET_ITEM_NOT_FOUND));
    }

    @Test
    void rejectsInternalPlaceWithoutCoordinates() {
        Member member = member(3L);
        Place place = place(40L, "좌표 없는 장소", null, null, null);
        CourseBasketItem item = item(7L, member, place);
        when(courseBasketItemRepository.findAllByMemberIdAndIdIn(3L, List.of(7L)))
                .thenReturn(List.of(item));

        assertThatThrownBy(() -> resolver.resolve(3L, List.of(input(7L, 60, null))))
                .isInstanceOfSatisfying(CourseException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(CourseErrorStatus.PLACE_LOCATION_MISSING));
    }

    private static CoursePreviewRequest.Place input(
            Long basketItemId, Integer dwellMinutes, LocalTime arrivalDeadline) {
        return new CoursePreviewRequest.Place(basketItemId, dwellMinutes, arrivalDeadline);
    }

    private static Member member(Long id) {
        Member member = Member.create("test@example.com", "encoded", "tester", Role.USER);
        ReflectionTestUtils.setField(member, "id", id);
        return member;
    }

    private static Place place(
            Long id, String name, String roadAddress, Double latitude, Double longitude) {
        Place place = new TestPlace();
        ReflectionTestUtils.setField(place, "id", id);
        ReflectionTestUtils.setField(place, "name", name);
        ReflectionTestUtils.setField(place, "roadAddress", roadAddress);
        if (latitude != null && longitude != null) {
            Point location = new GeometryFactory().createPoint(new Coordinate(longitude, latitude));
            location.setSRID(4326);
            ReflectionTestUtils.setField(place, "location", location);
        }
        return place;
    }

    private static UserPlace userPlace(Long id, Member member) {
        UserPlace userPlace = UserPlace.createKakao(
                member,
                "27560651",
                "경복궁",
                "여행 > 관광,명소 > 궁궐",
                "AT4",
                "서울 종로구 사직로 161",
                "서울 종로구 세종로 1-1",
                126.9769,
                37.5776,
                "02-3700-3900");
        ReflectionTestUtils.setField(userPlace, "id", id);
        return userPlace;
    }

    private static CourseBasketItem item(Long id, Member member, Place place) {
        CourseBasketItem item = CourseBasketItem.forPlace(member, place);
        ReflectionTestUtils.setField(item, "id", id);
        return item;
    }

    private static CourseBasketItem userPlaceItem(Long id, Member member, UserPlace userPlace) {
        CourseBasketItem item = CourseBasketItem.forUserPlace(member, userPlace);
        ReflectionTestUtils.setField(item, "id", id);
        return item;
    }

    private static class TestPlace extends Place {
    }
}
