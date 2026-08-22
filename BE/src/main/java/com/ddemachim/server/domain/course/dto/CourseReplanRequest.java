package com.ddemachim.server.domain.course.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.LocalTime;

@Schema(description = "진행 중 코스의 남은 일정 재계산 요청")
public record CourseReplanRequest(
        @NotNull @Positive Long currentStopBasketItemId,
        @NotNull LocalTime departureTime,
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude) {
}
