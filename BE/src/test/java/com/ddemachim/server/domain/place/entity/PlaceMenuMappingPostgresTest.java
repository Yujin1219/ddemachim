package com.ddemachim.server.domain.place.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PlaceMenuMappingPostgresTest {

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
    private JdbcTemplate jdbcTemplate;

    @Test
    void generatedPlaceMenuTableMatchesTheProductionColumns() {
        List<String> columns = jdbcTemplate.queryForList("""
                select column_name
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'place_menu'
                order by ordinal_position
                """, String.class);

        assertThat(columns).containsExactlyInAnyOrder(
                "id",
                "place_id",
                "source",
                "source_menu_id",
                "menu_name",
                "menu_price",
                "image_url",
                "created_at",
                "updated_at");
    }

    @Test
    void generatedPlaceMenuTableKeepsSourceMenuIdentityUnique() {
        List<String> uniqueColumns = jdbcTemplate.queryForList("""
                select kcu.column_name
                from information_schema.table_constraints tc
                join information_schema.key_column_usage kcu
                  on kcu.constraint_catalog = tc.constraint_catalog
                 and kcu.constraint_schema = tc.constraint_schema
                 and kcu.constraint_name = tc.constraint_name
                 and kcu.table_name = tc.table_name
                where tc.table_schema = 'public'
                  and tc.table_name = 'place_menu'
                  and tc.constraint_name = 'uq_place_menu_source_menu'
                  and tc.constraint_type = 'UNIQUE'
                order by kcu.ordinal_position
                """, String.class);

        assertThat(uniqueColumns).containsExactly("source", "source_menu_id");
    }
}
