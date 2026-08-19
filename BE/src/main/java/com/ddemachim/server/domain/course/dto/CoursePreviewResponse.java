package com.ddemachim.server.domain.course.dto;

import com.ddemachim.server.domain.course.enums.CourseDwellSource;
import com.ddemachim.server.domain.course.enums.CourseHoursSourceType;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Schema(description = "저장 전 코스 미리보기 응답")
public record CoursePreviewResponse(
        @Schema(description = "미리보기를 계산한 시각") Instant generatedAt,
        @Schema(description = "코스 진행 날짜", example = "2026-08-18") LocalDate serviceDate,
        @Schema(description = "요청한 출발 희망 시각", example = "10:00") LocalTime desiredStartTime,
        @Schema(description = "요청한 종료 희망 시각", example = "18:00") LocalTime desiredEndTime,
        @Schema(description = "사용자가 비교할 코스 선택지") List<Option> options) {

    public CoursePreviewResponse {
        options = options == null ? List.of() : List.copyOf(options);
    }

    @Schema(description = "전략별 코스 선택지")
    public record Option(
            @Schema(description = "코스 계산 전략", example = "FAST") CourseRouteStrategy strategy,
            @Schema(description = "방문 장소 수", example = "4") Integer stopCount,
            @Schema(description = "체류와 이동을 합한 전체 소요시간(분)", example = "260") Integer totalDurationMinutes,
            @Schema(description = "전체 이동시간(분)", example = "52") Integer totalTravelMinutes,
            @Schema(description = "전체 이동거리(미터)", example = "7800") Integer totalDistanceMeters,
            @Schema(description = "전체 예상 오르막 고도(미터)", example = "32.50") BigDecimal totalAscentMeters,
            @Schema(description = "장소별 예상 혼잡도의 평균 점수. 데이터가 없으면 null", example = "42.50")
                    BigDecimal averageCongestionScore,
            @Schema(description = "계산된 코스 시작 시각", example = "10:00") LocalTime scheduledStart,
            @Schema(description = "계산된 코스 종료 시각", example = "14:20") LocalTime scheduledEnd,
            @Schema(description = "방문 순서대로 정렬된 장소") List<Stop> stops) {

        public Option {
            stops = stops == null ? List.of() : List.copyOf(stops);
        }
    }

    @Schema(description = "코스 미리보기의 장소별 일정")
    public record Stop(
            @Schema(description = "방문 순서", example = "1") Integer sequenceNo,
            @Schema(description = "원본 코스 장바구니 항목 ID", example = "10") Long basketItemId,
            @Schema(description = "장소명", example = "경복궁") String placeName,
            @Schema(description = "주소", example = "서울 종로구 사직로 161") String address,
            @Schema(description = "위도", example = "37.5776") Double latitude,
            @Schema(description = "경도", example = "126.9769") Double longitude,
            @Schema(description = "장소의 기본 체류시간(분)", example = "60") Integer defaultDwellMinutes,
            @Schema(description = "이번 코스에 적용한 체류시간(분)", example = "60") Integer dwellMinutes,
            @Schema(description = "체류시간 설정 출처", example = "DEFAULT") CourseDwellSource dwellSource,
            @Schema(description = "사용자가 입력한 최종 도착 제한 시각", example = "11:00") LocalTime arrivalDeadline,
            @Schema(description = "도착 제한 시각보다 일찍 도착하도록 적용한 여유시간(분)", example = "10")
                    Integer arrivalBufferMinutes,
            @Schema(description = "예정 도착 시각", example = "10:50") LocalTime scheduledArrival,
            @Schema(description = "예정 출발 시각", example = "11:50") LocalTime scheduledDeparture,
            @Schema(description = "직전 지점에서 이동하는 데 걸리는 시간(분)", example = "10")
                    Integer travelMinutesFromPrevious,
            @Schema(description = "직전 지점에서의 이동거리(미터)", example = "800") Integer travelDistanceMeters,
            @Schema(description = "직전 지점에서 예상되는 오르막 고도(미터)", example = "5.20") BigDecimal ascentMeters,
            @Schema(description = "장소의 예상 혼잡도 점수. 데이터가 없으면 null", example = "30.00")
                    BigDecimal congestionScore,
            @Schema(description = "적용한 운영시간의 출처", example = "REAL") CourseHoursSourceType hoursSourceType,
            @Schema(description = "적용한 운영 시작 시각", example = "09:00") LocalTime openTime,
            @Schema(description = "적용한 운영 종료 시각", example = "18:00") LocalTime closeTime,
            @Schema(description = "연결된 팝업·행사 ID. 없으면 null", example = "20") Long eventId,
            @Schema(description = "팝업·행사 종료 시각 스냅샷. 없으면 null", example = "17:30") LocalTime eventEndTime,
            @Schema(description = "직전 지점에서 현재 장소까지의 원본 TMAP 경로") RouteOption incomingRoute) {
    }
}
