package com.ddemachim.server.global.properties;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@ConfigurationProperties(prefix = "ddemachim.citydata.seoul")
public class SeoulCityDataProperties {

    private boolean enabled = true;
    private String apiKey = "";
    private String baseUrl = "http://openapi.seoul.go.kr:8088";
    private Duration staleAfter = Duration.ofMinutes(10);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public Duration getStaleAfter() {
        return staleAfter;
    }

    public void setStaleAfter(Duration staleAfter) {
        this.staleAfter = staleAfter;
    }

    public boolean hasApiKey() {
        return StringUtils.hasText(apiKey);
    }
}
