package com.ddemachim.server.domain.event.scheduler;

import com.ddemachim.server.global.properties.DataPipelineSchedulerProperties;
import com.ddemachim.server.global.properties.DataPipelineSchedulerProperties.Job;
import com.ddemachim.server.global.scheduler.PipelineProcessCommand;
import com.ddemachim.server.global.scheduler.PipelineProcessResult;
import com.ddemachim.server.global.scheduler.PipelineProcessRunner;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class EventDataPipelineScheduler {

    private static final Logger log = LoggerFactory.getLogger(EventDataPipelineScheduler.class);

    private final PipelineProcessRunner processRunner;
    private final DataPipelineSchedulerProperties properties;
    private final AtomicBoolean tourApiEventsRunning = new AtomicBoolean(false);
    private final AtomicBoolean seoulCultureEventsRunning = new AtomicBoolean(false);

    public EventDataPipelineScheduler(
            PipelineProcessRunner processRunner,
            DataPipelineSchedulerProperties properties) {
        this.processRunner = processRunner;
        this.properties = properties;
        this.properties.validate();
    }

    @Scheduled(
            cron = "${ddemachim.data-pipeline.scheduler.tour-api-events.cron:0 0 6 ? * MON}",
            zone = "${ddemachim.data-pipeline.scheduler.zone:Asia/Seoul}")
    public void runTourApiEvents() {
        runJob("tour-api-events", properties.getTourApiEvents(), tourApiEventsRunning);
    }

    @Scheduled(
            cron = "${ddemachim.data-pipeline.scheduler.seoul-culture-events.cron:0 10 6 ? * MON}",
            zone = "${ddemachim.data-pipeline.scheduler.zone:Asia/Seoul}")
    public void runSeoulCultureEvents() {
        runJob("seoul-culture-events", properties.getSeoulCultureEvents(), seoulCultureEventsRunning);
    }

    private void runJob(String jobName, Job job, AtomicBoolean running) {
        if (!properties.isEnabled()) {
            log.debug("Data pipeline job '{}' is disabled.", jobName);
            return;
        }
        if (!running.compareAndSet(false, true)) {
            log.warn("Skipping overlapping data pipeline job '{}'.", jobName);
            return;
        }

        try {
            PipelineProcessCommand command = new PipelineProcessCommand(
                    jobName,
                    properties.getPythonExecutable(),
                    job.getScript(),
                    properties.getWorkingDirectory(),
                    properties.getTimeout());
            PipelineProcessResult result = processRunner.run(command);
            logResult(jobName, result);
        } catch (RuntimeException exception) {
            log.error(
                    "Data pipeline job '{}' failed unexpectedly ({}).",
                    jobName,
                    exception.getClass().getSimpleName());
        } finally {
            running.set(false);
        }
    }

    private static void logResult(String jobName, PipelineProcessResult result) {
        switch (result.status()) {
            case SUCCEEDED -> log.info(
                    "Data pipeline job '{}' completed with exit code {}.",
                    jobName,
                    result.exitCode());
            case NON_ZERO_EXIT -> log.error(
                    "Data pipeline job '{}' failed with exit code {}.",
                    jobName,
                    result.exitCode());
            case TIMED_OUT -> log.error("Data pipeline job '{}' timed out.", jobName);
            case START_FAILED, INTERRUPTED, EXECUTION_FAILED -> log.error(
                    "Data pipeline job '{}' failed ({}) {}.",
                    jobName,
                    result.status(),
                    result.failureType());
        }
    }
}
