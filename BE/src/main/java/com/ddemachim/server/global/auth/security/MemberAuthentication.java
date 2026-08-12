package com.ddemachim.server.global.auth.security;

import java.util.Collection;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

public class MemberAuthentication extends UsernamePasswordAuthenticationToken {

    public MemberAuthentication(
            Object principal,
            Collection<? extends GrantedAuthority> authorities) {
        super(principal, null, authorities);
    }
}
