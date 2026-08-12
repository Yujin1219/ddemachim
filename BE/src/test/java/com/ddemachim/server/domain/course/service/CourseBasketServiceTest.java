package com.ddemachim.server.domain.course.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import com.ddemachim.server.domain.course.repository.CourseBasketItemRepository;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.exception.PlaceNotFoundException;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import java.time.OffsetDateTime;
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
        CourseBasketItem item = CourseBasketItem.of(member, place);
        ReflectionTestUtils.setField(item, "id", id);
        ReflectionTestUtils.setField(item, "createdAt", OffsetDateTime.parse("2026-08-12T12:00:00+09:00"));
        return item;
    }

    private static class TestPlace extends Place {}
}
