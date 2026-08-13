package com.ddemachim.server.domain.user.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.user.dto.MemberResponse;
import com.ddemachim.server.domain.user.enums.Role;
import com.ddemachim.server.domain.user.exception.MemberErrorStatus;
import com.ddemachim.server.domain.user.exception.MemberException;
import com.ddemachim.server.domain.user.service.MemberService;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import com.ddemachim.server.global.auth.security.MemberAuthentication;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class MemberControllerTest {

    @Mock
    private MemberService memberService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new MemberController(memberService))
                .setControllerAdvice(new ExceptionAdvice())
                .build();
    }

    @Test
    void 현재_회원_조회는_인증_주체의_ID로_공통_응답을_반환한다() throws Exception {
        Authentication authentication = new MemberAuthentication(42L, List.of(Role.USER.toGrantedAuthority()));
        when(memberService.getCurrentMember(42L)).thenReturn(MemberResponse.CurrentMemberDTO.builder()
                .memberId(42L)
                .email("user@example.com")
                .nickname("때마침여행자")
                .role("ROLE_USER")
                .build());

        mockMvc.perform(get("/api/v1/members/me")
                        .principal(authentication)
                        .param("memberId", "999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.code").value("MEMBER2001"))
                .andExpect(jsonPath("$.result.memberId").value(42))
                .andExpect(jsonPath("$.result.email").value("user@example.com"))
                .andExpect(jsonPath("$.result.nickname").value("때마침여행자"))
                .andExpect(jsonPath("$.result.role").value("ROLE_USER"));

        verify(memberService).getCurrentMember(42L);
    }

    @Test
    void 현재_회원이_없으면_공통_회원_없음_응답을_반환한다() throws Exception {
        Authentication authentication = new MemberAuthentication(404L, List.of(Role.USER.toGrantedAuthority()));
        when(memberService.getCurrentMember(404L))
                .thenThrow(new MemberException(MemberErrorStatus.MEMBER_NOT_FOUND));

        mockMvc.perform(get("/api/v1/members/me").principal(authentication))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("MEMBER4041"))
                .andExpect(jsonPath("$.result").doesNotExist());
    }
}
