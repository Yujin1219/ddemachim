package com.ddemachim.server.domain.user.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ddemachim.server.domain.user.dto.AuthResponse;
import com.ddemachim.server.domain.user.service.LocalLoginService;
import com.ddemachim.server.global.apiPayload.exception.ExceptionAdvice;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private LocalLoginService localLoginService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new AuthController(localLoginService))
                .setControllerAdvice(new ExceptionAdvice())
                .build();
    }

    @Test
    void 로그인_성공_응답은_공통_봉투와_회원_정보를_반환한다() throws Exception {
        when(localLoginService.login(any())).thenReturn(AuthResponse.LoginResponseDTO.of(
                "access-token", 1L, "user@example.com", "때마침여행자", "ROLE_USER"));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"user@example.com","password":"password123!"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isSuccess").value(true))
                .andExpect(jsonPath("$.code").value("AUTH2001"))
                .andExpect(jsonPath("$.result.accessToken").value("access-token"))
                .andExpect(jsonPath("$.result.memberId").value(1))
                .andExpect(jsonPath("$.result.email").value("user@example.com"))
                .andExpect(jsonPath("$.result.nickname").value("때마침여행자"))
                .andExpect(jsonPath("$.result.role").value("ROLE_USER"));
    }

    @Test
    void 회원가입은_이메일_비밀번호_닉네임을_받고_생성_상태를_반환한다() throws Exception {
        when(localLoginService.signUp(any())).thenReturn(AuthResponse.LoginResponseDTO.of(
                "access-token", 1L, "user@example.com", "때마침여행자", "ROLE_USER"));

        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"user@example.com","password":"password123!","nickname":"때마침여행자"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("AUTH2011"))
                .andExpect(jsonPath("$.result.accessToken").value("access-token"));
    }

    @Test
    void 회원가입에서_닉네임이_없으면_공통_검증_오류를_반환한다() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"user@example.com","password":"password123!"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.isSuccess").value(false))
                .andExpect(jsonPath("$.code").value("COMMON400"))
                .andExpect(jsonPath("$.result.nickname").exists());
    }
}
