package com.ddemachim.server.global.properties;

import java.nio.file.Path;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.ZoneId;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@ConfigurationProperties(prefix = "ddemachim.data-pipeline.scheduler")
public class DataPipelineSchedulerProperties {

    public static final String DEFAULT_ZONE = "Asia/Seoul";
    public static final String DEFAULT_TOUR_API_CRON = "0 0 6 ? * MON";
    public static final String DEFAULT_SEOUL_CULTURE_CRON = "0 10 6 ? * MON";

    private boolean enabled = true;
    private String pythonExecutable = defaultPythonExecutable();
    private Path workingDirectory = Path.of("..", "data-pipeline");
    private Duration timeout = Duration.ofMinutes(30);
    private String zone = DEFAULT_ZONE;
    private Job tourApiEvents = new Job(
            Path.of("scripts", "run_events.py"),
            DEFAULT_TOUR_API_CRON);
    private Job seoulCultureEvents = new Job(
            Path.of("scripts", "run_seoul_culture_event.py"),
            DEFAULT_SEOUL_CULTURE_CRON);

    public void validate() {
        applyMissingJobDefaults();
        if (!StringUtils.hasText(pythonExecutable)) {
            throw new IllegalArgumentException("Data pipeline Python executable must not be blank");
        }
        if (workingDirectory == null) {
            throw new IllegalArgumentException("Data pipeline working directory must be configured");
        }
        if (timeout == null || timeout.isZero() || timeout.isNegative()) {
            throw new IllegalArgumentException("Data pipeline timeout must be greater than zero");
        }
        if (!StringUtils.hasText(zone)) {
            throw new IllegalArgumentException("Data pipeline scheduler zone must not be blank");
        }
        try {
            ZoneId.of(zone);
        } catch (DateTimeException exception) {
            throw new IllegalArgumentException("Data pipeline scheduler zone is invalid", exception);
        }

        validateJob("tour-api-events", tourApiEvents);
        validateJob("seoul-culture-events", seoulCultureEvents);
    }

    private void applyMissingJobDefaults() {
        applyMissingJobDefaults(
                tourApiEvents,
                Path.of("scripts", "run_events.py"),
                DEFAULT_TOUR_API_CRON);
        applyMissingJobDefaults(
                seoulCultureEvents,
                Path.of("scripts", "run_seoul_culture_event.py"),
                DEFAULT_SEOUL_CULTURE_CRON);
    }

    private static void applyMissingJobDefaults(Job job, Path defaultScript, String defaultCron) {
        if (job == null) {
            return;
        }
        if (job.getScript() == null) {
            job.setScript(defaultScript);
        }
        if (job.getCron() == null) {
            job.setCron(defaultCron);
        }
    }

    private static void validateJob(String jobName, Job job) {
        if (job == null || job.getScript() == null || !StringUtils.hasText(job.getScript().toString())) {
            throw new IllegalArgumentException("Data pipeline script must be configured for " + jobName);
        }
        if (!StringUtils.hasText(job.getCron())) {
            throw new IllegalArgumentException("Data pipeline cron must be configured for " + jobName);
        }
    }

    private static String defaultPythonExecutable() {
        String operatingSystem = System.getProperty("os.name", "")
                .toLowerCase(Locale.ROOT);
        return operatingSystem.contains("win") ? "python" : "python3";
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getPythonExecutable() {
        return pythonExecutable;
    }

    public void setPythonExecutable(String pythonExecutable) {
        this.pythonExecutable = pythonExecutable;
    }

    public Path getWorkingDirectory() {
        return workingDirectory;
    }

    public void setWorkingDirectory(Path workingDirectory) {
        this.workingDirectory = workingDirectory;
    }

    public Duration getTimeout() {
        return timeout;
    }

    public void setTimeout(Duration timeout) {
        this.timeout = timeout;
    }

    public String getZone() {
        return zone;
    }

    public void setZone(String zone) {
        this.zone = zone;
    }

    public Job getTourApiEvents() {
        return tourApiEvents;
    }

    public void setTourApiEvents(Job tourApiEvents) {
        this.tourApiEvents = tourApiEvents;
        applyMissingJobDefaults(tourApiEvents, Path.of("scripts", "run_events.py"), DEFAULT_TOUR_API_CRON);
    }

    public Job getSeoulCultureEvents() {
        return seoulCultureEvents;
    }

    public void setSeoulCultureEvents(Job seoulCultureEvents) {
        this.seoulCultureEvents = seoulCultureEvents;
        applyMissingJobDefaults(
                seoulCultureEvents,
                Path.of("scripts", "run_seoul_culture_event.py"),
                DEFAULT_SEOUL_CULTURE_CRON);
    }

    public static class Job {

        private Path script;
        private String cron;

        public Job() {
        }

        public Job(Path script, String cron) {
            this.script = script;
            this.cron = cron;
        }

        public Path getScript() {
            return script;
        }

        public void setScript(Path script) {
            this.script = script;
        }

        public String getCron() {
            return cron;
        }

        public void setCron(String cron) {
            this.cron = cron;
        }
    }
}
