package com.ddemachim.server.domain.citydata.service;

import java.time.LocalDateTime;
import java.util.List;

record CityDataSnapshot(LocalDateTime updatedAt, List<CityDataAreaCongestion> areas) {
}
