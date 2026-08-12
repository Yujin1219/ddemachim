package com.ddemachim.server.global.auth.jwt.filter;

import com.ddemachim.server.domain.user.exception.AuthErrorStatus;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import com.ddemachim.server.global.auth.jwt.provider.JwtTokenProvider;
import com.ddemachim.server.global.auth.jwt.provider.JwtValidationType;
import com.ddemachim.server.global.auth.security.MemberAuthentication;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {
        String token = resolveToken(request);
        if (!StringUtils.hasText(token)) {
            filterChain.doFilter(request, response);
            return;
        }

        JwtValidationType validationType = jwtTokenProvider.validateToken(token);
        if (validationType != JwtValidationType.VALID_JWT) {
            SecurityContextHolder.clearContext();
            writeFailure(response, validationType == JwtValidationType.EXPIRED_JWT_TOKEN
                    ? AuthErrorStatus.EXPIRED_ACCESS_TOKEN
                    : AuthErrorStatus.INVALID_ACCESS_TOKEN);
            return;
        }

        try {
            Long memberId = jwtTokenProvider.getMemberIdFromJwt(token);
            var role = jwtTokenProvider.getRoleFromJwt(token);
            MemberAuthentication authentication = new MemberAuthentication(
                    memberId,
                    List.of(role.toGrantedAuthority()));
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);
            filterChain.doFilter(request, response);
        } catch (JwtException | IllegalArgumentException exception) {
            SecurityContextHolder.clearContext();
            writeFailure(response, AuthErrorStatus.INVALID_ACCESS_TOKEN);
        }
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }

    private void writeFailure(HttpServletResponse response, AuthErrorStatus status) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(status.getHttpStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(
                response.getWriter(),
                ApiResponse.onFailure(status.getCode(), status.getMessage(), null));
    }
}
