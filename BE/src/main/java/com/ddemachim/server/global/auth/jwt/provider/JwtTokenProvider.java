package com.ddemachim.server.global.auth.jwt.provider;

import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtTokenProvider {

    private static final String MEMBER_ID = "memberId";
    private static final String ROLE = "role";

    private final SecretKey signingKey;
    private final long accessTokenExpireTime;

    @Autowired
    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-expire-time:3600000}") long accessTokenExpireTime) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalArgumentException("JWT secret must be configured.");
        }
        if (accessTokenExpireTime <= 0) {
            throw new IllegalArgumentException("JWT access-token expiration must be positive.");
        }
        try {
            this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("JWT secret must be at least 256 bits.", exception);
        }
        this.accessTokenExpireTime = accessTokenExpireTime;
    }

    public String issueAccessToken(Member member) {
        if (member.getId() == null) {
            throw new IllegalArgumentException("A persisted member is required to issue an access token.");
        }
        return issueAccessToken(member.getId(), member.getRole());
    }

    public String issueAccessToken(Long memberId, Role role) {
        if (memberId == null || role == null) {
            throw new IllegalArgumentException("Member identity and role are required to issue an access token.");
        }

        Date issuedAt = new Date();
        Date expiration = new Date(issuedAt.getTime() + accessTokenExpireTime);
        return Jwts.builder()
                .setSubject(memberId.toString())
                .claim(MEMBER_ID, memberId)
                .claim(ROLE, role.getAuthority())
                .setIssuedAt(issuedAt)
                .setExpiration(expiration)
                .signWith(signingKey)
                .compact();
    }

    public JwtValidationType validateToken(String token) {
        if (token == null || token.isBlank()) {
            return JwtValidationType.INVALID_JWT_TOKEN;
        }
        try {
            getBody(token);
            return JwtValidationType.VALID_JWT;
        } catch (ExpiredJwtException exception) {
            return JwtValidationType.EXPIRED_JWT_TOKEN;
        } catch (JwtException | IllegalArgumentException exception) {
            return JwtValidationType.INVALID_JWT_TOKEN;
        }
    }

    public Long getMemberIdFromJwt(String token) {
        Claims claims = getBody(token);
        Object memberId = claims.get(MEMBER_ID);
        if (memberId == null) {
            throw new IllegalArgumentException("JWT memberId claim is missing.");
        }
        try {
            return Long.valueOf(memberId.toString());
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("JWT memberId claim is invalid.", exception);
        }
    }

    public Role getRoleFromJwt(String token) {
        Claims claims = getBody(token);
        String authority = claims.get(ROLE, String.class);
        if (authority == null) {
            throw new IllegalArgumentException("JWT role claim is missing.");
        }
        return Role.fromAuthority(authority);
    }

    private Claims getBody(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
}
