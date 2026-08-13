package com.ddemachim.server.global.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SecurityConfigTest {

    private static final String TEST_SECRET = "test-only-jwt-signing-key-0123456789";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void 토큰이_없어도_공개_API는_통과한다() throws Exception {
        mockMvc.perform(get("/api/citydata/congestion/jongno"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true));
    }

    @Test
    void 토큰이_없으면_현재_회원_API는_인증_오류를_반환한다() throws Exception {
        mockMvc.perform(get("/api/v1/members/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COMMON401"));
    }

    @Test
    void 잘못된_토큰은_공개_API를_막지_않는다() throws Exception {
        mockMvc.perform(get("/api/citydata/congestion/jongno")
                        .header("Authorization", "Bearer malformed-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true));
    }

    @Test
    void 만료된_토큰은_공개_API를_막지_않는다() throws Exception {
        mockMvc.perform(get("/api/citydata/congestion/jongno")
                        .header("Authorization", "Bearer " + expiredToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true));
    }

    @Test
    void 잘못된_토큰으로_현재_회원_API를_호출하면_기존_오류를_유지한다() throws Exception {
        mockMvc.perform(get("/api/v1/members/me")
                        .header("Authorization", "Bearer malformed-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH4012"));
    }

    @Test
    void 만료된_토큰으로_현재_회원_API를_호출하면_기존_오류를_유지한다() throws Exception {
        mockMvc.perform(get("/api/v1/members/me")
                        .header("Authorization", "Bearer " + expiredToken()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH4013"));
    }

    private String expiredToken() {
        SecretKey signingKey = Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8));
        Instant expiredAt = Instant.now().minusSeconds(60);
        return Jwts.builder()
                .setSubject("42")
                .claim("memberId", 42L)
                .claim("role", "ROLE_USER")
                .setIssuedAt(Date.from(expiredAt.minusSeconds(60)))
                .setExpiration(Date.from(expiredAt))
                .signWith(signingKey)
                .compact();
    }
}
