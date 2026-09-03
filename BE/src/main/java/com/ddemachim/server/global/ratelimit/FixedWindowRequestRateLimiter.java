package com.ddemachim.server.global.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class FixedWindowRequestRateLimiter {

    private static final Duration WINDOW = Duration.ofMinutes(1);
    private static final long MAXIMUM_TRACKED_MEMBERS = 10_000;

    private final int maximumRequests;
    private final Cache<String, AtomicInteger> counters;

    @Autowired
    public FixedWindowRequestRateLimiter(
            @Value("${ddemachim.api-rate-limit.requests-per-minute:30}") int maximumRequests) {
        this(maximumRequests, WINDOW, Ticker.systemTicker());
    }

    FixedWindowRequestRateLimiter(int maximumRequests, Duration window, Ticker ticker) {
        if (maximumRequests < 1) {
            throw new IllegalArgumentException("Rate limit must be greater than zero");
        }
        this.maximumRequests = maximumRequests;
        this.counters = Caffeine.newBuilder()
                .maximumSize(MAXIMUM_TRACKED_MEMBERS)
                .expireAfterWrite(window)
                .ticker(ticker)
                .build();
    }

    public boolean tryAcquire(String key) {
        AtomicInteger counter = counters.get(key, ignored -> new AtomicInteger());
        return counter.incrementAndGet() <= maximumRequests;
    }
}
