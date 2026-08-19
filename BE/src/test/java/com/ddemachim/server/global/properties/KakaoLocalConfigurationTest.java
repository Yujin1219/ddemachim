package com.ddemachim.server.global.properties;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySourcesPropertyResolver;
import org.springframework.core.io.FileSystemResource;

class KakaoLocalConfigurationTest {

    @Test
    void applicationConfigurationMapsKakaoRestApiKeyEnvironmentVariable() throws Exception {
        MutablePropertySources propertySources = new MutablePropertySources();
        propertySources.addFirst(new MapPropertySource(
                "test-environment", Map.of("KAKAO_REST_API_KEY", "test-kakao-key")));
        new YamlPropertySourceLoader()
                .load("application", new FileSystemResource("src/main/resources/application.yml"))
                .forEach(propertySources::addLast);

        PropertySourcesPropertyResolver resolver = new PropertySourcesPropertyResolver(propertySources);

        assertThat(resolver.getProperty("ddemachim.kakao.local.rest-api-key"))
                .isEqualTo("test-kakao-key");
    }
}
