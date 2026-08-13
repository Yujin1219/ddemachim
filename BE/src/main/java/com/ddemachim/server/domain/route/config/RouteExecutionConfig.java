package com.ddemachim.server.domain.route.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class RouteExecutionConfig {

    private static final int ROUTE_WORKER_COUNT = 3;

    @Bean(name = {"routeComparisonExecutor", "routeExecutionExecutor"}, destroyMethod = "shutdown")
    public ExecutorService routeComparisonExecutor() {
        return Executors.newFixedThreadPool(ROUTE_WORKER_COUNT, routeThreadFactory());
    }

    private static ThreadFactory routeThreadFactory() {
        AtomicInteger sequence = new AtomicInteger();
        return runnable -> {
            Thread thread = new Thread(runnable, "route-comparison-" + sequence.incrementAndGet());
            thread.setDaemon(false);
            return thread;
        };
    }
}
