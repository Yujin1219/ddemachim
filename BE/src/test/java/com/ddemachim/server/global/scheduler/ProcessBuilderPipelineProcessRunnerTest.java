package com.ddemachim.server.global.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ProcessBuilderPipelineProcessRunnerTest {

    @Mock
    private PipelineProcessStarter processStarter;

    @Mock
    private Process process;

    private ProcessBuilderPipelineProcessRunner runner;
    private PipelineProcessCommand command;

    @BeforeEach
    void setUp() {
        runner = new ProcessBuilderPipelineProcessRunner(processStarter);
        command = new PipelineProcessCommand(
                "test-job",
                "python-test",
                Path.of("scripts", "test.py"),
                Path.of("pipeline"),
                Duration.ofMillis(50));
    }

    @Test
    void zeroExitCodeIsReportedAsSuccess() throws IOException, InterruptedException {
        when(processStarter.start(command)).thenReturn(process);
        when(process.waitFor(50L, TimeUnit.MILLISECONDS)).thenReturn(true);
        when(process.exitValue()).thenReturn(0);

        PipelineProcessResult result = runner.run(command);

        assertThat(result.status()).isEqualTo(PipelineProcessResult.Status.SUCCEEDED);
        assertThat(result.isSuccess()).isTrue();
        assertThat(result.exitCode()).isZero();
    }

    @Test
    void nonZeroExitCodeIsReportedAsFailure() throws IOException, InterruptedException {
        when(processStarter.start(command)).thenReturn(process);
        when(process.waitFor(50L, TimeUnit.MILLISECONDS)).thenReturn(true);
        when(process.exitValue()).thenReturn(3);

        PipelineProcessResult result = runner.run(command);

        assertThat(result.status()).isEqualTo(PipelineProcessResult.Status.NON_ZERO_EXIT);
        assertThat(result.isSuccess()).isFalse();
        assertThat(result.exitCode()).isEqualTo(3);
    }

    @Test
    void startFailureIsReportedWithoutPretendingTheJobSucceeded() throws IOException {
        when(processStarter.start(command)).thenThrow(new IOException("process unavailable"));

        PipelineProcessResult result = runner.run(command);

        assertThat(result.status()).isEqualTo(PipelineProcessResult.Status.START_FAILED);
        assertThat(result.isSuccess()).isFalse();
        assertThat(result.failureType()).isEqualTo(IOException.class.getSimpleName());
    }

    @Test
    void timeoutTerminatesTheProcessAndIsReportedAsFailure() throws IOException, InterruptedException {
        when(processStarter.start(command)).thenReturn(process);
        when(process.waitFor(anyLong(), eq(TimeUnit.MILLISECONDS))).thenReturn(false);
        when(process.isAlive()).thenReturn(true);

        PipelineProcessResult result = runner.run(command);

        assertThat(result.status()).isEqualTo(PipelineProcessResult.Status.TIMED_OUT);
        assertThat(result.isSuccess()).isFalse();
        verify(process).destroy();
        verify(process).destroyForcibly();
    }
}
