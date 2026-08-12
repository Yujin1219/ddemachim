package com.ddemachim.server.domain.citydata.service;

import com.ddemachim.server.domain.citydata.dto.CityDataCongestionResponse;
import com.ddemachim.server.global.properties.SeoulCityDataProperties;
import jakarta.annotation.PostConstruct;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CityDataCongestionService {

    private static final Logger log = LoggerFactory.getLogger(CityDataCongestionService.class);
    private static final List<CityDataArea> JONGNO_AREAS = List.of(
            new CityDataArea("POI002", "동대문 관광특구", "관광특구"),
            new CityDataArea("POI003", "명동 관광특구", "관광특구"),
            new CityDataArea("POI006", "종로·청계 관광특구", "관광특구"),
            new CityDataArea("POI008", "경복궁", "고궁·문화유산"),
            new CityDataArea("POI009", "광화문·덕수궁", "고궁·문화유산"),
            new CityDataArea("POI010", "보신각", "고궁·문화유산"),
            new CityDataArea("POI012", "창덕궁·종묘", "고궁·문화유산"),
            new CityDataArea("POI024", "동대문역", "인구밀집지역"),
            new CityDataArea("POI054", "혜화역", "인구밀집지역"),
            new CityDataArea("POI060", "광장(전통)시장", "발달상권"),
            new CityDataArea("POI064", "덕수궁길·정동길", "발달상권"),
            new CityDataArea("POI066", "북촌한옥마을", "발달상권"),
            new CityDataArea("POI067", "서촌", "발달상권"),
            new CityDataArea("POI078", "인사동", "발달상권"),
            new CityDataArea("POI088", "광화문광장", "공원"),
            new CityDataArea("POI116", "익선동", "발달상권"),
            new CityDataArea("POI124", "서대문독립공원", "공원"),
            new CityDataArea("POI129", "송현녹지광장", "공원"),
            new CityDataArea("POI130", "시의회 앞", "인구밀집지역"));

    private final SeoulCityDataClient seoulCityDataClient;
    private final SeoulCityDataProperties properties;
    private final Clock clock;
    private final AtomicReference<CityDataSnapshot> snapshot;

    @Autowired
    public CityDataCongestionService(
            SeoulCityDataClient seoulCityDataClient,
            SeoulCityDataProperties properties) {
        this(seoulCityDataClient, properties, Clock.systemDefaultZone());
    }

    CityDataCongestionService(
            SeoulCityDataClient seoulCityDataClient,
            SeoulCityDataProperties properties,
            Clock clock) {
        this.seoulCityDataClient = seoulCityDataClient;
        this.properties = properties;
        this.clock = clock;
        this.snapshot = new AtomicReference<>(new CityDataSnapshot(
                null,
                JONGNO_AREAS.stream().map(CityDataAreaCongestion::empty).toList()));
    }

    @PostConstruct
    public void initialize() {
        refresh();
    }

    public CityDataCongestionResponse getJongnoCongestion() {
        CityDataSnapshot current = snapshot.get();
        return new CityDataCongestionResponse(
                current.updatedAt(),
                isStale(current),
                current.areas().stream()
                        .map(this::toResponse)
                        .toList());
    }

    public void refresh() {
        if (!properties.isEnabled()) {
            log.debug("Seoul citydata congestion refresh is disabled.");
            return;
        }
        if (!properties.hasApiKey()) {
            log.debug("Seoul citydata API key is not configured; keeping current congestion cache.");
            return;
        }

        CityDataSnapshot current = snapshot.get();
        Map<String, CityDataAreaCongestion> nextByCode = new LinkedHashMap<>();
        current.areas().forEach(area -> nextByCode.put(area.areaCode(), area));

        int successCount = 0;
        for (CityDataArea area : JONGNO_AREAS) {
            try {
                CityDataAreaCongestion refreshed = seoulCityDataClient.fetchCurrentCongestion(area);
                if (refreshed != null) {
                    nextByCode.put(area.areaCode(), refreshed);
                    successCount++;
                }
            } catch (RuntimeException exception) {
                log.warn(
                        "Failed to refresh Seoul citydata congestion for {} ({}).",
                        area.areaCode(),
                        exception.getClass().getSimpleName());
            }
        }

        if (successCount > 0) {
            snapshot.set(new CityDataSnapshot(
                    LocalDateTime.now(clock),
                    JONGNO_AREAS.stream()
                            .map(area -> {
                                CityDataAreaCongestion congestion = nextByCode.get(area.areaCode());
                                return congestion == null ? CityDataAreaCongestion.empty(area) : congestion;
                            })
                            .toList()));
            log.info("Refreshed Seoul citydata congestion cache for {} Jongno areas.", successCount);
        }
    }

    private boolean isStale(CityDataSnapshot current) {
        if (current.updatedAt() == null) {
            return true;
        }
        LocalDateTime staleCutoff = LocalDateTime.now(clock).minus(properties.getStaleAfter());
        return current.updatedAt().isBefore(staleCutoff);
    }

    private CityDataCongestionResponse.Area toResponse(CityDataAreaCongestion area) {
        return new CityDataCongestionResponse.Area(
                area.areaCode(),
                area.areaName(),
                area.category(),
                area.congestionLevel(),
                area.congestionMessage(),
                area.populationMin(),
                area.populationMax(),
                area.populationTime());
    }
}
