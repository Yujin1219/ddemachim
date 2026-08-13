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

    private FakeRouteProvider provider;
    private RouteComparisonService service;

    @BeforeEach
    void setUp() {
        provider = new FakeRouteProvider();
        Executor directExecutor = Runnable::run;
        service = new RouteComparisonService(
                provider,
                directExecutor,
                new TmapProperties(),
                Clock.fixed(GENERATED_AT, ZoneOffset.UTC));
    }

    @Test
    void compare_keepsWalkTransitTaxiOrderWhenOneProviderFails() {
        provider.transitFailure = new RouteProviderException(RouteUnavailableReason.NO_ROUTE);

        RouteComparisonResponse response = service.compare(request());

        assertThat(response.generatedAt()).isEqualTo(GENERATED_AT);
        assertThat(response.routes()).extracting(RouteOption::mode)
                .containsExactly(RouteMode.WALK, RouteMode.TRANSIT, RouteMode.TAXI);
        assertThat(response.routes().get(1).status()).isEqualTo(RouteStatus.UNAVAILABLE);
        assertThat(response.routes().get(1).unavailableReason()).isEqualTo(RouteUnavailableReason.NO_ROUTE);
    }

    @Test
    void compare_throwsBadGatewayWhenEveryProviderFailsForAReasonOtherThanConfiguration() {
        provider.walkingFailure = new RouteProviderException(RouteUnavailableReason.NO_ROUTE);
        provider.transitFailure = new RouteProviderException(RouteUnavailableReason.TIMEOUT);
        provider.taxiFailure = new RouteProviderException(RouteUnavailableReason.PROVIDER_UNAVAILABLE);

        assertThatThrownBy(() -> service.compare(request()))
                .isInstanceOf(RouteException.class)
                .extracting("code")
                .extracting(RouteErrorStatus.class::cast)
                .isEqualTo(RouteErrorStatus.ALL_ROUTES_UNAVAILABLE);
    }

    @Test
    void compare_throwsServiceUnavailableWhenEveryProviderIsNotConfigured() {
        provider.walkingFailure = new RouteProviderException(RouteUnavailableReason.NOT_CONFIGURED);
        provider.transitFailure = new RouteProviderException(RouteUnavailableReason.NOT_CONFIGURED);
        provider.taxiFailure = new RouteProviderException(RouteUnavailableReason.NOT_CONFIGURED);

        assertThatThrownBy(() -> service.compare(request()))
                .isInstanceOf(RouteException.class)
                .extracting("code")
                .extracting(RouteErrorStatus.class::cast)
                .isEqualTo(RouteErrorStatus.TMAP_NOT_CONFIGURED);
    }

    @Test
    void compare_reusesTwoMinuteCacheForCoordinatesInSameFourDecimalCell() {
        service.compare(request(37.56651, 126.97801, 37.55591, 126.97231));
        service.compare(request(37.56654, 126.97804, 37.55594, 126.97234));

        assertThat(provider.totalCalls()).isEqualTo(3);
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

    private static final class FakeRouteProvider implements RouteProviderClient {

        private RouteProviderException walkingFailure;
        private RouteProviderException transitFailure;
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
        public RouteOption findTransit(Coordinate origin, Coordinate destination) {
            calls.add(RouteMode.TRANSIT);
            if (transitFailure != null) {
                throw transitFailure;
            }
            return available(RouteMode.TRANSIT);
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
}
