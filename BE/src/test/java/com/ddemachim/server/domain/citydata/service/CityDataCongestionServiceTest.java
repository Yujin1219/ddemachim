package com.ddemachim.server.domain.citydata.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.citydata.dto.CityDataCongestionResponse;
import com.ddemachim.server.global.properties.SeoulCityDataProperties;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class CityDataCongestionServiceTest {

    private static final Clock FIXED_CLOCK = Clock.fixed(
            Instant.parse("2026-08-12T06:40:00Z"),
            ZoneId.of("Asia/Seoul"));

    @Test
    void getJongnoCongestion_returnsDefaultUnknownAreasWhenApiKeyIsMissing() {
        SeoulCityDataClient client = mock(SeoulCityDataClient.class);
        SeoulCityDataProperties properties = new SeoulCityDataProperties();
        properties.setApiKey("");
        CityDataCongestionService service = new CityDataCongestionService(client, properties, FIXED_CLOCK);

        service.refresh();

        CityDataCongestionResponse response = service.getJongnoCongestion();
        assertThat(response.stale()).isTrue();
        assertThat(response.updatedAt()).isNull();
        assertThat(response.areas()).hasSize(19);
        assertThat(response.areas())
                .extracting(CityDataCongestionResponse.Area::congestionLevel)
                .containsOnly("정보없음");
        verifyNoInteractions(client);
    }

    @Test
    void refreshUpdatesSuccessfulAreasAndKeepsFailedAreas() {
        SeoulCityDataClient client = mock(SeoulCityDataClient.class);
        SeoulCityDataProperties properties = new SeoulCityDataProperties();
        properties.setApiKey("test-key");
        CityDataCongestionService service = new CityDataCongestionService(client, properties, FIXED_CLOCK);

        when(client.fetchCurrentCongestion(new CityDataArea("POI002", "동대문 관광특구", "관광특구")))
                .thenReturn(new CityDataAreaCongestion(
                        "POI002",
                        "동대문 관광특구",
                        "관광특구",
                        "보통",
                        "이동에 큰 불편이 없어요.",
                        1000,
                        1200,
                        LocalDateTime.of(2026, 8, 12, 15, 30)));
        when(client.fetchCurrentCongestion(new CityDataArea("POI003", "명동 관광특구", "관광특구")))
                .thenThrow(new IllegalStateException("boom"));

        service.refresh();

        CityDataCongestionResponse response = service.getJongnoCongestion();
        assertThat(response.stale()).isFalse();
        assertThat(response.updatedAt()).isEqualTo(LocalDateTime.of(2026, 8, 12, 15, 40));
        assertThat(response.areas().get(0).areaCode()).isEqualTo("POI002");
        assertThat(response.areas().get(0).congestionLevel()).isEqualTo("보통");
        assertThat(response.areas().get(1).areaCode()).isEqualTo("POI003");
        assertThat(response.areas().get(1).congestionLevel()).isEqualTo("정보없음");
    }
}
