package com.ddemachim.server.domain.route.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ddemachim.server.domain.route.dto.RouteComparisonRequest;
import com.ddemachim.server.domain.route.dto.RouteComparisonRequest.Coordinate;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse;
import com.ddemachim.server.domain.route.dto.RouteComparisonResponse.RouteOption;
import com.ddemachim.server.domain.route.enums.RouteMode;
import com.ddemachim.server.domain.route.enums.RouteStatus;
import com.ddemachim.server.domain.route.enums.RouteUnavailableReason;
import com.ddemachim.server.domain.route.exception.RouteErrorStatus;
import com.ddemachim.server.domain.route.exception.RouteException;
import com.ddemachim.server.domain.route.exception.RouteProviderException;
import com.ddemachim.server.global.properties.TmapProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RouteComparisonServiceTest {

    private static final Instant GENERATED_AT = Instant.parse("2026-08-13T03:00:00Z");

    private FakeRoadRouteProvider roadProvider;
    private FakeTransitRouteProvider transitProvider;
    private RouteComparisonService service;

    @BeforeEach
    void setUp() {
        roadProvider = new FakeRoadRouteProvider();
        transitProvider = new FakeTransitRouteProvider();
        Executor directExecutor = Runnable::run;
        service = new RouteComparisonService(
                roadProvider,
                transitProvider,
                directExecutor,
                new TmapProperties(),
                Clock.fixed(GENERATED_AT, ZoneOffset.UTC));
    }

    @Test
    void compare_keepsWalkTransitTaxiOrderWhenOneProviderFails() {
        transitProvider.failure = new RouteProviderException(RouteUnavailableReason.NO_ROUTE);

        RouteComparisonResponse response = service.compare(request());

        assertThat(response.generatedAt()).isEqualTo(GENERATED_AT);
        assertThat(response.routes()).extracting(RouteOption::mode)
                .containsExactly(RouteMode.WALK, RouteMode.TRANSIT, RouteMode.TAXI);
        assertThat(response.routes().get(1).status()).isEqualTo(RouteStatus.UNAVAILABLE);
        assertThat(response.routes().get(1).unavailableReason()).isEqualTo(RouteUnavailableReason.NO_ROUTE);
        assertThat(roadProvider.calls).containsExactly(RouteMode.WALK, RouteMode.TAXI);
        assertThat(transitProvider.calls).containsExactly(RouteMode.TRANSIT);
    }

    @Test
    void compare_throwsBadGatewayWhenEveryProviderFailsForAReasonOtherThanConfiguration() {
        roadProvider.walkingFailure = new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
        transitProvider.failure = new RouteProviderException(RouteUnavailableReason.TIMEOUT);
        roadProvider.taxiFailure = new RouteProviderException(RouteUnavailableReason.PROVIDER_UNAVAILABLE);

        assertThatThrownBy(() -> service.compare(request()))
                .isInstanceOf(RouteException.class)
                .extracting("code")
                .extracting(RouteErrorStatus.class::cast)
                .isEqualTo(RouteErrorStatus.ALL_ROUTES_UNAVAILABLE);
    }

    @Test
    void compare_throwsServiceUnavailableWhenEveryProviderIsNotConfigured() {
        roadProvider.walkingFailure = new RouteProviderException(RouteUnavailableReason.NOT_CONFIGURED);
        transitProvider.failure = new RouteProviderException(RouteUnavailableReason.NOT_CONFIGURED);
        roadProvider.taxiFailure = new RouteProviderException(RouteUnavailableReason.NOT_CONFIGURED);

        assertThatThrownBy(() -> service.compare(request()))
                .isInstanceOf(RouteException.class)
                .extracting("code")
                .extracting(RouteErrorStatus.class::cast)
                .isEqualTo(RouteErrorStatus.TMAP_NOT_CONFIGURED);
    }

    @Test
    void compare_keepsRoadRoutesWhenOnlyTransitIsNotConfigured() {
        transitProvider.failure = new RouteProviderException(RouteUnavailableReason.NOT_CONFIGURED);

        RouteComparisonResponse response = service.compare(request());

        assertThat(response.routes()).extracting(RouteOption::mode)
                .containsExactly(RouteMode.WALK, RouteMode.TRANSIT, RouteMode.TAXI);
        assertThat(response.routes().get(0).status()).isEqualTo(RouteStatus.AVAILABLE);
        assertThat(response.routes().get(1).status()).isEqualTo(RouteStatus.UNAVAILABLE);
        assertThat(response.routes().get(1).unavailableReason())
                .isEqualTo(RouteUnavailableReason.NOT_CONFIGURED);
        assertThat(response.routes().get(2).status()).isEqualTo(RouteStatus.AVAILABLE);
    }

    @Test
    void compare_reusesTwoMinuteCacheForCoordinatesInSameFourDecimalCell() {
        service.compare(request(37.56651, 126.97801, 37.55591, 126.97231));
        service.compare(request(37.56654, 126.97804, 37.55594, 126.97234));

        assertThat(roadProvider.totalCalls()).isEqualTo(2);
        assertThat(transitProvider.totalCalls()).isEqualTo(1);
    }

    @Test
    void oversizedCacheTtl_isCappedAtTwoMinutes() {
        TmapProperties properties = new TmapProperties();
        properties.setCacheTtl(Duration.ofMinutes(15));

        assertThat(RouteComparisonService.cacheTtl(properties)).isEqualTo(Duration.ofMinutes(2));
    }

    @Test
    void oversizedCacheMaximumSize_isCappedAtOneThousand() {
        TmapProperties properties = new TmapProperties();
        properties.setCacheMaximumSize(5_000);

        assertThat(RouteComparisonService.cacheMaximumSize(properties)).isEqualTo(1_000L);
    }

    @Test
    void smallerPositiveCacheConfiguration_isKept() {
        TmapProperties properties = new TmapProperties();
        properties.setCacheTtl(Duration.ofSeconds(45));
        properties.setCacheMaximumSize(250);

        assertThat(RouteComparisonService.cacheTtl(properties)).isEqualTo(Duration.ofSeconds(45));
        assertThat(RouteComparisonService.cacheMaximumSize(properties)).isEqualTo(250L);
    }

    private static RouteComparisonRequest request() {
        return request(37.5665, 126.9780, 37.5559, 126.9723);
    }

    private static RouteComparisonRequest request(
            double originLatitude,
            double originLongitude,
            double destinationLatitude,
            double destinationLongitude) {
        return new RouteComparisonRequest(
                new Coordinate(originLatitude, originLongitude),
                new Coordinate(destinationLatitude, destinationLongitude));
    }

    private static RouteOption available(RouteMode mode) {
        return new RouteOption(
                mode,
                RouteStatus.AVAILABLE,
                600,
                1_000,
                null,
                null,
                null,
                null,
                List.of());
    }

    private static final class FakeRoadRouteProvider implements RoadRouteProviderClient {

        private RouteProviderException walkingFailure;
        private RouteProviderException taxiFailure;
        private final List<RouteMode> calls = new ArrayList<>();

        @Override
        public RouteOption findWalking(Coordinate origin, Coordinate destination) {
            calls.add(RouteMode.WALK);
            if (walkingFailure != null) {
                throw walkingFailure;
            }
            return available(RouteMode.WALK);
        }

        @Override
        public RouteOption findTaxi(Coordinate origin, Coordinate destination) {
            calls.add(RouteMode.TAXI);
            if (taxiFailure != null) {
                throw taxiFailure;
            }
            return available(RouteMode.TAXI);
        }

        private int totalCalls() {
            return calls.size();
        }
    }

    private static final class FakeTransitRouteProvider implements TransitRouteProviderClient {

        private RouteProviderException failure;
        private final List<RouteMode> calls = new ArrayList<>();

        @Override
        public RouteOption findTransit(Coordinate origin, Coordinate destination) {
            calls.add(RouteMode.TRANSIT);
            if (failure != null) {
                throw failure;
            }
            return available(RouteMode.TRANSIT);
        }

        private int totalCalls() {
            return calls.size();
        }
    }
}
