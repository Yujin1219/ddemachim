import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as routeComparison from './routeComparison.js';
import {
  ROUTE_MODES,
  buildKakaoTaxiHref,
  distanceBetweenMeters,
  fastestAvailableRouteMode,
  formatRouteDistance,
  formatRouteDuration,
  formatRouteFare,
  normalizeRouteCoordinate,
  requestRoutePosition,
  routeModeSelectionReducer,
  routeOptionByMode,
} from './routeComparison.js';

const origin = { latitude: 37.5665, longitude: 126.978 };
const destination = { latitude: 37.5559, longitude: 126.9723 };

test('MapHome uses browser geolocation for the route origin contract', () => {
  const source = readFileSync(new URL('../pages/ProductFlow.jsx', import.meta.url), 'utf8');
  const mapHomeSource = source.match(/function MapHome\([\s\S]*?\n}\n\nfunction ExploreReveal/)?.[0];

  assert.ok(mapHomeSource, 'MapHome source should be present');
  assert.match(source, /import \{ useCurrentLocation \} from ['"]\.\.\/hooks\/useCurrentLocation\.js['"]/);
  assert.doesNotMatch(source, /\bTEMPORARY_JONGNO_ORIGIN\b/);
  assert.match(mapHomeSource, /useCurrentLocation\(\{\s*auto:\s*false\s*\}\)/);
  assert.match(mapHomeSource, /useRouteComparison\(\{\s*origin:\s*location,\s*destination:\s*routeDestination\s*\}\)/);
  assert.match(mapHomeSource, /shouldLocateForDestinationSelection\(locationStatus,\s*routeDestination\)/);
  assert.match(mapHomeSource, /userLocation:\s*location\s*\?\s*\[location\.longitude,\s*location\.latitude\]\s*:\s*null/);
  assert.doesNotMatch(mapHomeSource, /(?:navigator\.)?geolocation/i);
  assert.match(mapHomeSource, /originLabel="현재 위치"/);
});

test('shows the route origin marker only after a destination is selected', () => {
  assert.equal(routeComparison.routeOriginMarkerCoordinates(null, origin), null);
  assert.deepEqual(
    routeComparison.routeOriginMarkerCoordinates({ id: 7 }, origin),
    [126.978, 37.5665],
  );
});

test('normalizes finite coordinates and rejects invalid bounds', () => {
  assert.deepEqual(normalizeRouteCoordinate({ latitude: '37.5665', longitude: '126.978' }), origin);
  assert.equal(normalizeRouteCoordinate({ latitude: 91, longitude: 126.978 }), null);
  assert.equal(normalizeRouteCoordinate({ latitude: 37.5, longitude: -181 }), null);
  assert.equal(normalizeRouteCoordinate({ latitude: Number.NaN, longitude: 126.978 }), null);
  assert.equal(normalizeRouteCoordinate(null), null);
});

test('rejects null-like and coercible non-coordinate values instead of turning them into zero', () => {
  const invalidValues = [null, undefined, '', '   ', false, true, [], [37.5], {}, { valueOf: () => 37.5 }];

  for (const value of invalidValues) {
    assert.equal(
      normalizeRouteCoordinate({ latitude: value, longitude: 126.978 }),
      null,
      `latitude ${String(value)} must be rejected`,
    );
    assert.equal(
      normalizeRouteCoordinate({ latitude: 37.5665, longitude: value }),
      null,
      `longitude ${String(value)} must be rejected`,
    );
  }
});

test('calculates great-circle distance and rejects invalid coordinates', () => {
  const meters = distanceBetweenMeters(origin, destination);
  assert.ok(meters > 1200 && meters < 1300);
  assert.equal(distanceBetweenMeters(origin, { latitude: 37.5, longitude: 181 }), Number.POSITIVE_INFINITY);
  assert.equal(distanceBetweenMeters(origin, origin) < 0.001, true);
});

test('formats route duration, distance, and fare values', () => {
  assert.equal(formatRouteDuration(840), '14분');
  assert.equal(formatRouteDuration(3660), '1시간 1분');
  assert.equal(formatRouteDuration(0), '1분');
  assert.equal(formatRouteDuration(-1), null);
  assert.equal(formatRouteDuration('not-a-duration'), null);

  assert.equal(formatRouteDistance(320), '320m');
  assert.equal(formatRouteDistance(999.6), '1000m');
  assert.equal(formatRouteDistance(1000), '1km');
  assert.equal(formatRouteDistance(1250), '1.3km');
  assert.equal(formatRouteDistance(-1), null);

  assert.equal(formatRouteFare(1500), '1,500원');
  assert.equal(formatRouteFare(8700.4), '8,700원');
  assert.equal(formatRouteFare(-1), null);
});

test('preserves missing metric semantics while keeping numeric zero valid', () => {
  const missingValues = [null, undefined, '', '   ', false, true, [], {}, { valueOf: () => 0 }];

  for (const value of missingValues) {
    assert.equal(formatRouteDuration(value), null, `duration ${String(value)} must stay missing`);
    assert.equal(formatRouteDistance(value), null, `distance ${String(value)} must stay missing`);
    assert.equal(formatRouteFare(value), null, `fare ${String(value)} must stay missing`);
  }

  assert.equal(formatRouteDuration('0'), '1분');
  assert.equal(formatRouteDistance('0'), '0m');
  assert.equal(formatRouteFare('0'), '0원');
});

test('invalid destinations never qualify for destination-triggered location lookup', () => {
  assert.equal(typeof routeComparison.shouldLocateForDestinationSelection, 'function');
  assert.equal(
    routeComparison.shouldLocateForDestinationSelection('idle', { latitude: null, longitude: 126.978 }),
    false,
  );
  assert.equal(
    routeComparison.shouldLocateForDestinationSelection('idle', { latitude: 37.5665, longitude: '' }),
    false,
  );
});

test('two destination selections reuse one ready geolocation lookup', () => {
  let locationStatus = 'idle';
  let lookupCount = 0;
  const selectDestination = (nextDestination) => {
    if (routeComparison.shouldLocateForDestinationSelection(locationStatus, nextDestination)) {
      lookupCount += 1;
      locationStatus = 'ready';
    }
  };

  selectDestination(destination);
  selectDestination({ latitude: 37.5796, longitude: 126.977 });

  assert.equal(lookupCount, 1);
  assert.equal(routeComparison.shouldLocateForDestinationSelection('locating', destination), false);
  assert.equal(routeComparison.shouldLocateForDestinationSelection('error', destination), true);
});

test('route fitting disables animation when reduced motion is requested', () => {
  assert.equal(typeof routeComparison.resolveRouteFitDuration, 'function');
  const queries = [];
  const reducedDuration = routeComparison.resolveRouteFitDuration((query) => {
    queries.push(query);
    return { matches: true };
  });
  const defaultDuration = routeComparison.resolveRouteFitDuration(() => ({ matches: false }));

  assert.deepEqual(queries, ['(prefers-reduced-motion: reduce)']);
  assert.equal(reducedDuration, 0);
  assert.equal(defaultDuration, 220);
});

test('selects a route by mode and returns null for unavailable modes', () => {
  const response = {
    routes: [
      { mode: 'TAXI', status: 'AVAILABLE' },
      { mode: 'WALK', status: 'UNAVAILABLE', unavailableReason: 'NO_ROUTE' },
    ],
  };

  assert.deepEqual(ROUTE_MODES, ['WALK', 'TRANSIT', 'TAXI']);
  assert.equal(routeOptionByMode(response, 'TAXI').status, 'AVAILABLE');
  assert.equal(routeOptionByMode(response, 'TRANSIT'), null);
  assert.equal(routeOptionByMode(null, 'WALK'), null);
});

test('selects the fastest available route and preserves mode order for ties', () => {
  assert.equal(fastestAvailableRouteMode({
    routes: [
      { mode: 'WALK', status: 'AVAILABLE', durationSeconds: 840 },
      { mode: 'TRANSIT', status: 'AVAILABLE', durationSeconds: 610 },
      { mode: 'TAXI', status: 'AVAILABLE', durationSeconds: 610 },
    ],
  }), 'TRANSIT');
});

test('ignores unavailable and invalid route durations when selecting the fastest route', () => {
  assert.equal(fastestAvailableRouteMode({
    routes: [
      { mode: 'WALK', status: 'AVAILABLE', durationSeconds: null },
      { mode: 'TRANSIT', status: 'UNAVAILABLE', durationSeconds: 300 },
      { mode: 'TAXI', status: 'AVAILABLE', durationSeconds: 720 },
    ],
  }), 'TAXI');
  assert.equal(fastestAvailableRouteMode({ routes: [] }), null);
});

test('auto-selects the fastest route until the user chooses a mode', () => {
  const readyRoutes = {
    routes: [
      { mode: 'WALK', status: 'AVAILABLE', durationSeconds: 840 },
      { mode: 'TRANSIT', status: 'AVAILABLE', durationSeconds: 1320 },
      { mode: 'TAXI', status: 'AVAILABLE', durationSeconds: 610 },
    ],
  };
  const initial = { activeMode: 'WALK', manuallySelected: false };
  const automatic = routeModeSelectionReducer(initial, { type: 'ROUTES_READY', routeData: readyRoutes });
  const manual = routeModeSelectionReducer(automatic, { type: 'MODE_SELECTED', mode: 'TRANSIT' });
  const preserved = routeModeSelectionReducer(manual, { type: 'ROUTES_READY', routeData: readyRoutes });

  assert.deepEqual(automatic, { activeMode: 'TAXI', manuallySelected: false });
  assert.deepEqual(manual, { activeMode: 'TRANSIT', manuallySelected: true });
  assert.equal(preserved, manual);
});

test('resets manual route selection for a different place without marking fallback as manual', () => {
  const manual = { activeMode: 'TRANSIT', manuallySelected: true };
  const reset = routeModeSelectionReducer(manual, { type: 'PLACE_CHANGED' });
  const resolved = routeModeSelectionReducer(reset, { type: 'MODE_RESOLVED', mode: 'TAXI' });

  assert.deepEqual(reset, { activeMode: 'WALK', manuallySelected: false });
  assert.deepEqual(resolved, { activeMode: 'TAXI', manuallySelected: false });
});

test('builds the mobile Kakao taxi launch URL from destination only', () => {
  assert.equal(
    buildKakaoTaxiHref(destination, { mobile: true }),
    'https://t.kakao.com/launch?type=taxi&dest_lat=37.5559&dest_lng=126.9723',
  );
  assert.equal(
    buildKakaoTaxiHref(destination, {
      mobile: true,
      template: 'https://example.test/taxi/{lat}/{lng}',
    }),
    'https://example.test/taxi/37.5559/126.9723',
  );
});

test('falls back to Kakao Mobility on desktop and rejects invalid destinations', () => {
  assert.equal(buildKakaoTaxiHref(destination, { mobile: false }), 'https://www.kakaomobility.com/service-kakaot');
  assert.equal(buildKakaoTaxiHref({ latitude: 91, longitude: 126.9723 }, { mobile: true }), null);
});

test('requests one high-accuracy browser position with approved options', async () => {
  let receivedOptions;
  const geolocation = {
    getCurrentPosition(onSuccess, _onError, options) {
      receivedOptions = options;
      onSuccess({ coords: origin });
    },
  };

  const location = await requestRoutePosition({ geolocation });

  assert.deepEqual(location, origin);
  assert.deepEqual(receivedOptions, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 30000,
  });
});

test('maps geolocation browser errors to typed route location codes', async () => {
  for (const [browserCode, expectedCode] of [[1, 'DENIED'], [2, 'UNAVAILABLE'], [3, 'TIMEOUT']]) {
    const geolocation = {
      getCurrentPosition(_onSuccess, onError) {
        onError({ code: browserCode });
      },
    };

    await assert.rejects(
      requestRoutePosition({ geolocation }),
      (error) => error?.code === expectedCode,
    );
  }
});

test('reports unsupported geolocation with a typed error code', async () => {
  await assert.rejects(
    requestRoutePosition({ geolocation: null }),
    (error) => error?.code === 'UNSUPPORTED',
  );
});

test('aborts a pending position request and ignores stale callbacks', async () => {
  const controller = new AbortController();
  let onSuccess;
  let onError;
  const geolocation = {
    getCurrentPosition(success, error) {
      onSuccess = success;
      onError = error;
    },
  };

  const locationPromise = requestRoutePosition({ geolocation, signal: controller.signal });
  controller.abort();
  onSuccess({ coords: destination });
  onError({ code: 1 });

  await assert.rejects(locationPromise, (error) => error?.name === 'AbortError');
});

test('detects destinations that are less than 30 meters away', () => {
  const near = { latitude: origin.latitude + 0.0001, longitude: origin.longitude };
  const far = { latitude: origin.latitude + 0.001, longitude: origin.longitude };
  assert.equal(distanceBetweenMeters(origin, near) < 30, true);
  assert.equal(distanceBetweenMeters(origin, far) < 30, false);
  assert.equal(distanceBetweenMeters(origin, { latitude: 91, longitude: 126.978 }) < 30, false);
});
