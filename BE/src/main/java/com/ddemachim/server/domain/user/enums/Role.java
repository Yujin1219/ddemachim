package com.ddemachim.server.domain.user.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

@Getter
@RequiredArgsConstructor
public enum Role {

    USER("ROLE_USER");

    private final String authority;

    public GrantedAuthority toGrantedAuthority() {
        return new SimpleGrantedAuthority(authority);
    }

    public static Role fromAuthority(String authority) {
        for (Role role : values()) {
            if (role.authority.equals(authority)) {
                return role;
            }
        }
        throw new IllegalArgumentException("지원하지 않는 권한입니다.");
    }
}
