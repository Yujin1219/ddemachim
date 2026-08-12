package com.ddemachim.server.domain.citydata.scheduler;

import com.ddemachim.server.domain.citydata.service.CityDataCongestionService;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class CityDataCongestionScheduler {

    private static final Logger log = LoggerFactory.getLogger(CityDataCongestionScheduler.class);

    private final CityDataCongestionService cityDataCongestionService;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public CityDataCongestionScheduler(CityDataCongestionService cityDataCongestionService) {
        this.cityDataCongestionService = cityDataCongestionService;
    }

    @Scheduled(fixedDelayString = "${ddemachim.citydata.seoul.refresh-delay-millis:300000}")
    public void refreshJongnoCongestion() {
        if (!running.compareAndSet(false, true)) {
            log.warn("Skipping overlapping Seoul citydata congestion refresh.");
            return;
        }
        try {
            cityDataCongestionService.refresh();
        } finally {
            running.set(false);
        }
    }
}
