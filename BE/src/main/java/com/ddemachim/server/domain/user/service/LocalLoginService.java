package com.ddemachim.server.domain.user.service;

import com.ddemachim.server.domain.user.dto.AuthRequest;
import com.ddemachim.server.domain.user.dto.AuthResponse;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import com.ddemachim.server.domain.user.exception.AuthErrorStatus;
import com.ddemachim.server.domain.user.exception.AuthException;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import com.ddemachim.server.global.auth.jwt.provider.JwtTokenProvider;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class LocalLoginService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    @Transactional
    public AuthResponse.LoginResponseDTO signUp(AuthRequest.SignUpDTO request) {
        String email = normalizeEmail(request.getEmail());
        String nickname = request.getNickname().trim();
        if (memberRepository.existsByEmail(email)) {
            throw new AuthException(AuthErrorStatus.EMAIL_ALREADY_EXISTS);
        }
        if (memberRepository.existsByNickname(nickname)) {
            throw new AuthException(AuthErrorStatus.NICKNAME_ALREADY_EXISTS);
        }

        Member member = memberRepository.save(Member.create(
                email,
                passwordEncoder.encode(request.getPassword()),
                nickname,
                Role.USER));

        return toResponse(member);
    }

    @Transactional(readOnly = true)
    public AuthResponse.LoginResponseDTO login(AuthRequest.LoginDTO request) {
        String email = normalizeEmail(request.getEmail());
        Member member = memberRepository.findByEmail(email)
                .orElseThrow(() -> new AuthException(AuthErrorStatus.LOGIN_FAILED));

        if (!passwordEncoder.matches(request.getPassword(), member.getPassword())) {
            throw new AuthException(AuthErrorStatus.LOGIN_FAILED);
        }

        return toResponse(member);
    }

    private AuthResponse.LoginResponseDTO toResponse(Member member) {
        String accessToken = jwtTokenProvider.issueAccessToken(member);
        return AuthResponse.LoginResponseDTO.of(
                accessToken,
                member.getId(),
                member.getEmail(),
                member.getNickname(),
                member.getRole().getAuthority());
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
