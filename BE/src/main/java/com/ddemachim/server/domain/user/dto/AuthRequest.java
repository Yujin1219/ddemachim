package com.ddemachim.server.domain.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

public final class AuthRequest {

    private AuthRequest() {
    }

    @Getter
    @Builder
    @NoArgsConstructor(access = AccessLevel.PROTECTED)
    @AllArgsConstructor
    @Schema(description = "이메일 회원가입 요청")
    public static class SignUpDTO {

        @Schema(description = "이메일", example = "user@example.com")
        @NotBlank(message = "이메일은 필수입니다.")
        @Email(message = "올바른 이메일 형식이어야 합니다.")
        @Size(max = 254, message = "이메일은 254자 이하여야 합니다.")
        private String email;

        @Schema(description = "비밀번호", example = "password123!")
        @NotBlank(message = "비밀번호는 필수입니다.")
        @Size(min = 8, max = 100, message = "비밀번호는 8자 이상 100자 이하여야 합니다.")
        private String password;

        @Schema(description = "닉네임", example = "때마침여행자")
        @NotBlank(message = "닉네임은 필수입니다.")
        @Size(max = 30, message = "닉네임은 30자 이하여야 합니다.")
        private String nickname;
    }

    @Getter
    @Builder
    @NoArgsConstructor(access = AccessLevel.PROTECTED)
    @AllArgsConstructor
    @Schema(description = "이메일 로그인 요청")
    public static class LoginDTO {

        @Schema(description = "이메일", example = "user@example.com")
        @NotBlank(message = "이메일은 필수입니다.")
        @Email(message = "올바른 이메일 형식이어야 합니다.")
        @Size(max = 254, message = "이메일은 254자 이하여야 합니다.")
        private String email;

        @Schema(description = "비밀번호", example = "password123!")
        @NotBlank(message = "비밀번호는 필수입니다.")
        private String password;
    }
}
