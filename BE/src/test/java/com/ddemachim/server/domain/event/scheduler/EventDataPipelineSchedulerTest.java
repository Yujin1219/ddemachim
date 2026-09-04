package com.ddemachim.server.domain.event.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.ddemachim.server.global.properties.DataPipelineSchedulerProperties;
import com.ddemachim.server.global.properties.DataPipelineSchedulerProperties.Job;
import com.ddemachim.server.global.scheduler.PipelineProcessCommand;
import com.ddemachim.server.global.scheduler.PipelineProcessResult;
import com.ddemachim.server.global.scheduler.PipelineProcessRunner;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EventDataPipelineSchedulerTest {

    @Mock
    private PipelineProcessRunner processRunner;

    private DataPipelineSchedulerProperties properties;
    private EventDataPipelineScheduler scheduler;

    @BeforeEach
    void setUp() {
        properties = new DataPipelineSchedulerProperties();
        properties.setEnabled(true);
        properties.setPythonExecutable("python-test");
        properties.setWorkingDirectory(Path.of("pipeline"));
        properties.setTimeout(Duration.ofSeconds(5));
        properties.setTourApiEvents(new Job(Path.of("scripts", "tour.py"), "0 0 6 ? * MON"));
        properties.setSeoulCultureEvents(
                new Job(Path.of("scripts", "culture.py"), "0 10 6 ? * MON"));
        properties.setRepeatedBlogTrend(
                new Job(Path.of("scripts", "repeated-trend.py"), "0 30 4 * * *"));
        scheduler = new EventDataPipelineScheduler(processRunner, properties);
    }

    @Test
    void runTourApiEventsDelegatesTheConfiguredProcessCommand() {
        when(processRunner.run(any()))
                .thenReturn(PipelineProcessResult.succeeded(Duration.ZERO, 0));

        scheduler.runTourApiEvents();

        ArgumentCaptor<PipelineProcessCommand> commandCaptor =
                ArgumentCaptor.forClass(PipelineProcessCommand.class);
        verify(processRunner).run(commandCaptor.capture());
        PipelineProcessCommand command = commandCaptor.getValue();
        assertThat(command.jobName()).isEqualTo("tour-api-events");
        assertThat(command.interpreter()).isEqualTo("python-test");
        assertThat(command.script()).isEqualTo(Path.of("scripts", "tour.py"));
        assertThat(command.workingDirectory()).isEqualTo(Path.of("pipeline"));
        assertThat(command.timeout()).isEqualTo(Duration.ofSeconds(5));
    }

    @Test
    void runRepeatedBlogTrendDelegatesTheConfiguredProcessCommand() {
        when(processRunner.run(any()))
                .thenReturn(PipelineProcessResult.succeeded(Duration.ZERO, 0));

        scheduler.runRepeatedBlogTrend();

        ArgumentCaptor<PipelineProcessCommand> commandCaptor =
                ArgumentCaptor.forClass(PipelineProcessCommand.class);
        verify(processRunner).run(commandCaptor.capture());
        PipelineProcessCommand command = commandCaptor.getValue();
        assertThat(command.jobName()).isEqualTo("repeated-blog-trend");
        assertThat(command.interpreter()).isEqualTo("python-test");
        assertThat(command.script()).isEqualTo(Path.of("scripts", "repeated-trend.py"));
        assertThat(command.workingDirectory()).isEqualTo(Path.of("pipeline"));
        assertThat(command.timeout()).isEqualTo(Duration.ofSeconds(5));
        assertThat(command.commandLine())
                .containsExactly("python-test", "scripts/repeated-trend.py");
    }

    @Test
    void disabledSchedulerDoesNotStartEitherPipeline() {
        properties.setEnabled(false);

        scheduler.runTourApiEvents();
        scheduler.runSeoulCultureEvents();
        scheduler.runRepeatedBlogTrend();

        verifyNoInteractions(processRunner);
    }

    @Test
    void overlappingRunsOfTheSameJobAreSkipped() throws Exception {
        CountDownLatch firstRunStarted = new CountDownLatch(1);
        CountDownLatch releaseFirstRun = new CountDownLatch(1);
        when(processRunner.run(any())).thenAnswer(invocation -> {
            firstRunStarted.countDown();
            if (!releaseFirstRun.await(2, TimeUnit.SECONDS)) {
                throw new AssertionError("Timed out waiting for the first pipeline run");
            }
            return PipelineProcessResult.succeeded(Duration.ZERO, 0);
        });

        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            var firstRun = executor.submit(scheduler::runTourApiEvents);
            assertThat(firstRunStarted.await(2, TimeUnit.SECONDS)).isTrue();

            scheduler.runTourApiEvents();

            releaseFirstRun.countDown();
            firstRun.get(2, TimeUnit.SECONDS);
            verify(processRunner, times(1)).run(any());
        } finally {
            releaseFirstRun.countDown();
            executor.shutdownNow();
        }
    }
}
