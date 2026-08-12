package com.ddemachim.server.domain.course.service;

import com.ddemachim.server.domain.course.dto.CourseBasketItemResponse;
import com.ddemachim.server.domain.course.entity.CourseBasketItem;
import com.ddemachim.server.domain.course.repository.CourseBasketItemRepository;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.exception.PlaceNotFoundException;
import com.ddemachim.server.domain.place.repository.PlaceRepository;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.exception.AuthErrorStatus;
import com.ddemachim.server.domain.user.exception.AuthException;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CourseBasketService {

    private final CourseBasketItemRepository courseBasketItemRepository;
    private final PlaceRepository placeRepository;
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
        CourseBasketItem saved = courseBasketItemRepository.save(CourseBasketItem.of(member, place));
        return new AddResult(CourseBasketItemResponse.from(saved), true);
    }

    public record AddResult(CourseBasketItemResponse item, boolean isCreated) {}
}
