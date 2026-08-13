package com.ddemachim.server.domain.media.entity;

import com.ddemachim.server.domain.media.enums.MediaCreditRole;
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
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 작품과 크레딧 인물의 역할·배역 연결. */
@Entity
@Table(
        name = "media_credit",
        uniqueConstraints = @UniqueConstraint(columnNames = {"media_content_id", "person_id", "role"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MediaCredit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "media_content_id", nullable = false)
    private MediaContent mediaContent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "person_id", nullable = false)
    private Person person;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MediaCreditRole role;

    @Column(name = "character_name", length = 200)
    private String characterName;

    @Column(name = "character_name_ko", nullable = true, length = 200)
    private String characterNameKo;

    @Column(name = "cast_order")
    private Integer castOrder;
}
