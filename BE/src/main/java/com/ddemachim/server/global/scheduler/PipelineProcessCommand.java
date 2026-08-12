package com.ddemachim.server.global.scheduler;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Objects;
import org.springframework.util.StringUtils;

public record PipelineProcessCommand(
        String jobName,
        String interpreter,
        Path script,
        Path workingDirectory,
        Duration timeout) {

    public PipelineProcessCommand {
        if (!StringUtils.hasText(jobName)) {
            throw new IllegalArgumentException("Pipeline job name must not be blank");
        }
        if (!StringUtils.hasText(interpreter)) {
            throw new IllegalArgumentException("Pipeline interpreter must not be blank");
        }
        Objects.requireNonNull(script, "Pipeline script must not be null");
        Objects.requireNonNull(workingDirectory, "Pipeline working directory must not be null");
        Objects.requireNonNull(timeout, "Pipeline timeout must not be null");
        if (timeout.isZero() || timeout.isNegative()) {
            throw new IllegalArgumentException("Pipeline timeout must be greater than zero");
        }
    }

    public List<String> commandLine() {
        return List.of(interpreter, script.toString());
    }
}
