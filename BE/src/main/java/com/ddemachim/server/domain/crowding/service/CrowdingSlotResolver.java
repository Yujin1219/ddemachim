package com.ddemachim.server.domain.crowding.service;

import com.ddemachim.server.global.properties.CrowdingMockProperties;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CrowdingSlotResolver {

    private final ZoneId zoneId;
    private final Clock clock;

    @Autowired
    public CrowdingSlotResolver(CrowdingMockProperties properties) {
        this(properties, Clock.system(properties.zoneId()));
    }

    CrowdingSlotResolver(CrowdingMockProperties properties, Clock clock) {
        this.zoneId = properties.zoneId();
        this.clock = Objects.requireNonNull(clock).withZone(zoneId);
    }

    public OffsetDateTime resolve(OffsetDateTime at) {
        ZonedDateTime businessTime = Objects.requireNonNull(at)
                .atZoneSameInstant(zoneId);
        int slotMinute = businessTime.getMinute() < 30 ? 0 : 30;
        return businessTime
                .withMinute(slotMinute)
                .withSecond(0)
                .withNano(0)
                .toOffsetDateTime();
    }

    public OffsetDateTime resolveCurrent() {
        return resolve(OffsetDateTime.now(clock));
    }
}
