package com.ddemachim.server.domain.course.entity;

import com.ddemachim.server.domain.place.entity.Place;
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
        uniqueConstraints = @UniqueConstraint(
                name = "uk_course_basket_item_member_place",
                columnNames = {"member_id", "place_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CourseBasketItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "place_id", nullable = false)
    private Place place;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static CourseBasketItem of(Member member, Place place) {
        CourseBasketItem item = new CourseBasketItem();
        item.member = member;
        item.place = place;
        return item;
    }
}
