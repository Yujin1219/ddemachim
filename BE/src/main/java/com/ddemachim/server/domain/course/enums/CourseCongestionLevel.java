package com.ddemachim.server.domain.course.enums;

import java.util.Arrays;

public enum CourseCongestionLevel {
    RELAXED("여유", 0, 0),
    NORMAL("보통", 33, 5),
    SLIGHTLY_CROWDED("약간 붐빔", 67, 15),
    CROWDED("붐빔", 100, 30);

    private final String label;
    private final int score;
    private final int penaltyMinutes;

    CourseCongestionLevel(String label, int score, int penaltyMinutes) {
        this.label = label;
        this.score = score;
        this.penaltyMinutes = penaltyMinutes;
    }

    public String label() {
        return label;
    }

    public int score() {
        return score;
    }

    public int penaltyMinutes() {
        return penaltyMinutes;
    }

    public static CourseCongestionLevel fromLabel(String label) {
        if (label == null) {
            return NORMAL;
        }
        String normalized = label.trim();
        return Arrays.stream(values())
                .filter(level -> level.label.equals(normalized))
                .findFirst()
                .orElse(NORMAL);
    }
}
