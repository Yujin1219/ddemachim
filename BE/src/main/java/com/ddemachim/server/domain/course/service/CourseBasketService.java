package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.dto.AddKakaoPlaceRequest;
import com.ddemachim.server.domain.course.dto.CourseBasketItemResponse;
import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import com.ddemachim.server.domain.course.exception.CourseErrorStatus;
import com.ddemachim.server.domain.course.exception.CourseException;
import com.ddemachim.server.domain.course.repository.CourseBasketItemRepository;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.UserPlace;
import com.ddemachim.server.domain.place.enums.UserPlaceProvider;
import com.ddemachim.server.domain.place.exception.PlaceNotFoundException;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.place.repository.UserPlaceRepository;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.exception.AuthErrorStatus;
import com.ddemachim.server.domain.user.exception.AuthException;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CourseBasketService {

    private final CourseBasketItemRepository courseBasketItemRepository;
    private final PlaceRepository placeRepository;
    private final UserPlaceRepository userPlaceRepository;
    private final MemberRepository memberRepository;

    @Transactional
    public AddResult addPlace(Long memberId, Long placeId) {
        Member member = memberRepository.findByIdForUpdate(memberId)
                .orElseThrow(() -> new AuthException(AuthErrorStatus.INVALID_ACCESS_TOKEN));
        CourseBasketItem existing = courseBasketItemRepository
                .findByMemberIdAndPlaceId(memberId, placeId)
                .orElse(null);
        if (existing != null) {
            return new AddResult(CourseBasketItemResponse.from(existing), false);
        }

        Place place = placeRepository.findById(placeId).orElseThrow(PlaceNotFoundException::new);
        CourseBasketItem saved = courseBasketItemRepository.save(CourseBasketItem.forPlace(member, place));
        return new AddResult(CourseBasketItemResponse.from(saved), true);
    }

    @Transactional
    public AddResult addKakaoPlace(Long memberId, AddKakaoPlaceRequest request) {
        Member member = memberRepository.findByIdForUpdate(memberId)
                .orElseThrow(() -> new AuthException(AuthErrorStatus.INVALID_ACCESS_TOKEN));
        UserPlace userPlace = userPlaceRepository
                .findByMemberIdAndProviderAndProviderPlaceId(
                        memberId, UserPlaceProvider.KAKAO, request.providerPlaceId())
                .orElseGet(() -> userPlaceRepository.save(UserPlace.createKakao(
                        member,
                        request.providerPlaceId(),
                        request.name(),
                        request.categoryName(),
                        request.categoryGroupCode(),
                        request.roadAddress(),
                        request.lotAddress(),
                        request.longitude(),
                        request.latitude(),
                        request.phone())));
        CourseBasketItem existing = courseBasketItemRepository
                .findByMemberIdAndUserPlaceId(memberId, userPlace.getId())
                .orElse(null);
        if (existing != null) {
            return new AddResult(CourseBasketItemResponse.from(existing), false);
        }

        CourseBasketItem saved = courseBasketItemRepository.save(CourseBasketItem.forUserPlace(member, userPlace));
        return new AddResult(CourseBasketItemResponse.from(saved), true);
    }

    @Transactional(readOnly = true)
    public List<CourseBasketItemResponse> listPlaces(Long memberId) {
        return courseBasketItemRepository.findAllByMemberIdOrderByCreatedAtDescIdDesc(memberId).stream()
                .map(CourseBasketItemResponse::from)
                .toList();
    }

    @Transactional
    public void deletePlace(Long memberId, Long basketItemId) {
        CourseBasketItem item = courseBasketItemRepository
                .findByIdAndMemberId(basketItemId, memberId)
                .orElseThrow(() -> new CourseException(CourseErrorStatus.BASKET_ITEM_NOT_FOUND));
        courseBasketItemRepository.delete(item);
    }

    public record AddResult(CourseBasketItemResponse item, boolean isCreated) {}
}
