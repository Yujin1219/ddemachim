package com.ddemachim.server.global.scheduler;

import java.io.IOException;
import org.springframework.stereotype.Component;

@Component
public class ProcessBuilderPipelineProcessStarter implements PipelineProcessStarter {

    @Override
    public Process start(PipelineProcessCommand command) throws IOException {
        return createProcessBuilder(command).start();
    }

    ProcessBuilder createProcessBuilder(PipelineProcessCommand command) {
        return new ProcessBuilder(command.commandLine())
                .directory(command.workingDirectory().toFile())
                .redirectOutput(ProcessBuilder.Redirect.INHERIT)
                .redirectError(ProcessBuilder.Redirect.INHERIT);
    }
}
