package com.ddemachim.server.global.scheduler;

import java.time.Duration;

public record PipelineProcessResult(
        Status status,
        Integer exitCode,
        Duration elapsed,
        String failureType) {

    public enum Status {
        SUCCEEDED,
        NON_ZERO_EXIT,
        TIMED_OUT,
        START_FAILED,
        INTERRUPTED,
        EXECUTION_FAILED
    }

    public boolean isSuccess() {
        return status == Status.SUCCEEDED;
    }

    public static PipelineProcessResult succeeded(Duration elapsed, int exitCode) {
        return new PipelineProcessResult(Status.SUCCEEDED, exitCode, elapsed, null);
    }

    public static PipelineProcessResult nonZeroExit(Duration elapsed, int exitCode) {
        return new PipelineProcessResult(Status.NON_ZERO_EXIT, exitCode, elapsed, null);
    }

    public static PipelineProcessResult timedOut(Duration elapsed) {
        return new PipelineProcessResult(Status.TIMED_OUT, null, elapsed, null);
    }

    public static PipelineProcessResult startFailed(Duration elapsed, Throwable failure) {
        return new PipelineProcessResult(
                Status.START_FAILED,
                null,
                elapsed,
                failure.getClass().getSimpleName());
    }

    public static PipelineProcessResult interrupted(Duration elapsed, Throwable failure) {
        return new PipelineProcessResult(
                Status.INTERRUPTED,
                null,
                elapsed,
                failure.getClass().getSimpleName());
    }

    public static PipelineProcessResult executionFailed(Duration elapsed, Throwable failure) {
        return new PipelineProcessResult(
                Status.EXECUTION_FAILED,
                null,
                elapsed,
                failure.getClass().getSimpleName());
    }
}
