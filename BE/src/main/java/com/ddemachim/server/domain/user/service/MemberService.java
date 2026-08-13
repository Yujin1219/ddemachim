package com.ddemachim.server.domain.user.service;

import com.ddemachim.server.domain.user.dto.MemberResponse;
import com.ddemachim.server.domain.user.exception.MemberErrorStatus;
import com.ddemachim.server.domain.user.exception.MemberException;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private final MemberRepository memberRepository;

    public MemberResponse.CurrentMemberDTO getCurrentMember(Long memberId) {
        if (memberId == null) {
            throw new MemberException(MemberErrorStatus.MEMBER_NOT_FOUND);
        }

        return memberRepository.findById(memberId)
                .map(MemberResponse.CurrentMemberDTO::of)
                .orElseThrow(() -> new MemberException(MemberErrorStatus.MEMBER_NOT_FOUND));
    }
}
