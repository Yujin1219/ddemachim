package com.ddemachim.server.domain.course.entity;

import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.UserPlace;
import com.ddemachim.server.domain.user.entity.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
        name = "course_basket_item",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uk_course_basket_item_member_place",
                    columnNames = {"member_id", "place_id"}),
            @UniqueConstraint(
                    name = "uk_course_basket_item_member_user_place",
                    columnNames = {"member_id", "user_place_id"})
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CourseBasketItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "place_id")
    private Place place;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_place_id")
    private UserPlace userPlace;

    @Column(name = "image_url", columnDefinition = "text")
    private String imageUrl;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static CourseBasketItem forPlace(Member member, Place place) {
        return forPlace(member, place, null);
    }

    public static CourseBasketItem forPlace(Member member, Place place, String imageUrl) {
        CourseBasketItem item = new CourseBasketItem();
        item.member = member;
        item.place = place;
        item.imageUrl = normalizeImageUrl(imageUrl);
        return item;
    }

    public static CourseBasketItem forUserPlace(Member member, UserPlace userPlace) {
        return forUserPlace(member, userPlace, null);
    }

    public static CourseBasketItem forUserPlace(Member member, UserPlace userPlace, String imageUrl) {
        CourseBasketItem item = new CourseBasketItem();
        item.member = member;
        item.userPlace = userPlace;
        item.imageUrl = normalizeImageUrl(imageUrl);
        return item;
    }

    public void updateImageUrl(String imageUrl) {
        String normalized = normalizeImageUrl(imageUrl);
        if (normalized != null) this.imageUrl = normalized;
    }

    private static String normalizeImageUrl(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) return null;
        return imageUrl.trim();
    }
}
