package com.ddemachim.server.domain.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

public final class AuthResponse {

    private AuthResponse() {
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "이메일 인증 성공 응답")
    public static class LoginResponseDTO {

        @Schema(description = "액세스 토큰", example = "eyJhbGciOiJIUzI1NiJ9...")
        private String accessToken;

        @Schema(description = "회원 ID", example = "1")
        private Long memberId;

        @Schema(description = "이메일", example = "user@example.com")
        private String email;

        @Schema(description = "닉네임", example = "때마침여행자")
        private String nickname;

        @Schema(description = "권한", example = "ROLE_USER")
        private String role;

        public static LoginResponseDTO of(
                String accessToken,
                Long memberId,
                String email,
                String nickname,
                String role) {
            return LoginResponseDTO.builder()
                    .accessToken(accessToken)
                    .memberId(memberId)
                    .email(email)
                    .nickname(nickname)
                    .role(role)
                    .build();
        }
    }
}
