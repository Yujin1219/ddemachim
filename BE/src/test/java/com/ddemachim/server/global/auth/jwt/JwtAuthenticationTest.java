package com.ddemachim.server.global.auth.jwt;

import static org.assertj.core.api.Assertions.assertThat;

import com.ddemachim.server.global.auth.jwt.filter.JwtAuthenticationFilter;
import com.ddemachim.server.global.auth.jwt.provider.JwtTokenProvider;
import com.ddemachim.server.global.auth.jwt.provider.JwtValidationType;
import jakarta.servlet.ServletException;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.security.core.context.SecurityContextHolder;

class JwtAuthenticationTest {

    private static final String TEST_SECRET = "test-only-jwt-signing-key-0123456789";

    private final JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(TEST_SECRET, 60_000L);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void access_token은_회원과_권한_claim을_담고_검증된다() {
        String token = jwtTokenProvider.issueAccessToken(
                42L, com.ddemachim.server.domain.user.enums.Role.USER);

        assertThat(jwtTokenProvider.validateToken(token)).isEqualTo(JwtValidationType.VALID_JWT);
        assertThat(jwtTokenProvider.getMemberIdFromJwt(token)).isEqualTo(42L);
        assertThat(jwtTokenProvider.getRoleFromJwt(token).getAuthority()).isEqualTo("ROLE_USER");
    }

    @Test
    void 잘못된_access_token은_공개_요청을_막지_않고_인증_실패를_표시한다() throws ServletException, IOException {
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtTokenProvider);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer malformed-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean continued = new AtomicBoolean();

        filter.doFilter(request, response, (servletRequest, servletResponse) -> continued.set(true));

        assertThat(continued).isTrue();
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(request.getAttribute(JwtAuthenticationFilter.JWT_VALIDATION_FAILURE_ATTRIBUTE))
                .isEqualTo(JwtValidationType.INVALID_JWT_TOKEN);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void 유효한_access_token은_security_context에_회원과_권한을_설정한다()
            throws ServletException, IOException {
        String token = jwtTokenProvider.issueAccessToken(
                42L, com.ddemachim.server.domain.user.enums.Role.USER);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtTokenProvider);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal()).isEqualTo(42L);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities())
                .extracting("authority")
                .containsExactly("ROLE_USER");
    }
}
