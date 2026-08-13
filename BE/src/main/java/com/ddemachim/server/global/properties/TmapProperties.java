package com.ddemachim.server.global.properties;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "ddemachim.tmap")
public class TmapProperties {

    private String baseUrl = "https://apis.openapi.sk.com";
    private String appKey = "";
    private Duration connectTimeout = Duration.ofSeconds(2);
    private Duration readTimeout = Duration.ofSeconds(4);
    private Duration cacheTtl = Duration.ofMinutes(2);
    private int cacheMaximumSize = 1_000;

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getAppKey() {
        return appKey;
    }

    public void setAppKey(String appKey) {
        this.appKey = appKey;
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public void setConnectTimeout(Duration connectTimeout) {
        this.connectTimeout = connectTimeout;
    }

    public Duration getReadTimeout() {
        return readTimeout;
    }

    public void setReadTimeout(Duration readTimeout) {
        this.readTimeout = readTimeout;
    }

    public Duration getCacheTtl() {
        return cacheTtl;
    }

    public void setCacheTtl(Duration cacheTtl) {
        this.cacheTtl = cacheTtl;
    }

    public int getCacheMaximumSize() {
        return cacheMaximumSize;
    }

    public void setCacheMaximumSize(int cacheMaximumSize) {
        this.cacheMaximumSize = cacheMaximumSize;
    }

    public boolean hasAppKey() {
        return StringUtils.hasText(appKey);
    }
}
