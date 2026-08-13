package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.dto.AddKakaoPlaceRequest;
import com.ddemachim.server.domain.course.dto.CourseBasketItemResponse;
import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import com.ddemachim.server.domain.course.enums.CourseBasketItemSource;
import com.ddemachim.server.domain.course.repository.CourseBasketItemRepository;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.UserPlace;
import com.ddemachim.server.domain.place.enums.UserPlaceProvider;
import com.ddemachim.server.domain.place.exception.PlaceNotFoundException;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.place.repository.UserPlaceRepository;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class CourseBasketServiceTest {

    @Mock
    private CourseBasketItemRepository courseBasketItemRepository;

    @Mock
    private PlaceRepository placeRepository;

    @Mock
    private UserPlaceRepository userPlaceRepository;

    @Mock
    private MemberRepository memberRepository;

    @InjectMocks
    private CourseBasketService courseBasketService;

    @Test
    void addPlace_createsBasketItemForExistingPlace() {
        Place place = place(40L, "운현궁");
        Member member = member(3L);
        CourseBasketItem saved = item(7L, member, place);
        when(memberRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(member));
        when(courseBasketItemRepository.findByMemberIdAndPlaceId(3L, 40L)).thenReturn(Optional.empty());
        when(placeRepository.findById(40L)).thenReturn(Optional.of(place));
        when(courseBasketItemRepository.save(any(CourseBasketItem.class))).thenReturn(saved);

        CourseBasketService.AddResult result = courseBasketService.addPlace(3L, 40L);

        assertThat(result.isCreated()).isTrue();
        assertThat(result.item().id()).isEqualTo(7L);
        assertThat(result.item().placeId()).isEqualTo(40L);
        assertThat(result.item().placeName()).isEqualTo("운현궁");
        assertThat(result.item().source()).isEqualTo(CourseBasketItemSource.DDEMACHIM);
        assertThat(result.item().userPlaceId()).isNull();
    }

    @Test
    void addPlace_returnsExistingItemWhenPlaceIsAlreadyInBasket() {
        Place place = place(40L, "운현궁");
        Member member = member(3L);
        CourseBasketItem existing = item(7L, member, place);
        when(memberRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(member));
        when(courseBasketItemRepository.findByMemberIdAndPlaceId(3L, 40L)).thenReturn(Optional.of(existing));

        CourseBasketService.AddResult result = courseBasketService.addPlace(3L, 40L);

        assertThat(result.isCreated()).isFalse();
        assertThat(result.item().id()).isEqualTo(7L);
        verify(placeRepository, never()).findById(any());
        verify(courseBasketItemRepository, never()).save(any());
    }

    @Test
    void addKakaoPlace_createsCanonicalMemberOwnedPlaceAndBasketItem() {
        Member member = member(3L);
        when(memberRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(member));
        when(userPlaceRepository.findByMemberIdAndProviderAndProviderPlaceId(
                        3L, UserPlaceProvider.KAKAO, "27560651"))
                .thenReturn(Optional.empty());
        when(userPlaceRepository.save(any(UserPlace.class))).thenAnswer(invocation -> {
            UserPlace saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 50L);
            ReflectionTestUtils.setField(saved, "createdAt", OffsetDateTime.parse("2026-08-12T11:00:00+09:00"));
            return saved;
        });
        when(courseBasketItemRepository.findByMemberIdAndUserPlaceId(3L, 50L))
                .thenReturn(Optional.empty());
        when(courseBasketItemRepository.save(any(CourseBasketItem.class))).thenAnswer(invocation -> {
            CourseBasketItem saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "id", 8L);
            ReflectionTestUtils.setField(saved, "createdAt", OffsetDateTime.parse("2026-08-12T12:00:00+09:00"));
            return saved;
        });

        CourseBasketService.AddResult result = courseBasketService.addKakaoPlace(3L, kakaoRequest());

        assertThat(result.isCreated()).isTrue();
        assertThat(result.item().id()).isEqualTo(8L);
        assertThat(result.item().source()).isEqualTo(CourseBasketItemSource.KAKAO);
        assertThat(result.item().placeId()).isNull();
        assertThat(result.item().userPlaceId()).isEqualTo(50L);
        assertThat(result.item().providerPlaceId()).isEqualTo("27560651");
        assertThat(result.item().placeName()).isEqualTo("경복궁");
        assertThat(result.item().categoryName()).isEqualTo("여행 > 관광,명소 > 궁궐");
        assertThat(result.item().longitude()).isEqualTo(126.976896737645);
        assertThat(result.item().latitude()).isEqualTo(37.5776087830657);
        assertThat(result.item().placeUrl()).isEqualTo("https://place.map.kakao.com/27560651");
    }

    @Test
    void addKakaoPlace_returnsExistingBasketItemWithoutCreatingDuplicates() {
        Member member = member(3L);
        UserPlace userPlace = userPlace(50L, member);
        CourseBasketItem existing = userPlaceItem(8L, member, userPlace);
        when(memberRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(member));
        when(userPlaceRepository.findByMemberIdAndProviderAndProviderPlaceId(
                        3L, UserPlaceProvider.KAKAO, "27560651"))
                .thenReturn(Optional.of(userPlace));
        when(courseBasketItemRepository.findByMemberIdAndUserPlaceId(3L, 50L))
                .thenReturn(Optional.of(existing));

        CourseBasketService.AddResult result = courseBasketService.addKakaoPlace(3L, kakaoRequest());

        assertThat(result.isCreated()).isFalse();
        assertThat(result.item().id()).isEqualTo(8L);
        assertThat(result.item().source()).isEqualTo(CourseBasketItemSource.KAKAO);
        assertThat(result.item().placeUrl()).isEqualTo("https://place.map.kakao.com/27560651");
        verify(userPlaceRepository, never()).save(any());
        verify(courseBasketItemRepository, never()).save(any());
    }

    @Test
    void listPlaces_returnsInternalAndKakaoItemsInRepositoryOrder() {
        Member member = member(3L);
        CourseBasketItem latest = userPlaceItem(8L, member, userPlace(50L, member));
        CourseBasketItem older = item(7L, member, place(40L, "운현궁"));
        when(courseBasketItemRepository.findAllByMemberIdOrderByCreatedAtDescIdDesc(3L))
                .thenReturn(List.of(latest, older));

        List<CourseBasketItemResponse> result = courseBasketService.listPlaces(3L);

        assertThat(result).extracting(CourseBasketItemResponse::id).containsExactly(8L, 7L);
        assertThat(result)
                .extracting(CourseBasketItemResponse::source)
                .containsExactly(CourseBasketItemSource.KAKAO, CourseBasketItemSource.DDEMACHIM);
        assertThat(result).extracting(CourseBasketItemResponse::placeId).containsExactly(null, 40L);
        assertThat(result).extracting(CourseBasketItemResponse::userPlaceId).containsExactly(50L, null);
        verify(courseBasketItemRepository).findAllByMemberIdOrderByCreatedAtDescIdDesc(3L);
    }

    @Test
    void addPlace_throwsWhenPlaceDoesNotExist() {
        Member member = member(3L);
        when(memberRepository.findByIdForUpdate(3L)).thenReturn(Optional.of(member));
        when(courseBasketItemRepository.findByMemberIdAndPlaceId(3L, 999L)).thenReturn(Optional.empty());
        when(placeRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> courseBasketService.addPlace(3L, 999L))
                .isInstanceOf(PlaceNotFoundException.class);

        verify(courseBasketItemRepository, never()).save(any());
    }

    private static Place place(Long id, String name) {
        Place place = new TestPlace();
        ReflectionTestUtils.setField(place, "id", id);
        ReflectionTestUtils.setField(place, "name", name);
        return place;
    }

    private static Member member(Long id) {
        Member member = Member.create("test@example.com", "encoded", "tester", Role.USER);
        ReflectionTestUtils.setField(member, "id", id);
        return member;
    }

    private static CourseBasketItem item(Long id, Member member, Place place) {
        CourseBasketItem item = CourseBasketItem.forPlace(member, place);
        ReflectionTestUtils.setField(item, "id", id);
        ReflectionTestUtils.setField(item, "createdAt", OffsetDateTime.parse("2026-08-12T12:00:00+09:00"));
        return item;
    }

    private static CourseBasketItem userPlaceItem(Long id, Member member, UserPlace userPlace) {
        CourseBasketItem item = CourseBasketItem.forUserPlace(member, userPlace);
        ReflectionTestUtils.setField(item, "id", id);
        ReflectionTestUtils.setField(item, "createdAt", OffsetDateTime.parse("2026-08-12T12:00:00+09:00"));
        return item;
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
                126.976896737645,
                37.5776087830657,
                "02-3700-3900");
        ReflectionTestUtils.setField(userPlace, "id", id);
        ReflectionTestUtils.setField(userPlace, "createdAt", OffsetDateTime.parse("2026-08-12T11:00:00+09:00"));
        return userPlace;
    }

    private static AddKakaoPlaceRequest kakaoRequest() {
        return new AddKakaoPlaceRequest(
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
