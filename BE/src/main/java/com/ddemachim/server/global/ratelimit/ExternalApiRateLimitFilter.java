package com.ddemachim.server.global.ratelimit;

import com.ddemachim.server.global.apiPayload.ApiResponse;
import com.ddemachim.server.global.apiPayload.code.status.ErrorStatus;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import lombok.NonNull;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

@Component
public class ExternalApiRateLimitFilter extends OncePerRequestFilter {

    private static final Set<String> RATE_LIMITED_PATHS = Set.of(
            "/api/v1/ai-guide/chats",
            "/api/v1/ai-courses/preview",
            "/api/routes/compare",
            "/api/place-search/kakao");

    private static final Set<String> PUBLIC_RATE_LIMITED_PATHS = Set.of(
            "/api/routes/compare", "/api/place-search/kakao");

    private final FixedWindowRequestRateLimiter rateLimiter;
    private final ObjectMapper objectMapper;

    public ExternalApiRateLimitFilter(
            FixedWindowRequestRateLimiter rateLimiter,
            ObjectMapper objectMapper) {
        this.rateLimiter = rateLimiter;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        return !RATE_LIMITED_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean authenticated = authentication != null
                && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken);
        if (!authenticated && !PUBLIC_RATE_LIMITED_PATHS.contains(request.getRequestURI())) {
            filterChain.doFilter(request, response);
            return;
        }

        // Use the connection address; forwarded headers require trusted-proxy configuration.
        String requesterKey = authenticated
                ? "member:" + authentication.getPrincipal()
                : "ip:" + request.getRemoteAddr();
        if (rateLimiter.tryAcquire(requesterKey)) {
            filterChain.doFilter(request, response);
            return;
        }

        ErrorStatus status = ErrorStatus._TOO_MANY_REQUESTS;
        response.setStatus(status.getHttpStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(
                response.getWriter(),
                ApiResponse.onFailure(status.getCode(), status.getMessage(), null));
    }
}
