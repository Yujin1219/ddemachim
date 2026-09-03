package com.ddemachim.server.global.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.benmanes.caffeine.cache.Ticker;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class FixedWindowRequestRateLimiterTest {

    @Test
    void rejectsRequestsBeyondTheConfiguredLimitWithinOneWindow() {
        MutableTicker ticker = new MutableTicker();
        FixedWindowRequestRateLimiter limiter =
                new FixedWindowRequestRateLimiter(2, Duration.ofMinutes(1), ticker);

        assertThat(limiter.tryAcquire("member:1")).isTrue();
        assertThat(limiter.tryAcquire("member:1")).isTrue();
        assertThat(limiter.tryAcquire("member:1")).isFalse();
        assertThat(limiter.tryAcquire("member:2")).isTrue();

        ticker.advance(Duration.ofMinutes(1));

        assertThat(limiter.tryAcquire("member:1")).isTrue();
    }

    private static final class MutableTicker implements Ticker {
        private long nanos;

        @Override
        public long read() {
            return nanos;
        }

        void advance(Duration duration) {
            nanos += duration.toNanos();
        }
    }
}
