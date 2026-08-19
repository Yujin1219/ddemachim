package com.ddemachim.server.domain.route.service;

public enum PedestrianSearchOption {
    RECOMMENDED("0", 0),
    RECOMMENDED_MAIN_ROAD("4", 1),
    SHORTEST("10", 2),
    SHORTEST_WITHOUT_STAIRS("30", 3);

    private final String providerValue;
    private final int stableOrder;

    PedestrianSearchOption(String providerValue, int stableOrder) {
        this.providerValue = providerValue;
        this.stableOrder = stableOrder;
    }

    String providerValue() {
        return providerValue;
    }

    public int stableOrder() {
        return stableOrder;
    }
}
