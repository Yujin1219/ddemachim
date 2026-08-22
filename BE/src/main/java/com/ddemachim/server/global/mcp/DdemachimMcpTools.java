package com.ddemachim.server.global.mcp;

import com.ddemachim.server.domain.course.dto.AiCourseRequest;
import com.ddemachim.server.domain.course.dto.AiCourseResponse;
import com.ddemachim.server.domain.course.dto.CoursePreviewRequest;
import com.ddemachim.server.domain.course.dto.CoursePreviewResponse;
import com.ddemachim.server.domain.course.enums.CourseRouteStrategy;
import com.ddemachim.server.domain.course.service.CoursePreviewService;
import com.ddemachim.server.domain.course.service.AiCourseService;
import com.ddemachim.server.domain.crowding.dto.CrowdingRequest;
import com.ddemachim.server.domain.crowding.dto.CrowdingResponse;
import com.ddemachim.server.domain.crowding.service.CrowdingService;
import com.ddemachim.server.domain.place.dto.PlaceDetailResponse;
import com.ddemachim.server.domain.place.dto.PlaceSummaryResponse;
import com.ddemachim.server.domain.place.service.PlaceQueryService;
import com.ddemachim.server.domain.place.service.AiPlaceSearchService;
import com.ddemachim.server.domain.place.service.AiPlaceReferenceSearchService;
import com.ddemachim.server.domain.route.dto.RouteComparisonRequest;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.service.RouteComparisonService;
import com.ddemachim.server.global.apiPayload.exception.GeneralException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * MCP adapter for existing read and course-planning services.
 *
 * <p>This class deliberately contains no place, crowding, route, or course
 * algorithms. It only translates MCP inputs to the existing domain DTOs and
 * returns safe, structured tool responses.
 */
@Service
public class DdemachimMcpTools {

    private static final String INTERNAL_ERROR_CODE = "MCP500";
    private static final String INVALID_INPUT_CODE = "MCP400";
    private static final String UNAUTHORIZED_CODE = "MCP401";

    private final PlaceQueryService placeQueryService;
    private final CrowdingService crowdingService;
    private final RouteComparisonService routeComparisonService;
    private final CoursePreviewService coursePreviewService;
    private final AiPlaceSearchService aiPlaceSearchService;
    private final AiPlaceReferenceSearchService aiPlaceReferenceSearchService;
    private final AiCourseService aiCourseService;

    @Autowired
    public DdemachimMcpTools(
            PlaceQueryService placeQueryService,
            CrowdingService crowdingService,
            RouteComparisonService routeComparisonService,
            CoursePreviewService coursePreviewService,
            AiPlaceSearchService aiPlaceSearchService,
            AiPlaceReferenceSearchService aiPlaceReferenceSearchService,
            AiCourseService aiCourseService) {
        this.placeQueryService = placeQueryService;
        this.crowdingService = crowdingService;
        this.routeComparisonService = routeComparisonService;
        this.coursePreviewService = coursePreviewService;
        this.aiPlaceSearchService = aiPlaceSearchService;
        this.aiPlaceReferenceSearchService = aiPlaceReferenceSearchService;
        this.aiCourseService = aiCourseService;
    }

    public DdemachimMcpTools(
            PlaceQueryService placeQueryService,
            CrowdingService crowdingService,
            RouteComparisonService routeComparisonService,
            CoursePreviewService coursePreviewService) {
        this(placeQueryService, crowdingService, routeComparisonService, coursePreviewService, null, null, null);
    }

    public DdemachimMcpTools(
            PlaceQueryService placeQueryService,
            CrowdingService crowdingService,
            RouteComparisonService routeComparisonService,
            CoursePreviewService coursePreviewService,
            AiPlaceSearchService aiPlaceSearchService,
            AiCourseService aiCourseService) {
        this(placeQueryService, crowdingService, routeComparisonService, coursePreviewService,
                aiPlaceSearchService, null, aiCourseService);
    }

    @McpTool(
            name = "search_places",
            description = "Searches the saved place catalog by keyword, category, district, tag, or filming content type. Use this when the user asks to find places; the returned IDs are internal place IDs suitable for detail and crowding lookups.",
            generateOutputSchema = true)
    public McpToolResponse<AiPlaceSearchService.SearchResult> searchPlaces(
            @McpToolParam(description = "Catalog search filters and page settings", required = true)
            SearchPlacesRequest request) {
        if (request == null) {
            return failure(INVALID_INPUT_CODE, "검색 조건이 필요합니다.", null);
        }
        try {
            if (aiPlaceSearchService == null) {
                return failure(INTERNAL_ERROR_CODE, "AI 장소 검색이 설정되지 않았습니다.", null);
            }
            return success(aiPlaceSearchService.search(new AiPlaceSearchService.SearchCondition(
                    request.query(), request.area(), request.categories(), request.visitDate(), request.limit())));
        } catch (GeneralException exception) {
            return failure(exception.getErrorReasonHttpStatus().getCode(),
                    exception.getErrorReasonHttpStatus().getMessage(), null);
        } catch (RuntimeException exception) {
            return failure(INTERNAL_ERROR_CODE, "장소 검색을 처리할 수 없습니다.", null);
        }
    }

    @McpTool(
            name = "search_nearby_places",
            description = "Searches real saved places around coordinates supplied by the client. Never invent coordinates. Returns PostGIS distance, walking time, opening status, congestion, category, tags and placeId.",
            generateOutputSchema = true)
    public McpToolResponse<AiPlaceSearchService.NearbyResult> searchNearbyPlaces(
            @McpToolParam(description = "Current coordinates and nearby filters", required = true)
            SearchNearbyPlacesRequest request) {
        if (request == null || request.latitude() == null || request.longitude() == null) {
            return failure(INVALID_INPUT_CODE,
                    "현재 위치를 허용하거나 기준이 될 지역/역을 알려주세요.", null);
        }
        try {
            if (aiPlaceSearchService == null) {
                return failure(INTERNAL_ERROR_CODE, "AI 주변 검색이 설정되지 않았습니다.", null);
            }
            return success(aiPlaceSearchService.searchNearby(new AiPlaceSearchService.NearbyCondition(
                    request.latitude(), request.longitude(), request.category(), request.radiusMeters(),
                    request.query(), request.openNow(), request.limit(), request.at())));
        } catch (IllegalArgumentException exception) {
            return failure(INVALID_INPUT_CODE, "유효한 현재 위치 좌표가 필요합니다.", null);
        } catch (RuntimeException exception) {
            return failure(INTERNAL_ERROR_CODE, "주변 장소 검색을 처리할 수 없습니다.", null);
        }
    }

    @McpTool(
            name = "search_places_near_reference",
            description = "Resolves a named landmark such as 경복궁 first, then searches only saved ddemachim places in the requested radius. It uses Kakao only as a coordinate fallback and never returns Kakao results as recommendations.",
            generateOutputSchema = true)
    public McpToolResponse<AiPlaceReferenceSearchService.NearReferenceResult> searchPlacesNearReference(
            @McpToolParam(description = "Named landmark and nearby place filters", required = true)
            SearchPlacesNearReferenceRequest request) {
        if (request == null || !org.springframework.util.StringUtils.hasText(request.reference())) {
            return failure(INVALID_INPUT_CODE, "기준 장소 이름이 필요합니다.", null);
        }
        try {
            if (aiPlaceReferenceSearchService == null) {
                return failure(INTERNAL_ERROR_CODE, "기준 장소 주변 검색이 설정되지 않았습니다.", null);
            }
            return success(aiPlaceReferenceSearchService.search(new AiPlaceReferenceSearchService.NearReferenceCondition(
                    request.reference(), request.category(), request.radiusMeters(), request.query(),
                    request.openNow(), request.limit(), request.at())));
        } catch (IllegalArgumentException exception) {
            return failure(INVALID_INPUT_CODE, "유효한 기준 장소 이름이 필요합니다.", null);
        } catch (RuntimeException exception) {
            return failure(INTERNAL_ERROR_CODE, "기준 장소 주변 검색을 처리할 수 없습니다.", null);
        }
    }

    @McpTool(
            name = "get_place_detail",
            description = "Returns safe catalog details for one saved place, including address, coordinates, operating hours, menus, and public trend information. Use this when the user asks about a specific place.",
            generateOutputSchema = true)
    public McpToolResponse<PlaceDetailResponse> getPlaceDetail(
            @McpToolParam(description = "Internal place ID", required = true) PlaceDetailRequest request) {
        if (request == null || request.placeId() == null || request.placeId() < 1) {
            return failure(INVALID_INPUT_CODE, "유효한 placeId가 필요합니다.", null);
        }
        try {
            return success(placeQueryService.getDetail(request.placeId()));
        } catch (GeneralException exception) {
            return failure(exception.getErrorReasonHttpStatus().getCode(),
                    exception.getErrorReasonHttpStatus().getMessage(), null);
        } catch (RuntimeException exception) {
            return failure(INTERNAL_ERROR_CODE, "장소 상세 조회를 처리할 수 없습니다.", null);
        }
    }

    @McpTool(
            name = "get_crowding",
            description = "Returns the current or requested 30-minute crowding slot for a saved place. Use this before recommending a quiet or less crowded place; the place coordinates are resolved through the existing place service.",
            generateOutputSchema = true)
    public McpToolResponse<CrowdingResult> getCrowding(
            @McpToolParam(description = "Place ID and optional offset date-time", required = true) CrowdingToolRequest request) {
        if (request == null || request.placeId() == null || request.placeId() < 1) {
            return failure(INVALID_INPUT_CODE, "유효한 placeId가 필요합니다.", null);
        }
        try {
            PlaceDetailResponse place = placeQueryService.getDetail(request.placeId());
            if (place.latitude() == null || place.longitude() == null) {
                return failure(INVALID_INPUT_CODE, "장소 좌표가 없어 혼잡도를 조회할 수 없습니다.", null);
            }
            CrowdingRequest.Point point = new CrowdingRequest.Point(
                    "place:" + request.placeId(), place.latitude(), place.longitude());
            List<CrowdingResponse.Point> points = crowdingService.getPointCrowding(
                    new CrowdingRequest.Points(request.at(), List.of(point)));
            return success(new CrowdingResult(request.placeId(), points.getFirst()));
        } catch (GeneralException exception) {
            return failure(exception.getErrorReasonHttpStatus().getCode(),
                    exception.getErrorReasonHttpStatus().getMessage(), null);
        } catch (RuntimeException exception) {
            return failure(INTERNAL_ERROR_CODE, "혼잡도 조회를 처리할 수 없습니다.", null);
        }
    }

    @McpTool(
            name = "get_travel_time",
            description = "Compares walking, transit, and taxi travel options between two saved places. Use this when the user asks how long it takes to move between places; an optional mode filters the existing comparison result.",
            generateOutputSchema = true)
    public McpToolResponse<RouteComparisonResponse> getTravelTime(
            @McpToolParam(description = "Origin and destination place IDs, with an optional route mode filter", required = true)
            TravelTimeRequest request) {
        if (request == null
                || request.originPlaceId() == null
                || request.destinationPlaceId() == null
                || request.originPlaceId() < 1
                || request.destinationPlaceId() < 1) {
            return failure(INVALID_INPUT_CODE, "유효한 출발지와 도착지 placeId가 필요합니다.", null);
        }
        try {
            PlaceDetailResponse origin = placeQueryService.getDetail(request.originPlaceId());
            PlaceDetailResponse destination = placeQueryService.getDetail(request.destinationPlaceId());
            if (origin.latitude() == null || origin.longitude() == null
                    || destination.latitude() == null || destination.longitude() == null) {
                return failure(INVALID_INPUT_CODE, "출발지 또는 도착지 좌표가 없습니다.", null);
            }
            RouteComparisonResponse comparison = routeComparisonService.compare(new RouteComparisonRequest(
                    new RouteComparisonRequest.Coordinate(origin.latitude(), origin.longitude()),
                    new RouteComparisonRequest.Coordinate(destination.latitude(), destination.longitude())));
            if (request.mode() == null) {
                return success(comparison);
            }
            List<RouteComparisonResponse.RouteOption> filtered = comparison.routes().stream()
                    .filter(route -> route.mode() == request.mode())
                    .toList();
            return success(new RouteComparisonResponse(comparison.generatedAt(), filtered));
        } catch (GeneralException exception) {
            return failure(exception.getErrorReasonHttpStatus().getCode(),
                    exception.getErrorReasonHttpStatus().getMessage(), null);
        } catch (RuntimeException exception) {
            return failure(INTERNAL_ERROR_CODE, "이동시간 조회를 처리할 수 없습니다.", null);
        }
    }

    @McpTool(
            name = "create_course",
            description = "Builds a course preview by delegating to the existing CoursePreviewService. Use this after the user has selected basket item IDs, a start point, date, start time, and dwell times. The service returns FAST and any naturally available EASY or QUIET options; no course is persisted by this tool.",
            generateOutputSchema = true)
    public McpToolResponse<CoursePreviewResponse> createCourse(
            @McpToolParam(description = "Course preview input matching the existing course API", required = true)
            CreateCourseRequest request) {
        if (request == null || request.start() == null || request.places() == null || request.places().isEmpty()) {
            return failure(INVALID_INPUT_CODE, "코스 날짜, 출발점, 장소 목록이 필요합니다.", null);
        }
        Long memberId = authenticatedMemberId();
        if (memberId == null) {
            return failure(UNAUTHORIZED_CODE, "코스 생성을 위해 인증이 필요합니다.", null);
        }
        try {
            CoursePreviewRequest serviceRequest = new CoursePreviewRequest(
                    request.serviceDate(),
                    request.desiredStartTime(),
                    new CoursePreviewRequest.Start(
                            request.start().type(),
                            request.start().name(),
                            request.start().latitude(),
                            request.start().longitude()),
                    request.places().stream()
                            .map(place -> new CoursePreviewRequest.Place(
                                    place.basketItemId(), place.dwellMinutes(), place.arrivalDeadline()))
                            .toList());
            CoursePreviewResponse preview = coursePreviewService.preview(memberId, serviceRequest);
            if (request.strategy() == null) {
                return success(preview);
            }
            List<CoursePreviewResponse.Option> selected = preview.options().stream()
                    .filter(option -> option.strategy() == request.strategy())
                    .toList();
            return success(new CoursePreviewResponse(
                    preview.generatedAt(), preview.serviceDate(), preview.desiredStartTime(), selected));
        } catch (GeneralException exception) {
            Object detail = exception instanceof com.ddemachim.server.domain.course.exception.CourseException course
                    ? course.getResultDetail()
                    : null;
            return failure(exception.getErrorReasonHttpStatus().getCode(),
                    exception.getErrorReasonHttpStatus().getMessage(), detail);
        } catch (RuntimeException exception) {
            return failure(INTERNAL_ERROR_CODE, "코스 계산을 처리할 수 없습니다.", null);
        }
    }

    @McpTool(
            name = "create_ai_course",
            description = "AI 추천 코스 생성 전용 Tool입니다. 장바구니와 basketItemId를 사용하지 않습니다. search_places/search_nearby_places에서 얻은 실제 placeId만 requiredPlaceIds/candidatePlaceIds로 전달하고 임의 ID를 만들지 마세요. 날짜, 시작 시간, 출발 좌표, 사용 가능 시간이 부족하면 호출하지 말고 사용자에게 질문하세요. 이전 대화의 조건은 현재 답변과 결합하세요. requiredPlaceIds는 반드시 포함하며 최종 방문 순서는 LLM이 아닌 서버 CoursePlanner가 결정합니다.",
            generateOutputSchema = true)
    public McpToolResponse<AiCourseResponse> createAiCourse(
            @McpToolParam(description = "Stateless AI course conditions using real place IDs", required = true)
            AiCourseRequest request) {
        if (request == null || request.date() == null || request.startTime() == null
                || request.startLocation() == null || request.availableMinutes() == null) {
            return failure(INVALID_INPUT_CODE,
                    "날짜, 시작 시간, 출발 위치, 사용 가능 시간을 모두 알려주세요.", null);
        }
        try {
            if (aiCourseService == null) {
                return failure(INTERNAL_ERROR_CODE, "AI 코스 생성이 설정되지 않았습니다.", null);
            }
            return success(aiCourseService.create(request));
        } catch (GeneralException exception) {
            Object detail = exception instanceof com.ddemachim.server.domain.course.exception.CourseException course
                    ? course.getResultDetail() : null;
            return failure(exception.getErrorReasonHttpStatus().getCode(),
                    exception.getErrorReasonHttpStatus().getMessage(), detail);
        } catch (RuntimeException exception) {
            return failure(INTERNAL_ERROR_CODE, "AI 코스를 계산할 수 없습니다.", null);
        }
    }

    private static Long authenticatedMemberId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }
        Object principal = authentication.getPrincipal();
        return principal instanceof Number number ? number.longValue() : null;
    }

    private static <T> McpToolResponse<T> success(T result) {
        return new McpToolResponse<>(true, "COMMON200", "성공입니다.", result);
    }

    private static <T> McpToolResponse<T> failure(String code, String message, Object result) {
        @SuppressWarnings("unchecked")
        T typedResult = (T) result;
        return new McpToolResponse<>(false, Objects.requireNonNullElse(code, INTERNAL_ERROR_CODE),
                Objects.requireNonNullElse(message, "요청을 처리할 수 없습니다."), typedResult);
    }

    public record McpToolResponse<T>(boolean isSuccess, String code, String message, T result) {
    }

    public record SearchPlacesRequest(
            String query,
            String area,
            List<String> categories,
            LocalDate visitDate,
            Integer limit) {
    }

    public record SearchNearbyPlacesRequest(
            Double latitude,
            Double longitude,
            String category,
            Integer radiusMeters,
            String query,
            Boolean openNow,
            Integer limit,
            OffsetDateTime at) {
    }

    public record SearchPlacesNearReferenceRequest(
            String reference,
            String category,
            Integer radiusMeters,
            String query,
            Boolean openNow,
            Integer limit,
            OffsetDateTime at) {
    }

    public record PlaceDetailRequest(Long placeId) {
    }

    public record CrowdingToolRequest(Long placeId, OffsetDateTime at) {
    }

    public record CrowdingResult(Long placeId, CrowdingResponse.Point crowding) {
    }

    public record TravelTimeRequest(Long originPlaceId, Long destinationPlaceId, RouteMode mode) {
    }

    public record CreateCourseRequest(
            LocalDate serviceDate,
            LocalTime desiredStartTime,
            CourseStartRequest start,
            List<CoursePlaceRequest> places,
            CourseRouteStrategy strategy) {
    }

    public record CourseStartRequest(
            com.ddemachim.server.domain.course.enums.CourseStartType type,
            String name,
            Double latitude,
            Double longitude) {
    }

    public record CoursePlaceRequest(Long basketItemId, Integer dwellMinutes, LocalTime arrivalDeadline) {
    }
}
