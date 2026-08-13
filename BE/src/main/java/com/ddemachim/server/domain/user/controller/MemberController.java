package com.ddemachim.server.domain.user.controller;

import com.ddemachim.server.domain.user.dto.MemberResponse;
import com.ddemachim.server.domain.user.service.MemberService;
import com.ddemachim.server.domain.user.exception.MemberSuccessStatus;
import com.ddemachim.server.global.apiPayload.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "회원(Member)", description = "현재 로그인한 회원 정보 API")
@RestController
@RequestMapping("/api/v1/members")
@RequiredArgsConstructor
public class MemberController {

    private final MemberService memberService;

    @Operation(
            summary = "현재 회원 정보 조회",
            description = "Bearer 액세스 토큰의 인증 주체를 기준으로 현재 회원 정보를 조회합니다.")
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<MemberResponse.CurrentMemberDTO>> getCurrentMember(
            Authentication authentication) {
        Long memberId = (Long) authentication.getPrincipal();
        MemberResponse.CurrentMemberDTO result = memberService.getCurrentMember(memberId);
        return ResponseEntity.status(MemberSuccessStatus.CURRENT_MEMBER_SUCCESS.getHttpStatus())
                .body(ApiResponse.of(MemberSuccessStatus.CURRENT_MEMBER_SUCCESS, result));
    }
}
