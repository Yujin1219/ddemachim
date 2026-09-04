package com.ddemachim.server.global.scheduler;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class ProcessBuilderPipelineProcessStarterTest {

    @Test
    void forwardsPythonOutputAndErrorsToTheServerProcessLogs() {
        ProcessBuilderPipelineProcessStarter starter = new ProcessBuilderPipelineProcessStarter();
        PipelineProcessCommand command = new PipelineProcessCommand(
                "test-job",
                "python3",
                Path.of("scripts", "test.py"),
                Path.of("data-pipeline"),
                Duration.ofMinutes(1));

        ProcessBuilder processBuilder = starter.createProcessBuilder(command);

        assertThat(processBuilder.redirectOutput()).isEqualTo(ProcessBuilder.Redirect.INHERIT);
        assertThat(processBuilder.redirectError()).isEqualTo(ProcessBuilder.Redirect.INHERIT);
    }
}
