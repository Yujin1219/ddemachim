package com.ddemachim.server.domain.route.service;

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
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class RouteComparisonService {

    private static final Duration DEFAULT_CACHE_TTL = Duration.ofMinutes(2);
    private static final long DEFAULT_CACHE_MAXIMUM_SIZE = 1_000L;

    private final RouteProviderClient routeProviderClient;
    private final Executor routeComparisonExecutor;
    private final Clock clock;
    private final Cache<RouteCacheKey, RouteComparisonResponse> cache;

    @Autowired
    public RouteComparisonService(
            RouteProviderClient routeProviderClient,
            @Qualifier("routeComparisonExecutor") Executor routeComparisonExecutor,
            TmapProperties properties) {
        this(routeProviderClient, routeComparisonExecutor, properties, Clock.systemUTC());
    }

    public RouteComparisonService(
            RouteProviderClient routeProviderClient,
            Executor routeComparisonExecutor,
            Clock clock) {
        this(routeProviderClient, routeComparisonExecutor, new TmapProperties(), clock);
    }

    /**
     * Constructor with a clock is intentionally available to deterministic service tests.
     */
    public RouteComparisonService(
            RouteProviderClient routeProviderClient,
            Executor routeComparisonExecutor,
            TmapProperties properties,
            Clock clock) {
        this.routeProviderClient = routeProviderClient;
        this.routeComparisonExecutor = routeComparisonExecutor;
        this.clock = clock == null ? Clock.systemUTC() : clock;
        this.cache = Caffeine.newBuilder()
                .maximumSize(cacheMaximumSize(properties))
                .expireAfterWrite(cacheTtl(properties))
                .build();
    }

    public RouteComparisonResponse compare(RouteComparisonRequest request) {
        validateRequest(request);
        RouteCacheKey cacheKey = RouteCacheKey.from(request);
        return cache.get(cacheKey, ignored -> fetchRoutes(request));
    }

    private RouteComparisonResponse fetchRoutes(RouteComparisonRequest request) {
        Coordinate origin = request.origin();
        Coordinate destination = request.destination();

        CompletableFuture<RouteOption> walking = dispatch(
                RouteMode.WALK,
                () -> routeProviderClient.findWalking(origin, destination));
        CompletableFuture<RouteOption> transit = dispatch(
                RouteMode.TRANSIT,
                () -> routeProviderClient.findTransit(origin, destination));
        CompletableFuture<RouteOption> taxi = dispatch(
                RouteMode.TAXI,
                () -> routeProviderClient.findTaxi(origin, destination));

        CompletableFuture.allOf(walking, transit, taxi).join();
        List<RouteOption> routes = List.of(
                join(walking, RouteMode.WALK),
                join(transit, RouteMode.TRANSIT),
                join(taxi, RouteMode.TAXI));

        if (allUnavailable(routes)) {
            if (allReasons(routes, RouteUnavailableReason.NOT_CONFIGURED)) {
                throw new RouteException(RouteErrorStatus.TMAP_NOT_CONFIGURED);
            }
            throw new RouteException(RouteErrorStatus.ALL_ROUTES_UNAVAILABLE);
        }
        return new RouteComparisonResponse(Instant.now(clock), routes);
    }

    private CompletableFuture<RouteOption> dispatch(RouteMode mode, Supplier<RouteOption> call) {
        try {
            return CompletableFuture.supplyAsync(() -> safelyCall(mode, call), routeComparisonExecutor);
        } catch (RuntimeException exception) {
            // A stopped executor should still be represented as a normal provider failure.
            return CompletableFuture.completedFuture(
                    RouteOption.unavailable(mode, RouteUnavailableReason.PROVIDER_UNAVAILABLE));
        }
    }

    private static RouteOption safelyCall(RouteMode mode, Supplier<RouteOption> call) {
        try {
            RouteOption option = call.get();
            if (option == null) {
                return unavailable(mode, RouteUnavailableReason.PROVIDER_UNAVAILABLE);
            }
            if (option.status() == RouteStatus.UNAVAILABLE) {
                RouteUnavailableReason reason = option.unavailableReason();
                return unavailable(
                        mode,
                        reason == null ? RouteUnavailableReason.PROVIDER_UNAVAILABLE : reason);
            }
            return option;
        } catch (RouteProviderException exception) {
            RouteUnavailableReason reason = exception.reason();
            return unavailable(
                    mode,
                    reason == null ? RouteUnavailableReason.PROVIDER_UNAVAILABLE : reason);
        } catch (RuntimeException exception) {
            // Keep provider internals and raw error details out of responses and logs.
            return unavailable(mode, RouteUnavailableReason.PROVIDER_UNAVAILABLE);
        }
    }

    private static RouteOption join(CompletableFuture<RouteOption> future, RouteMode mode) {
        try {
            RouteOption option = future.join();
            return option == null
                    ? unavailable(mode, RouteUnavailableReason.PROVIDER_UNAVAILABLE)
                    : option;
        } catch (CompletionException exception) {
            return unavailable(mode, RouteUnavailableReason.PROVIDER_UNAVAILABLE);
        }
    }

    private static RouteOption unavailable(RouteMode mode, RouteUnavailableReason reason) {
        return RouteOption.unavailable(mode, reason);
    }

    private static boolean allUnavailable(List<RouteOption> routes) {
        return routes.stream().allMatch(route -> route.status() == RouteStatus.UNAVAILABLE);
    }

    private static boolean allReasons(List<RouteOption> routes, RouteUnavailableReason reason) {
        return routes.stream().allMatch(route -> route.unavailableReason() == reason);
    }

    private static void validateRequest(RouteComparisonRequest request) {
        if (request == null || !validCoordinate(request.origin()) || !validCoordinate(request.destination())) {
            throw new RouteException(RouteErrorStatus.INVALID_COORDINATES);
        }
    }

    private static boolean validCoordinate(Coordinate coordinate) {
        return coordinate != null
                && coordinate.latitude() != null
                && coordinate.longitude() != null
                && Double.isFinite(coordinate.latitude())
                && Double.isFinite(coordinate.longitude())
                && coordinate.latitude() >= -90.0
                && coordinate.latitude() <= 90.0
                && coordinate.longitude() >= -180.0
                && coordinate.longitude() <= 180.0;
    }

    private static long cacheMaximumSize(TmapProperties properties) {
        if (properties == null || properties.getCacheMaximumSize() <= 0) {
            return DEFAULT_CACHE_MAXIMUM_SIZE;
        }
        return properties.getCacheMaximumSize();
    }

    private static Duration cacheTtl(TmapProperties properties) {
        if (properties == null
                || properties.getCacheTtl() == null
                || properties.getCacheTtl().isNegative()
                || properties.getCacheTtl().isZero()) {
            return DEFAULT_CACHE_TTL;
        }
        return properties.getCacheTtl();
    }

    private record RouteCacheKey(
            BigDecimal originLatitude,
            BigDecimal originLongitude,
            BigDecimal destinationLatitude,
            BigDecimal destinationLongitude) {

        private static RouteCacheKey from(RouteComparisonRequest request) {
            return new RouteCacheKey(
                    rounded(request.origin().latitude()),
                    rounded(request.origin().longitude()),
                    rounded(request.destination().latitude()),
                    rounded(request.destination().longitude()));
        }

        private static BigDecimal rounded(double coordinate) {
            return BigDecimal.valueOf(coordinate).setScale(4, RoundingMode.HALF_UP);
        }
    }
}
