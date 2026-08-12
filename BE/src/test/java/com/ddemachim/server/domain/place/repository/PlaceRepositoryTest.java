package com.ddemachim.server.domain.place.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.place.entity.Place;
import com.ddemachim.server.domain.place.entity.PlaceImage;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class PlaceRepositoryTest {

    private static final String TEST_DISTRICT = "정렬테스트구";

    @Autowired
    private PlaceRepository placeRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void search_filmingLocationOrdersPlacesWithImagesFirstAndKeepsPaginationStable() {
        Place withoutImage = place("이미지 없는 촬영지");
        Place imagePlaceWithLowerId = place("이미지 있는 촬영지 1");
        Place imagePlaceWithHigherId = place("이미지 있는 촬영지 2");

        entityManager.persist(withoutImage);
        entityManager.persist(imagePlaceWithLowerId);
        entityManager.persist(imagePlaceWithHigherId);
        entityManager.flush();

        entityManager.persist(image(imagePlaceWithLowerId, "https://example.com/1.jpg"));
        entityManager.persist(image(imagePlaceWithHigherId, "https://example.com/2.jpg"));
        entityManager.flush();
        entityManager.clear();

        PageRequest firstPage = PageRequest.of(0, 2);
        PageRequest secondPage = PageRequest.of(1, 2);

        Page<Place> filmingFirstResult = placeRepository.search(
                null, TEST_DISTRICT, "FILMING_LOCATION", null, null, firstPage);
        Page<Place> filmingSecondResult = placeRepository.search(
                null, TEST_DISTRICT, "FILMING_LOCATION", null, null, secondPage);
        Page<Place> repeatedFirstResult = placeRepository.search(
                null, TEST_DISTRICT, "FILMING_LOCATION", null, null, firstPage);

        assertThat(filmingFirstResult.getContent())
                .extracting(Place::getId)
                .containsExactly(imagePlaceWithLowerId.getId(), imagePlaceWithHigherId.getId());
        assertThat(filmingSecondResult.getContent())
                .extracting(Place::getId)
                .containsExactly(withoutImage.getId());
        assertThat(repeatedFirstResult.getContent())
                .extracting(Place::getId)
                .containsExactlyElementsOf(
                        filmingFirstResult.getContent().stream().map(Place::getId).toList());

        Page<Place> nonFilmingResult = placeRepository.search(
                null, TEST_DISTRICT, "OTHER", null, null, PageRequest.of(0, 3));

        assertThat(nonFilmingResult.getContent())
                .extracting(Place::getId)
                .containsExactly(withoutImage.getId(), imagePlaceWithLowerId.getId(), imagePlaceWithHigherId.getId());
    }

    private static Place place(String name) {
        Place place = BeanUtils.instantiateClass(Place.class);
        ReflectionTestUtils.setField(place, "name", name);
        ReflectionTestUtils.setField(place, "normalizedName", name);
        ReflectionTestUtils.setField(place, "district", TEST_DISTRICT);
        ReflectionTestUtils.setField(place, "tags", new String[] {"FILMING_LOCATION", "OTHER"});
        return place;
    }

    private static PlaceImage image(Place place, String sourceUrl) {
        PlaceImage image = BeanUtils.instantiateClass(PlaceImage.class);
        ReflectionTestUtils.setField(image, "place", place);
        ReflectionTestUtils.setField(image, "source", "TEST");
        ReflectionTestUtils.setField(image, "sourceUrl", sourceUrl);
        return image;
    }
}
