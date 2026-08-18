package com.ddemachim.server.domain.place.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import org.junit.jupiter.api.Test;

class PlaceDefaultDwellTest {

    @Test
    void placeStartsWithSixtyMinuteDefaultDwell() {
        Place place = new Place();

        assertThat(place.getDefaultDwellMinutes()).isEqualTo(60);
    }

    @Test
    void kakaoUserPlaceExplicitlyStartsWithSixtyMinuteDefaultDwell() {
        Member member = Member.create("member@example.com", "encoded", "member", Role.USER);

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

        assertThat(userPlace.getDefaultDwellMinutes()).isEqualTo(60);
    }
}
