package com.ddemachim.server.global.auth.security;

import com.ddemachim.server.global.apiPayload.ApiResponse;
import com.ddemachim.server.global.apiPayload.code.status.ErrorStatus;
import com.ddemachim.server.domain.user.exception.AuthErrorStatus;
import com.ddemachim.server.global.auth.jwt.filter.JwtAuthenticationFilter;
import com.ddemachim.server.global.auth.jwt.provider.JwtValidationType;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class CustomJwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ObjectMapper objectMapper;

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException) throws IOException, ServletException {
        Object validationFailure = request.getAttribute(JwtAuthenticationFilter.JWT_VALIDATION_FAILURE_ATTRIBUTE);
        if (validationFailure instanceof JwtValidationType validationType) {
            AuthErrorStatus status = validationType == JwtValidationType.EXPIRED_JWT_TOKEN
                    ? AuthErrorStatus.EXPIRED_ACCESS_TOKEN
                    : AuthErrorStatus.INVALID_ACCESS_TOKEN;
            writeFailure(response, status.getHttpStatus().value(), status.getCode(), status.getMessage());
            return;
        }

        writeFailure(
                response,
                ErrorStatus._UNAUTHORIZED.getHttpStatus().value(),
                ErrorStatus._UNAUTHORIZED.getCode(),
                ErrorStatus._UNAUTHORIZED.getMessage());
    }

    private void writeFailure(HttpServletResponse response, int status, String code, String message)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(
                response.getWriter(),
                ApiResponse.onFailure(code, message, null));
    }
}
