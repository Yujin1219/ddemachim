package com.ddemachim.server.domain.place.entity;

import com.ddemachim.server.domain.place.enums.UserPlaceProvider;
import com.ddemachim.server.domain.user.entity.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(
        name = "user_place",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_user_place_member_provider_place",
                columnNames = {"member_id", "provider", "provider_place_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserPlace {

    private static final String KAKAO_PLACE_URL_PREFIX = "https://place.map.kakao.com/";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserPlaceProvider provider;

    @Column(name = "provider_place_id", nullable = false, length = 100)
    private String providerPlaceId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "category_name", length = 300)
    private String categoryName;

    @Column(name = "category_group_code", length = 20)
    private String categoryGroupCode;

    @Column(name = "road_address", columnDefinition = "text")
    private String roadAddress;

    @Column(name = "lot_address", columnDefinition = "text")
    private String lotAddress;

    @Column(nullable = false)
    private Double longitude;

    @Column(nullable = false)
    private Double latitude;

    @Column(length = 50)
    private String phone;

    @Column(name = "place_url", nullable = false, columnDefinition = "text")
    private String placeUrl;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static UserPlace createKakao(
            Member member,
            String providerPlaceId,
            String name,
            String categoryName,
            String categoryGroupCode,
            String roadAddress,
            String lotAddress,
            Double longitude,
            Double latitude,
            String phone) {
        UserPlace userPlace = new UserPlace();
        userPlace.member = member;
        userPlace.provider = UserPlaceProvider.KAKAO;
        userPlace.providerPlaceId = providerPlaceId;
        userPlace.name = name;
        userPlace.categoryName = categoryName;
        userPlace.categoryGroupCode = categoryGroupCode;
        userPlace.roadAddress = roadAddress;
        userPlace.lotAddress = lotAddress;
        userPlace.longitude = longitude;
        userPlace.latitude = latitude;
        userPlace.phone = phone;
        userPlace.placeUrl = KAKAO_PLACE_URL_PREFIX + providerPlaceId;
        return userPlace;
    }
}
