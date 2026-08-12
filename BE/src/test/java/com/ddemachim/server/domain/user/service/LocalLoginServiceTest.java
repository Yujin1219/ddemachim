package com.ddemachim.server.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.user.dto.AuthRequest;
import com.ddemachim.server.domain.user.dto.AuthResponse;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import com.ddemachim.server.domain.user.exception.AuthException;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import com.ddemachim.server.global.auth.jwt.provider.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class LocalLoginServiceTest {

    @Mock
    private MemberRepository memberRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @InjectMocks
    private LocalLoginService localLoginService;

    @Test
    void 회원가입은_비밀번호를_해시하고_access_token을_발급한다() {
        AuthRequest.SignUpDTO request = AuthRequest.SignUpDTO.builder()
                .email(" User@Example.com ")
                .password("password123!")
                .nickname(" 때마침여행자 ")
                .build();
        Member savedMember = Member.create(
                "user@example.com", "encoded-password", "때마침여행자", Role.USER);
        ReflectionTestUtils.setField(savedMember, "id", 1L);

        when(memberRepository.existsByEmail("user@example.com")).thenReturn(false);
        when(memberRepository.existsByNickname("때마침여행자")).thenReturn(false);
        when(passwordEncoder.encode("password123!")).thenReturn("encoded-password");
        when(memberRepository.save(any(Member.class))).thenReturn(savedMember);
        when(jwtTokenProvider.issueAccessToken(savedMember)).thenReturn("access-token");

        AuthResponse.LoginResponseDTO response = localLoginService.signUp(request);

        assertThat(response.getAccessToken()).isEqualTo("access-token");
        assertThat(response.getMemberId()).isEqualTo(1L);
        assertThat(response.getEmail()).isEqualTo("user@example.com");
        assertThat(response.getNickname()).isEqualTo("때마침여행자");
        assertThat(response.getRole()).isEqualTo("ROLE_USER");
        verify(passwordEncoder).encode("password123!");
        verify(memberRepository).save(any(Member.class));
    }

    @Test
    void 중복_이메일은_회원가입을_거절한다() {
        AuthRequest.SignUpDTO request = AuthRequest.SignUpDTO.builder()
                .email("user@example.com")
                .password("password123!")
                .nickname("때마침여행자")
                .build();
        when(memberRepository.existsByEmail("user@example.com")).thenReturn(true);

        assertThatThrownBy(() -> localLoginService.signUp(request))
                .isInstanceOf(AuthException.class)
                .hasMessage("이미 가입된 이메일입니다.");
        verify(passwordEncoder, never()).encode(any());
        verify(memberRepository, never()).save(any(Member.class));
    }

    @Test
    void 중복_닉네임은_회원가입을_거절한다() {
        AuthRequest.SignUpDTO request = AuthRequest.SignUpDTO.builder()
                .email("user@example.com")
                .password("password123!")
                .nickname("때마침여행자")
                .build();
        when(memberRepository.existsByEmail("user@example.com")).thenReturn(false);
        when(memberRepository.existsByNickname("때마침여행자")).thenReturn(true);

        assertThatThrownBy(() -> localLoginService.signUp(request))
                .isInstanceOf(AuthException.class)
                .hasMessage("이미 사용 중인 닉네임입니다.");
        verify(passwordEncoder, never()).encode(any());
        verify(memberRepository, never()).save(any(Member.class));
    }

    @Test
    void 로그인은_비밀번호를_검증한_뒤_사용자_정보와_토큰을_반환한다() {
        AuthRequest.LoginDTO request = AuthRequest.LoginDTO.builder()
                .email("USER@example.com")
                .password("password123!")
                .build();
        Member member = Member.create(
                "user@example.com", "encoded-password", "때마침여행자", Role.USER);
        ReflectionTestUtils.setField(member, "id", 7L);

        when(memberRepository.findByEmail("user@example.com"))
                .thenReturn(java.util.Optional.of(member));
        when(passwordEncoder.matches("password123!", "encoded-password")).thenReturn(true);
        when(jwtTokenProvider.issueAccessToken(member)).thenReturn("access-token");

        AuthResponse.LoginResponseDTO response = localLoginService.login(request);

        assertThat(response.getMemberId()).isEqualTo(7L);
        assertThat(response.getAccessToken()).isEqualTo("access-token");
        verify(passwordEncoder).matches("password123!", "encoded-password");
    }

    @Test
    void 존재하지_않거나_비밀번호가_틀리면_같은_로그인_실패를_반환한다() {
        AuthRequest.LoginDTO request = AuthRequest.LoginDTO.builder()
                .email("user@example.com")
                .password("wrong-password")
                .build();
        when(memberRepository.findByEmail("user@example.com"))
                .thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> localLoginService.login(request))
                .isInstanceOf(AuthException.class)
                .hasMessage("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
}
