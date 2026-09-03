package com.ddemachim.server.domain.place.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.place.entity.Place;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.context.jdbc.Sql;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Sql(scripts = "/place-trend-test-schema.sql")
public class PlaceRepositoryTest {

    private static final String TEST_DISTRICT = "정렬테스트구";

    @Autowired
    private PlaceRepository placeRepository;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void registerH2Functions() {
        jdbcTemplate.execute(
                "CREATE ALIAS IF NOT EXISTS STRING_TO_ARRAY FOR 'com.ddemachim.server.domain.place.repository.PlaceRepositoryTest.stringToArray'");
    }

    @Test
    void search_filmingLocationOrdersPlacesWithImagesFirstAndKeepsPaginationStable() {
        Place withoutImage = place("이미지 없는 촬영지", null);
        Place imagePlaceWithLowerId = place("이미지 있는 촬영지 1", "https://example.com/1.jpg");
        Place imagePlaceWithHigherId = place("이미지 있는 촬영지 2", "https://example.com/2.jpg");

        entityManager.persist(withoutImage);
        entityManager.persist(imagePlaceWithLowerId);
        entityManager.persist(imagePlaceWithHigherId);
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

    @Test
    void searchForAi_filmingCategoryMatchesFilmingLocationTag() {
        Place filmingPlace = place("종로 촬영 장소", "https://example.com/filming.jpg");
        ReflectionTestUtils.setField(filmingPlace, "location",
                new GeometryFactory(new PrecisionModel(), 4326)
                        .createPoint(new Coordinate(126.98, 37.57)));
        entityManager.persist(filmingPlace);
        entityManager.flush();
        entityManager.clear();

        var result = placeRepository.searchForAi(
                "촬영지", TEST_DISTRICT, "FILMING_LOCATION", 10);

        assertThat(result).extracting(Place::getId).containsExactly(filmingPlace.getId());
    }

    @Test
    void searchForAi_prioritizesPlacesWithRepresentativeImagesBeforeApplyingTheLimit() {
        Place withoutImage = place("이미지 없는 AI 추천 장소", null);
        Place withImage = place("이미지 있는 AI 추천 장소", "https://example.com/recommended.jpg");
        GeometryFactory factory = new GeometryFactory(new PrecisionModel(), 4326);
        ReflectionTestUtils.setField(withoutImage, "location",
                factory.createPoint(new Coordinate(126.971, 37.571)));
        ReflectionTestUtils.setField(withImage, "location",
                factory.createPoint(new Coordinate(126.972, 37.572)));

        entityManager.persist(withoutImage);
        entityManager.persist(withImage);
        entityManager.flush();
        entityManager.clear();

        var result = placeRepository.searchForAi(null, TEST_DISTRICT, null, 2);

        assertThat(result).extracting(Place::getId)
                .containsExactly(withImage.getId(), withoutImage.getId());
    }

    private static Place place(String name, String imageUrl) {
        Place place = BeanUtils.instantiateClass(Place.class);
        ReflectionTestUtils.setField(place, "name", name);
        ReflectionTestUtils.setField(place, "normalizedName", name);
        ReflectionTestUtils.setField(place, "district", TEST_DISTRICT);
        ReflectionTestUtils.setField(place, "tags", new String[] {"FILMING_LOCATION", "OTHER"});
        ReflectionTestUtils.setField(place, "imageUrl", imageUrl);
        return place;
    }

    public static String[] stringToArray(String value, String delimiter) {
        return value == null ? null : value.split(java.util.regex.Pattern.quote(delimiter), -1);
    }
}
