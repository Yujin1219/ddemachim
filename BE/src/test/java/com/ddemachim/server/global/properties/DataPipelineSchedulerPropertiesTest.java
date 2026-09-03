package com.ddemachim.server.global.properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class DataPipelineSchedulerPropertiesTest {

    @Test
    void defaultsUseTheLocalSiblingDataPipelineLayoutAndSeoulMondaySchedules() {
        DataPipelineSchedulerProperties properties = new DataPipelineSchedulerProperties();

        assertThat(properties.isEnabled()).isFalse();
        assertThat(properties.getPythonExecutable()).isNotBlank();
        assertThat(properties.getWorkingDirectory()).isEqualTo(Path.of("data-pipeline"));
        assertThat(properties.getTimeout()).isEqualTo(Duration.ofMinutes(30));
        assertThat(properties.getZone()).isEqualTo("Asia/Seoul");
        assertThat(properties.getTourApiEvents().getScript())
                .isEqualTo(Path.of("scripts", "run_events.py"));
        assertThat(properties.getTourApiEvents().getCron())
                .isEqualTo(DataPipelineSchedulerProperties.DEFAULT_TOUR_API_CRON);
        assertThat(properties.getSeoulCultureEvents().getScript())
                .isEqualTo(Path.of("scripts", "run_seoul_culture_event.py"));
        assertThat(properties.getSeoulCultureEvents().getCron())
                .isEqualTo(DataPipelineSchedulerProperties.DEFAULT_SEOUL_CULTURE_CRON);
        assertThat(properties.getRepeatedBlogTrend().getScript())
                .isEqualTo(Path.of("scripts", "repeated_blog_trend.py"));
        assertThat(properties.getRepeatedBlogTrend().getCron())
                .isEqualTo(DataPipelineSchedulerProperties.DEFAULT_REPEATED_BLOG_TREND_CRON);

        properties.validate();
    }

    @Test
    void validationRejectsNonPositiveTimeout() {
        DataPipelineSchedulerProperties properties = new DataPipelineSchedulerProperties();
        properties.setTimeout(Duration.ZERO);

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("timeout");
    }

    @Test
    void partialJobConfigurationRetainsTheOtherJobDefaults() {
        DataPipelineSchedulerProperties properties = new DataPipelineSchedulerProperties();
        DataPipelineSchedulerProperties.Job tourApiOverride = new DataPipelineSchedulerProperties.Job();
        tourApiOverride.setCron("0 30 6 ? * MON");
        properties.setTourApiEvents(tourApiOverride);

        properties.validate();

        assertThat(properties.getTourApiEvents().getScript())
                .isEqualTo(Path.of("scripts", "run_events.py"));
        assertThat(properties.getTourApiEvents().getCron()).isEqualTo("0 30 6 ? * MON");
        assertThat(properties.getRepeatedBlogTrend().getScript())
                .isEqualTo(Path.of("scripts", "repeated_blog_trend.py"));
    }
}
