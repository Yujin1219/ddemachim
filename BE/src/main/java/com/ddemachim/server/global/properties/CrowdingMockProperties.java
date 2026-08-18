package com.ddemachim.server.global.properties;

import java.time.Duration;
import java.time.ZoneId;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "ddemachim.crowding.mock")
public class CrowdingMockProperties {

    public static final String DEFAULT_ZONE = "Asia/Seoul";

    private String seed = "ddemachim-demo-v1";
    private Duration ttl = Duration.ofHours(24);
    private String zone = DEFAULT_ZONE;
    private int maximumViewportGrids = 5_000;
    private int maximumBatchPoints = 300;

    public String getSeed() {
        return seed;
    }

    public void setSeed(String seed) {
        this.seed = seed;
    }

    public Duration getTtl() {
        return ttl;
    }

    public void setTtl(Duration ttl) {
        this.ttl = ttl;
    }

    public String getZone() {
        return zone;
    }

    public void setZone(String zone) {
        this.zone = zone;
    }

    public int getMaximumViewportGrids() {
        return maximumViewportGrids;
    }

    public void setMaximumViewportGrids(int maximumViewportGrids) {
        this.maximumViewportGrids = maximumViewportGrids;
    }

    public int getMaximumBatchPoints() {
        return maximumBatchPoints;
    }

    public void setMaximumBatchPoints(int maximumBatchPoints) {
        this.maximumBatchPoints = maximumBatchPoints;
    }

    public ZoneId zoneId() {
        return ZoneId.of(zone);
    }
}
