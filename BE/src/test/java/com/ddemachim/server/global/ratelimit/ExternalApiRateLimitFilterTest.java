package com.ddemachim.server.global.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.global.auth.security.MemberAuthentication;
import com.github.benmanes.caffeine.cache.Ticker;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.ObjectMapper;

class ExternalApiRateLimitFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void returnsCommon429AfterAnAuthenticatedMemberExceedsTheLimit() throws Exception {
        FixedWindowRequestRateLimiter limiter =
                new FixedWindowRequestRateLimiter(1, Duration.ofMinutes(1), Ticker.systemTicker());
        ExternalApiRateLimitFilter filter = new ExternalApiRateLimitFilter(limiter, new ObjectMapper());
        SecurityContextHolder.getContext().setAuthentication(new MemberAuthentication(42L, List.of()));

        MockHttpServletResponse firstResponse = execute(filter, "/api/routes/compare");
        MockHttpServletResponse secondResponse = execute(filter, "/api/routes/compare");

        assertThat(firstResponse.getStatus()).isEqualTo(200);
        assertThat(secondResponse.getStatus()).isEqualTo(429);
        assertThat(secondResponse.getContentAsString()).contains("COMMON429");
    }

    private static MockHttpServletResponse execute(ExternalApiRateLimitFilter filter, String path)
            throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setRequestURI(path);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
