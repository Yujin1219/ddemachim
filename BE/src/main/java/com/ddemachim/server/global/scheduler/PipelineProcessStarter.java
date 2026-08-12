package com.ddemachim.server.global.scheduler;

import java.io.IOException;

@FunctionalInterface
public interface PipelineProcessStarter {

    Process start(PipelineProcessCommand command) throws IOException;
}
