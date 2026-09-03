package com.ddemachim.server.global.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

@SpringBootTest(properties = "jwt.secret=test-only-jwt-signing-key-0123456789")
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

    @Test
    void 토큰이_없으면_코스_미리보기_API는_인증_오류를_반환한다() throws Exception {
        mockMvc.perform(post("/api/courses/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COMMON401"));
    }

    @Test
    void 토큰이_없으면_외부_API를_사용하는_기능을_호출할_수_없다() throws Exception {
        mockMvc.perform(post("/api/v1/ai-guide/chats")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/ai-courses/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/routes/compare")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/place-search/kakao").queryParam("query", "경복궁"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 인증된_사용자도_MCP_HTTP_엔드포인트에_접근할_수_없다() throws Exception {
        mockMvc.perform(post("/mcp")
                        .header("Authorization", "Bearer " + validToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void 코스_장바구니_API의_기존_인증_보호를_유지한다() throws Exception {
        mockMvc.perform(get("/api/course-basket/places"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("COMMON401"));
    }

    @Test
    void 유효한_토큰은_코스_미리보기의_요청_검증까지_도달한다() throws Exception {
        mockMvc.perform(post("/api/courses/preview")
                        .header("Authorization", "Bearer " + validToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COMMON400"));
    }

    @Test
    void 잘못된_토큰으로_코스_미리보기를_호출하면_기존_오류를_유지한다() throws Exception {
        mockMvc.perform(post("/api/courses/preview")
                        .header("Authorization", "Bearer malformed-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH4012"));
    }

    @Test
    void 만료된_토큰으로_코스_미리보기를_호출하면_기존_오류를_유지한다() throws Exception {
        mockMvc.perform(post("/api/courses/preview")
                        .header("Authorization", "Bearer " + expiredToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH4013"));
    }

    private String validToken() {
        SecretKey signingKey = Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8));
        Instant issuedAt = Instant.now();
        return Jwts.builder()
                .setSubject("42")
                .claim("memberId", 42L)
                .claim("role", "ROLE_USER")
                .setIssuedAt(Date.from(issuedAt))
                .setExpiration(Date.from(issuedAt.plusSeconds(60)))
                .signWith(signingKey)
                .compact();
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
