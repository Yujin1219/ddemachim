package com.ddemachim.server.domain.citydata.service;

import java.time.LocalDateTime;

record CityDataAreaCongestion(
        String areaCode,
        String areaName,
        String category,
        String congestionLevel,
        String congestionMessage,
        Integer populationMin,
        Integer populationMax,
        LocalDateTime populationTime
) {

    static CityDataAreaCongestion empty(CityDataArea area) {
        return new CityDataAreaCongestion(
                area.areaCode(),
                area.areaName(),
                area.category(),
                "정보없음",
                null,
                null,
                null,
                null);
    }
}
