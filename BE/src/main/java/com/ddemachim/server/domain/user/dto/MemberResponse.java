package com.ddemachim.server.domain.user.dto;

import com.ddemachim.server.domain.user.entity.Member;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

public final class MemberResponse {

    private MemberResponse() {
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "현재 회원 정보 응답")
    public static class CurrentMemberDTO {

        @Schema(description = "회원 ID", example = "1")
        private Long memberId;

        @Schema(description = "이메일", example = "user@example.com")
        private String email;

        @Schema(description = "닉네임", example = "때마침여행자")
        private String nickname;

        @Schema(description = "권한", example = "ROLE_USER")
        private String role;

        public static CurrentMemberDTO of(Member member) {
            return CurrentMemberDTO.builder()
                    .memberId(member.getId())
                    .email(member.getEmail())
                    .nickname(member.getNickname())
                    .role(member.getRole().getAuthority())
                    .build();
        }
    }
}
