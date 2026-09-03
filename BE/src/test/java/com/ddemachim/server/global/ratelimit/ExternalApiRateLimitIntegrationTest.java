package com.ddemachim.server.global.ratelimit;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "jwt.secret=test-only-jwt-signing-key-0123456789",
        "ddemachim.api-rate-limit.requests-per-minute=2"
})
@AutoConfigureMockMvc
class ExternalApiRateLimitIntegrationTest {

    private static final String TEST_SECRET = "test-only-jwt-signing-key-0123456789";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void thirdExternalApiRequestWithinOneMinuteReturns429() throws Exception {
        String token = validToken();

        performInvalidRouteRequest(token).andExpect(status().isBadRequest());
        performInvalidRouteRequest(token).andExpect(status().isBadRequest());
        performInvalidRouteRequest(token)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("COMMON429"));
    }

    private org.springframework.test.web.servlet.ResultActions performInvalidRouteRequest(String token)
            throws Exception {
        return mockMvc.perform(post("/api/routes/compare")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"));
    }

    private static String validToken() {
        SecretKey signingKey = Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8));
        Instant issuedAt = Instant.now();
        return Jwts.builder()
                .setSubject("429-test-member")
                .claim("memberId", 429L)
                .claim("role", "ROLE_USER")
                .setIssuedAt(Date.from(issuedAt))
                .setExpiration(Date.from(issuedAt.plusSeconds(60)))
                .signWith(signingKey)
                .compact();
    }
}
