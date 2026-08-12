package com.ddemachim.server.global.scheduler;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

@Component
public class ProcessBuilderPipelineProcessRunner implements PipelineProcessRunner {

    private final PipelineProcessStarter processStarter;

    public ProcessBuilderPipelineProcessRunner(PipelineProcessStarter processStarter) {
        this.processStarter = processStarter;
    }

    @Override
    public PipelineProcessResult run(PipelineProcessCommand command) {
        long startedAt = System.nanoTime();
        Process process;
        try {
            process = processStarter.start(command);
        } catch (IOException | RuntimeException exception) {
            return PipelineProcessResult.startFailed(elapsedSince(startedAt), exception);
        }

        try {
            boolean completed = process.waitFor(command.timeout().toMillis(), TimeUnit.MILLISECONDS);
            if (!completed) {
                terminate(process);
                return PipelineProcessResult.timedOut(elapsedSince(startedAt));
            }

            int exitCode = process.exitValue();
            if (exitCode == 0) {
                return PipelineProcessResult.succeeded(elapsedSince(startedAt), exitCode);
            }
            return PipelineProcessResult.nonZeroExit(elapsedSince(startedAt), exitCode);
        } catch (InterruptedException exception) {
            terminate(process);
            Thread.currentThread().interrupt();
            return PipelineProcessResult.interrupted(elapsedSince(startedAt), exception);
        } catch (RuntimeException exception) {
            terminate(process);
            return PipelineProcessResult.executionFailed(elapsedSince(startedAt), exception);
        }
    }

    private static void terminate(Process process) {
        process.destroy();
        if (process.isAlive()) {
            process.destroyForcibly();
        }
    }

    private static Duration elapsedSince(long startedAt) {
        return Duration.ofNanos(Math.max(0, System.nanoTime() - startedAt));
    }
}
