package com.ddemachim.server.global.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "ddemachim.kakao.local")
public class KakaoLocalProperties {

    private String restApiKey = "";
    private String baseUrl = "https://dapi.kakao.com";

    public String getRestApiKey() {
        return restApiKey;
    }

    public void setRestApiKey(String restApiKey) {
        this.restApiKey = restApiKey;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public boolean hasRestApiKey() {
        return StringUtils.hasText(restApiKey);
    }
}
