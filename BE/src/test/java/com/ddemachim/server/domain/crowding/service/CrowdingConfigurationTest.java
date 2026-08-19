package com.ddemachim.server.domain.crowding.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.global.properties.CrowdingMockProperties;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration;
import org.springframework.boot.data.redis.autoconfigure.DataRedisProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

class CrowdingConfigurationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(DataRedisAutoConfiguration.class))
            .withPropertyValues(
                    "spring.data.redis.host=127.0.0.1",
                    "spring.data.redis.port=1",
                    "spring.data.redis.connect-timeout=50ms",
                    "spring.data.redis.timeout=50ms",
                    "ddemachim.crowding.mock.seed=review-seed-v2",
                    "ddemachim.crowding.mock.ttl=7h",
                    "ddemachim.crowding.mock.zone=Asia/Tokyo",
                    "ddemachim.crowding.mock.maximum-viewport-grids=1234",
                    "ddemachim.crowding.mock.maximum-batch-points=42")
            .withUserConfiguration(CrowdingTestConfiguration.class);

    @Test
    void springAutoConfigurationBindsOverridesAndCreatesBeansWithoutConnectingToRedis() {
        contextRunner.run(context -> {
            assertThat(context.getStartupFailure()).isNull();

            CrowdingMockProperties properties = context.getBean(CrowdingMockProperties.class);
            assertThat(properties.getSeed()).isEqualTo("review-seed-v2");
            assertThat(properties.getTtl()).isEqualTo(Duration.ofHours(7));
            assertThat(properties.getZone()).isEqualTo("Asia/Tokyo");
            assertThat(properties.getMaximumViewportGrids()).isEqualTo(1_234);
            assertThat(properties.getMaximumBatchPoints()).isEqualTo(42);

            DataRedisProperties redisProperties = context.getBean(DataRedisProperties.class);
            assertThat(redisProperties.getHost()).isEqualTo("127.0.0.1");
            assertThat(redisProperties.getPort()).isEqualTo(1);
            assertThat(redisProperties.getConnectTimeout()).isEqualTo(Duration.ofMillis(50));
            assertThat(redisProperties.getTimeout()).isEqualTo(Duration.ofMillis(50));

            assertThat(context.getBean(CrowdingSlotResolver.class)).isNotNull();
            assertThat(context.getBean(DeterministicCrowdingScoreGenerator.class)).isNotNull();
            assertThat(context.getBean(CrowdingRedisCache.class)).isNotNull();
            StringRedisTemplate redisTemplate = context.getBean(StringRedisTemplate.class);
            RedisConnectionFactory connectionFactory = context.getBean(RedisConnectionFactory.class);
            assertThat(connectionFactory).isInstanceOf(LettuceConnectionFactory.class);
            assertThat(redisTemplate.getConnectionFactory()).isSameAs(connectionFactory);
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(CrowdingMockProperties.class)
    @Import({
            CrowdingSlotResolver.class,
            DeterministicCrowdingScoreGenerator.class,
            CrowdingRedisCache.class
    })
    static class CrowdingTestConfiguration {
    }
}
