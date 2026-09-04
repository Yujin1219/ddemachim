package com.ddemachim.server.domain.place.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.domain.place.entity.Place;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PlaceRepositoryPostgresTest {

    private static final String TEST_DISTRICT = "PostgreSQL테스트구";

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse("postgis/postgis:18-3.6").asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void postgresProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
    }

    @Autowired
    private PlaceRepository placeRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void searchForAi_executesImagePriorityOrderingOnPostgreSql() {
        Place withoutImage = place("이미지 없는 장소", null, 126.971, 37.571);
        Place withImage = place("이미지 있는 장소", "https://example.com/place.jpg", 126.972, 37.572);
        entityManager.persist(withoutImage);
        entityManager.persist(withImage);
        entityManager.flush();
        entityManager.clear();

        var result = placeRepository.searchForAi(null, TEST_DISTRICT, null, 2);

        assertThat(result).extracting(Place::getId)
                .containsExactly(withImage.getId(), withoutImage.getId());
    }

    private static Place place(String name, String imageUrl, double longitude, double latitude) {
        Place place = BeanUtils.instantiateClass(Place.class);
        ReflectionTestUtils.setField(place, "name", name);
        ReflectionTestUtils.setField(place, "normalizedName", name);
        ReflectionTestUtils.setField(place, "district", TEST_DISTRICT);
        ReflectionTestUtils.setField(place, "tags", new String[]{"FILMING_LOCATION"});
        ReflectionTestUtils.setField(place, "imageUrl", imageUrl);
        GeometryFactory factory = new GeometryFactory(new PrecisionModel(), 4326);
        ReflectionTestUtils.setField(place, "location",
                factory.createPoint(new Coordinate(longitude, latitude)));
        return place;
    }
}
