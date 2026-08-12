package com.ddemachim.server.domain.media.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** TMDB 작품 크레딧에 참여한 인물. */
@Entity
@Table(name = "person", uniqueConstraints = @UniqueConstraint(columnNames = "tmdb_person_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Person {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tmdb_person_id", nullable = false, unique = true)
    private Integer tmdbPersonId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "name_ko", nullable = true, length = 200)
    private String nameKo;

    @Column(name = "profile_path", columnDefinition = "text")
    private String profilePath;
}
