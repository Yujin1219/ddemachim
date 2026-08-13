package com.ddemachim.server.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.ddemachim.server.domain.user.dto.MemberResponse;
import com.ddemachim.server.domain.user.entity.Member;
import com.ddemachim.server.domain.user.enums.Role;
import com.ddemachim.server.domain.user.exception.MemberException;
import com.ddemachim.server.domain.user.repository.MemberRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class MemberServiceTest {

    @Mock
    private MemberRepository memberRepository;

    @InjectMocks
    private MemberService memberService;

    @Test
    void 현재_회원_조회는_회원_정보만_응답으로_변환한다() {
        Member member = Member.create("user@example.com", "encoded-password", "때마침여행자", Role.USER);
        ReflectionTestUtils.setField(member, "id", 42L);
        when(memberRepository.findById(42L)).thenReturn(Optional.of(member));

        MemberResponse.CurrentMemberDTO response = memberService.getCurrentMember(42L);

        assertThat(response.getMemberId()).isEqualTo(42L);
        assertThat(response.getEmail()).isEqualTo("user@example.com");
        assertThat(response.getNickname()).isEqualTo("때마침여행자");
        assertThat(response.getRole()).isEqualTo("ROLE_USER");
    }

    @Test
    void 현재_회원이_없으면_회원_없음_예외를_던진다() {
        when(memberRepository.findById(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> memberService.getCurrentMember(404L))
                .isInstanceOf(MemberException.class)
                .hasMessage("회원을 찾을 수 없습니다.");
    }
}
