package com.ddemachim.server.global.scheduler;

import java.io.IOException;
import org.springframework.stereotype.Component;

@Component
public class ProcessBuilderPipelineProcessStarter implements PipelineProcessStarter {

    @Override
    public Process start(PipelineProcessCommand command) throws IOException {
        ProcessBuilder processBuilder = new ProcessBuilder(command.commandLine())
                .directory(command.workingDirectory().toFile())
                .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD);
        return processBuilder.start();
    }
}
