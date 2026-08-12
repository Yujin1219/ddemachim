package com.ddemachim.server.global.scheduler;

public interface PipelineProcessRunner {

    PipelineProcessResult run(PipelineProcessCommand command);
}
