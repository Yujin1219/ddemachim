package com.ddemachim.server.global.auth.jwt.filter;

import com.ddemachim.server.global.auth.jwt.provider.JwtTokenProvider;
import com.ddemachim.server.global.auth.jwt.provider.JwtValidationType;
import com.ddemachim.server.global.auth.security.MemberAuthentication;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    public static final String JWT_VALIDATION_FAILURE_ATTRIBUTE =
            JwtAuthenticationFilter.class.getName() + ".validationFailure";

    private final JwtTokenProvider jwtTokenProvider;

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
            request.setAttribute(JWT_VALIDATION_FAILURE_ATTRIBUTE, validationType);
            filterChain.doFilter(request, response);
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
            request.setAttribute(JWT_VALIDATION_FAILURE_ATTRIBUTE, JwtValidationType.INVALID_JWT_TOKEN);
            filterChain.doFilter(request, response);
        }
    }

    private String resolveToken(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }
        return null;
    }

}
