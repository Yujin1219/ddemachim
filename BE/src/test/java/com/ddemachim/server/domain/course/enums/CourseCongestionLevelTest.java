package com.ddemachim.server.domain.course.enums;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CourseCongestionLevelTest {

    @Test
    void mapsSeoulFourLevelsToScoresAndPenaltyMinutes() {
        assertThat(CourseCongestionLevel.fromLabel("여유"))
                .extracting(CourseCongestionLevel::score, CourseCongestionLevel::penaltyMinutes)
                .containsExactly(0, 0);
        assertThat(CourseCongestionLevel.fromLabel("보통"))
                .extracting(CourseCongestionLevel::score, CourseCongestionLevel::penaltyMinutes)
                .containsExactly(33, 5);
        assertThat(CourseCongestionLevel.fromLabel("약간 붐빔"))
                .extracting(CourseCongestionLevel::score, CourseCongestionLevel::penaltyMinutes)
                .containsExactly(67, 15);
        assertThat(CourseCongestionLevel.fromLabel("붐빔"))
                .extracting(CourseCongestionLevel::score, CourseCongestionLevel::penaltyMinutes)
                .containsExactly(100, 30);
    }

    @Test
    void missingOrUnknownLevelFallsBackToNormal() {
        assertThat(CourseCongestionLevel.fromLabel(null)).isEqualTo(CourseCongestionLevel.NORMAL);
        assertThat(CourseCongestionLevel.fromLabel("정보없음")).isEqualTo(CourseCongestionLevel.NORMAL);
    }
}
