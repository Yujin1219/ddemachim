package com.ddemachim.server.domain.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.media.dto.FilmingLocationResponse;
import com.ddemachim.server.domain.media.dto.FilmingWorkSummaryResponse;
import com.ddemachim.server.domain.media.dto.MediaContentDetailResponse;
import com.ddemachim.server.domain.media.entity.FilmingLocation;
import com.ddemachim.server.domain.media.entity.MediaContent;
import com.ddemachim.server.domain.media.entity.MediaCredit;
import com.ddemachim.server.domain.media.entity.Person;
import com.ddemachim.server.domain.media.enums.MediaCreditRole;
import com.ddemachim.server.domain.media.repository.FilmingLocationRepository;
import com.ddemachim.server.domain.media.repository.MediaContentRepository;
import com.ddemachim.server.domain.media.exception.InvalidMediaContentTypeException;
import com.ddemachim.server.domain.media.repository.MediaCreditRepository;
import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.repository.PlaceImageRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class MediaQueryServiceTest {

    @Mock
    private MediaContentRepository mediaContentRepository;

    @Mock
    private MediaCreditRepository mediaCreditRepository;

    @Mock
    private FilmingLocationRepository filmingLocationRepository;

    @Mock
    private PlaceImageRepository placeImageRepository;

    @InjectMocks
    private MediaQueryService mediaQueryService;

    @Test
    void getDetail_returnsDirectorAndCastCredits() {
        MediaContent mediaContent = mediaContent(10L, "테스트 작품");
        MediaCredit director = mediaCredit(1L, mediaContent, person(1L, 101, "Original Director", "테스트 감독"),
                MediaCreditRole.DIRECTOR, null, null, null);
        MediaCredit cast = mediaCredit(2L, mediaContent, person(2L, 102, "Original Actor", "테스트 배우"),
                MediaCreditRole.CAST, "Original Character", "한글 배역", 0);

        when(mediaContentRepository.findById(10L)).thenReturn(java.util.Optional.of(mediaContent));
        when(mediaCreditRepository.findByMediaContentIdWithPersonOrderByRoleAndCastOrder(10L))
                .thenReturn(List.of(director, cast));

        MediaContentDetailResponse response = mediaQueryService.getDetail(10L);

        assertThat(response.credits()).hasSize(2);
        assertThat(response.credits().get(0).role()).isEqualTo("DIRECTOR");
        assertThat(response.credits().get(0).name()).isEqualTo("Original Director");
        assertThat(response.credits().get(0).nameKo()).isEqualTo("테스트 감독");
        assertThat(response.credits().get(1).name()).isEqualTo("Original Actor");
        assertThat(response.credits().get(1).nameKo()).isEqualTo("테스트 배우");
        assertThat(response.credits().get(1).characterName()).isEqualTo("Original Character");
        assertThat(response.credits().get(1).characterNameKo()).isEqualTo("한글 배역");
        assertThat(response.credits().get(1).castOrder()).isZero();
    }

    @Test
    void getFilmingLocationsByPlace_returnsSceneDescriptionForAutoMatchRows() {
        Long placeId = 970L;
        String sceneDescription = "주인공이 골목 입구에서 다시 만나는 장면";
        FilmingLocation filmingLocation = filmingLocation(
                1L,
                place(placeId, "테스트 장소"),
                mediaContent(10L, "테스트 작품"),
                sceneDescription,
                "AUTO_MATCH");

        when(filmingLocationRepository.findByPlaceIdAndMatchStatus(eq(placeId), eq("AUTO_MATCH")))
                .thenReturn(List.of(filmingLocation));

        List<FilmingLocationResponse> responses = mediaQueryService.getFilmingLocationsByPlace(placeId);

        assertThat(responses).hasSize(1);
        assertThat(responses.getFirst().sceneDescription()).isEqualTo(sceneDescription);
        assertThat(responses.getFirst().contentType()).isEqualTo("DRAMA");
        assertThat(responses.getFirst().matchStatus()).isEqualTo("AUTO_MATCH");
        verify(filmingLocationRepository).findByPlaceIdAndMatchStatus(placeId, "AUTO_MATCH");
    }

    @Test
    void getFilmingWorks_returnsEmptyPageWithoutSecondaryQueries() {
        PageRequest pageable = PageRequest.of(0, 12);
        when(mediaContentRepository.findFilmingWorks("AUTO_MATCH", "DRAMA", pageable))
                .thenReturn(Page.empty(pageable));

        Page<FilmingWorkSummaryResponse> result = mediaQueryService.getFilmingWorks("drama", pageable);

        assertThat(result).isEmpty();
        verify(mediaContentRepository).findFilmingWorks("AUTO_MATCH", "DRAMA", pageable);
    }

    @Test
    void getFilmingWorks_rejectsUnsupportedContentType() {
        assertThatThrownBy(() -> mediaQueryService.getFilmingWorks("DOCUMENTARY", PageRequest.of(0, 12)))
                .isInstanceOf(InvalidMediaContentTypeException.class);
    }

    private static FilmingLocation filmingLocation(
            Long id,
            Place place,
            MediaContent mediaContent,
            String sceneDescription,
            String matchStatus) {
        FilmingLocation filmingLocation = new TestFilmingLocation();
        ReflectionTestUtils.setField(filmingLocation, "id", id);
        ReflectionTestUtils.setField(filmingLocation, "place", place);
        ReflectionTestUtils.setField(filmingLocation, "mediaContent", mediaContent);
        ReflectionTestUtils.setField(filmingLocation, "contentType", "DRAMA");
        ReflectionTestUtils.setField(filmingLocation, "sceneDescription", sceneDescription);
        ReflectionTestUtils.setField(filmingLocation, "matchStatus", matchStatus);
        ReflectionTestUtils.setField(filmingLocation, "matchConfidence", BigDecimal.valueOf(0.987));
        ReflectionTestUtils.setField(filmingLocation, "source", "FILMING_LOCATION");
        ReflectionTestUtils.setField(filmingLocation, "sourceId", "source-970");
        return filmingLocation;
    }

    private static Place place(Long id, String name) {
        Place place = new TestPlace();
        ReflectionTestUtils.setField(place, "id", id);
        ReflectionTestUtils.setField(place, "name", name);
        ReflectionTestUtils.setField(place, "normalizedName", name);
        return place;
    }

    private static MediaContent mediaContent(Long id, String title) {
        MediaContent mediaContent = new TestMediaContent();
        ReflectionTestUtils.setField(mediaContent, "id", id);
        ReflectionTestUtils.setField(mediaContent, "tmdbId", 12345);
        ReflectionTestUtils.setField(mediaContent, "mediaType", "tv");
        ReflectionTestUtils.setField(mediaContent, "title", title);
        return mediaContent;
    }

    private static Person person(Long id, Integer tmdbPersonId, String name, String nameKo) {
        Person person = new TestPerson();
        ReflectionTestUtils.setField(person, "id", id);
        ReflectionTestUtils.setField(person, "tmdbPersonId", tmdbPersonId);
        ReflectionTestUtils.setField(person, "name", name);
        ReflectionTestUtils.setField(person, "nameKo", nameKo);
        ReflectionTestUtils.setField(person, "profilePath", "/profile.jpg");
        return person;
    }

    private static MediaCredit mediaCredit(
            Long id,
            MediaContent mediaContent,
            Person person,
            MediaCreditRole role,
            String characterName,
            String characterNameKo,
            Integer castOrder) {
        MediaCredit credit = new TestMediaCredit();
        ReflectionTestUtils.setField(credit, "id", id);
        ReflectionTestUtils.setField(credit, "mediaContent", mediaContent);
        ReflectionTestUtils.setField(credit, "person", person);
        ReflectionTestUtils.setField(credit, "role", role);
        ReflectionTestUtils.setField(credit, "characterName", characterName);
        ReflectionTestUtils.setField(credit, "characterNameKo", characterNameKo);
        ReflectionTestUtils.setField(credit, "castOrder", castOrder);
        return credit;
    }

    private static class TestFilmingLocation extends FilmingLocation {
    }

    private static class TestPlace extends Place {
    }

    private static class TestMediaContent extends MediaContent {
    }

    private static class TestPerson extends Person {
    }

    private static class TestMediaCredit extends MediaCredit {
    }
}
