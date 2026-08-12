package com.ddemachim.server.domain.user.controller;

import com.ddemachim.server.domain.user.dto.AuthRequest;
import com.ddemachim.server.domain.user.dto.AuthResponse;
import com.ddemachim.server.domain.user.exception.AuthSuccessStatus;
import com.ddemachim.server.domain.user.service.LocalLoginService;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "인증(Auth)", description = "이메일 회원가입 및 로그인 API")
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final LocalLoginService localLoginService;

    @Operation(
            summary = "이메일 회원가입",
            description = "이메일, 비밀번호, 닉네임으로 회원을 생성하고 액세스 토큰을 발급합니다.")
    @PostMapping("/signup")
    public ResponseEntity<ApiResponse<AuthResponse.LoginResponseDTO>> signUp(
            @Valid @RequestBody AuthRequest.SignUpDTO request) {
        return respond(AuthSuccessStatus.SIGN_UP_SUCCESS, localLoginService.signUp(request));
    }

    @Operation(
            summary = "이메일 로그인",
            description = "이메일과 비밀번호를 검증하고 액세스 토큰을 발급합니다.")
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse.LoginResponseDTO>> login(
            @Valid @RequestBody AuthRequest.LoginDTO request) {
        return respond(AuthSuccessStatus.LOGIN_SUCCESS, localLoginService.login(request));
    }

    private ResponseEntity<ApiResponse<AuthResponse.LoginResponseDTO>> respond(
            AuthSuccessStatus status,
            AuthResponse.LoginResponseDTO result) {
        return ResponseEntity.status(status.getHttpStatus()).body(ApiResponse.of(status, result));
    }
}
