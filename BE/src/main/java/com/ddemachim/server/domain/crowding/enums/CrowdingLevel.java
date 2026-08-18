package com.ddemachim.server.domain.crowding.enums;

public enum CrowdingLevel {
    RELAXED(25, "여유"),
    NORMAL(50, "보통"),
    CROWDED(75, "약간 붐빔"),
    VERY_CROWDED(100, "붐빔");

    private final int maximumScore;
    private final String label;

    CrowdingLevel(int maximumScore, String label) {
        this.maximumScore = maximumScore;
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    public static CrowdingLevel fromScore(int score) {
        if (score < 1 || score > 100) {
            throw new IllegalArgumentException("Crowding score must be between 1 and 100");
        }
        for (CrowdingLevel level : values()) {
            if (score <= level.maximumScore) {
                return level;
            }
        }
        throw new IllegalStateException("No crowding level for valid score");
    }
}
