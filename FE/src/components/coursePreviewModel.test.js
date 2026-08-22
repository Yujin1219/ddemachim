import assert from 'node:assert/strict';
import test from 'node:test';

import * as coursePreviewModel from './coursePreviewModel.js';

import {
  buildCoursePreviewRequest,
  coursePreviewErrorMessage,
  formatPreviewDistance,
  formatPreviewDuration,
  applyRouteSelections,
  isTerrainEligibleRoute,
  normalizeCoursePreview,
  validateCoursePreviewRequest,
} from './coursePreviewModel.js';

function route(overrides = {}) {
  return {
    mode: 'TRANSIT',
    status: 'AVAILABLE',
    durationSeconds: 900,
    distanceMeters: 2800,
    fareWon: 1500,
    transferCount: 0,
    walkDistanceMeters: 240,
    unavailableReason: null,
    legs: [],
    ...overrides,
  };
}

function stop(sequenceNo, overrides = {}) {
  return {
    sequenceNo,
    basketItemId: sequenceNo + 10,
    placeName: `장소 ${sequenceNo}`,
    address: `주소 ${sequenceNo}`,
    latitude: 37.57 + (sequenceNo * 0.001),
    longitude: 126.98 + (sequenceNo * 0.001),
    defaultDwellMinutes: 60,
    dwellMinutes: 45,
    dwellSource: 'USER',
    arrivalDeadline: null,
    arrivalBufferMinutes: 0,
    scheduledArrival: `1${sequenceNo}:00:00`,
    scheduledDeparture: `1${sequenceNo}:45:00`,
    travelMinutesFromPrevious: 15,
    travelDistanceMeters: 2800,
    ascentMeters: 8.5,
    congestionScore: 32.4,
    hoursSourceType: 'REAL',
    openTime: '09:00:00',
    closeTime: '18:00:00',
    eventId: null,
    eventEndTime: null,
    incomingRoute: route(),
    ...overrides,
  };
}

function option(strategy, stops, overrides = {}) {
  return {
    strategy,
    stopCount: stops.length,
    totalDurationMinutes: 260,
    totalTravelMinutes: 52,
    totalDistanceMeters: 7800,
    totalAscentMeters: 32.5,
    averageCongestionScore: 42.5,
    scheduledStart: '10:00:00',
    scheduledEnd: '14:20:00',
    stops,
    ...overrides,
  };
}

function failurePayload(...basketItemIds) {
  return {
    places: basketItemIds.map((basketItemId) => ({ basketItemId })),
  };
}

function failureResult(diagnostics, overrides = {}) {
  return {
    requestedStopCount: diagnostics.length,
    diagnostics,
    ...overrides,
  };
}

function diagnostic(basketItemId, reason, adjustmentProposal, placeName = '서울공예박물관') {
  return { basketItemId, placeName, reason, adjustmentProposal };
}

test('selects FAST by strategy and normalizes server times and stop order', () => {
  const preview = normalizeCoursePreview({
    generatedAt: '2026-08-18T01:00:00Z',
    serviceDate: '2026-08-18',
    desiredStartTime: '10:00:00',
    desiredEndTime: '18:00:00',
    options: [
      option('EASY', [stop(1, { placeName: '느긋한 장소' })]),
      option('FAST', [stop(2), stop(1)]),
    ],
  });

  assert.ok(preview, 'FAST preview should be normalized');
  assert.equal(preview.strategy, 'FAST');
  assert.equal(preview.desiredStartTime, '10:00');
  assert.equal(Object.hasOwn(preview, 'desiredEndTime'), false);
  assert.equal(preview.scheduledStart, '10:00');
  assert.equal(preview.scheduledEnd, '14:20');
  assert.deepEqual(preview.stops.map((item) => item.sequenceNo), [1, 2]);
  assert.deepEqual(preview.stops.map((item) => item.scheduledArrival), ['11:00', '12:00']);
  assert.deepEqual(preview.stops.map((item) => item.openTime), ['09:00', '09:00']);
});

test('retains normalized FAST and QUIET options by strategy regardless of response order', () => {
  const preview = normalizeCoursePreview({
    generatedAt: '2026-08-18T01:00:00Z',
    options: [
      option('QUIET', [stop(2), stop(1)], {
        totalDurationMinutes: 300,
        averageCongestionScore: 18,
      }),
      option('FAST', [stop(1)], { totalDurationMinutes: 180 }),
    ],
  });

  assert.equal(preview.strategy, 'FAST');
  assert.deepEqual(preview.options.map((item) => item.strategy), ['QUIET', 'FAST']);
  const quiet = preview.options.find((item) => item.strategy === 'QUIET');
  assert.equal(quiet.totalDurationMinutes, 300);
  assert.equal(quiet.averageCongestionScore, 18);
  assert.deepEqual(quiet.stops.map((item) => item.sequenceNo), [1, 2]);
  assert.equal(quiet.routeFitKey.includes('|QUIET|'), true);
  assert.notEqual(quiet.routeFitKey, preview.routeFitKey);
});

test('formats valid congestion scores into four Korean levels and omits malformed values', () => {
  assert.equal(typeof coursePreviewModel.formatCongestionLevel, 'function');
  const { formatCongestionLevel } = coursePreviewModel;
  assert.equal(formatCongestionLevel(0), '여유');
  assert.equal(formatCongestionLevel(33), '보통');
  assert.equal(formatCongestionLevel(67), '약간 붐빔');
  assert.equal(formatCongestionLevel(100), '붐빔');
  assert.equal(formatCongestionLevel(49), '보통');
  assert.equal(formatCongestionLevel(84), '붐빔');
  assert.equal(formatCongestionLevel(null), null);
  assert.equal(formatCongestionLevel(false), null);
  assert.equal(formatCongestionLevel([]), null);
  assert.equal(formatCongestionLevel('33'), null);
  assert.equal(formatCongestionLevel(-1), null);
  assert.equal(formatCongestionLevel(101), null);
});

test('rejects malformed and empty preview responses while accepting a saved single-strategy course', () => {
  assert.equal(normalizeCoursePreview(null), null);
  assert.equal(normalizeCoursePreview({ options: [] }), null);
  assert.equal(normalizeCoursePreview({ options: [option('EASY', [stop(1)])] })?.strategy, 'EASY');
  assert.equal(normalizeCoursePreview({ options: [option('FAST', [])] }), null);
  assert.equal(normalizeCoursePreview({ options: [{ strategy: 'FAST', stops: null }] }), null);
});

test('preserves nullable metrics as unavailable and formats available totals', () => {
  const preview = normalizeCoursePreview({
    options: [option('FAST', [stop(1, {
      travelMinutesFromPrevious: null,
      travelDistanceMeters: null,
      ascentMeters: null,
      congestionScore: null,
      incomingRoute: route({
        durationSeconds: null,
        distanceMeters: null,
        fareWon: null,
        transferCount: null,
        walkDistanceMeters: null,
      }),
    })], {
      totalDurationMinutes: '260',
      totalTravelMinutes: null,
      totalDistanceMeters: '7800',
      totalAscentMeters: null,
      averageCongestionScore: null,
    })],
  });

  assert.equal(preview.totalDurationMinutes, 260);
  assert.equal(preview.totalTravelMinutes, null);
  assert.equal(preview.totalDistanceMeters, 7800);
  assert.equal(preview.totalAscentMeters, null);
  assert.equal(preview.stops[0].travelMinutesFromPrevious, null);
  assert.equal(preview.stops[0].incomingRoute.distanceMeters, null);
  assert.equal(formatPreviewDuration(preview.totalDurationMinutes), '4시간 20분');
  assert.equal(formatPreviewDuration(preview.totalTravelMinutes), '정보 없음');
  assert.equal(formatPreviewDistance(preview.totalDistanceMeters), '7.8km');
  assert.equal(formatPreviewDistance(null), '정보 없음');
});

test('flattens incoming route legs and falls back to WALK step geometry', () => {
  const transitGeometry = { type: 'LineString', coordinates: [[126.98, 37.57], [126.99, 37.58]] };
  const firstWalkGeometry = { type: 'LineString', coordinates: [[126.99, 37.58], [127, 37.59]] };
  const secondWalkGeometry = { type: 'LineString', coordinates: [[127, 37.59], [127.01, 37.6]] };
  const preview = normalizeCoursePreview({
    options: [option('FAST', [stop(1, {
      incomingRoute: route({
        legs: [
          {
            mode: 'TRANSIT',
            routeName: '종로02',
            durationSeconds: 600,
            distanceMeters: 2400,
            geometry: transitGeometry,
            steps: [],
          },
          {
            mode: 'WALK',
            routeName: '도보',
            durationSeconds: 300,
            distanceMeters: 380,
            geometry: null,
            steps: [
              { streetName: '율곡로', distanceMeters: 180, description: '횡단보도를 건너세요', geometry: firstWalkGeometry },
              { streetName: '북촌로', distanceMeters: 200, description: '골목을 따라 이동하세요', geometry: secondWalkGeometry },
              { streetName: '누락', distanceMeters: 20, description: '좌표 없음', geometry: null },
            ],
          },
        ],
      }),
    })])],
  });

  assert.ok(Array.isArray(preview.routeLegs), 'normalized preview should expose map-ready route legs');
  assert.deepEqual(preview.routeLegs.map((leg) => leg.mode), ['TRANSIT', 'WALK', 'WALK']);
  assert.deepEqual(preview.routeLegs.map((leg) => leg.geometry), [transitGeometry, firstWalkGeometry, secondWalkGeometry]);
  assert.deepEqual(preview.routeLegs.slice(1).map((leg) => leg.description), ['횡단보도를 건너세요', '골목을 따라 이동하세요']);
  assert.deepEqual(
    preview.stops[0].incomingRoute.legs[1].steps.map((step) => [step.streetName, step.distanceMeters]),
    [['율곡로', 180], ['북촌로', 200], ['누락', 20]],
  );
});

test('prefers selectedRoute while preserving incomingRoute as its legacy alias', () => {
  const selectedGeometry = { type: 'LineString', coordinates: [[126.98, 37.57], [126.99, 37.58]] };
  const preview = normalizeCoursePreview({
    options: [option('FAST', [stop(1, {
      selectedMode: 'WALK',
      selectedRoute: route({
        mode: 'WALK',
        durationSeconds: 720,
        distanceMeters: 950,
        legs: [{ mode: 'WALK', routeName: '선택 도보', durationSeconds: 720, distanceMeters: 950, geometry: selectedGeometry, steps: [] }],
      }),
      alternativeRoute: route({ mode: 'TRANSIT', durationSeconds: 1080 }),
      incomingRoute: route({ mode: 'TRANSIT', durationSeconds: 900 }),
    })])],
  });

  const normalizedStop = preview.stops[0];
  assert.equal(normalizedStop.selectedRoute.mode, 'WALK');
  assert.equal(normalizedStop.incomingRoute, normalizedStop.selectedRoute);
  assert.equal(normalizedStop.alternativeRoute.mode, 'TRANSIT');
  assert.deepEqual(preview.routeLegs.map((leg) => leg.geometry), [selectedGeometry]);
});

test('absorbs a shorter selected alternative into the server baseline waiting time', () => {
  const base = normalizeCoursePreview({
    options: [option('FAST', [
      stop(1, {
        basketItemId: 21,
        scheduledArrival: '10:18:00',
        scheduledDeparture: '11:03:00',
        dwellMinutes: 45,
        selectedRoute: route({ mode: 'TRANSIT', durationSeconds: 1080, distanceMeters: 2400 }),
        alternativeRoute: route({ mode: 'WALK', durationSeconds: 720, distanceMeters: 950, legs: [] }),
      }),
      stop(2, {
        basketItemId: 22,
        scheduledArrival: '11:18:00',
        scheduledDeparture: '12:03:00',
        dwellMinutes: 45,
        selectedRoute: route({ mode: 'TRANSIT', durationSeconds: 900, distanceMeters: 1800 }),
      }),
    ], {
      totalDurationMinutes: 123,
      totalTravelMinutes: 33,
      totalDistanceMeters: 4200,
      scheduledEnd: '12:03:00',
    })],
  });

  const recalculated = applyRouteSelections(base, { 21: 'alternative' });
  assert.equal(recalculated.scheduleRecalculated, true);
  assert.equal(recalculated.stops[0].incomingRoute.mode, 'WALK');
  assert.equal(recalculated.stops[0].travelMinutesFromPrevious, 12);
  assert.equal(recalculated.stops[0].scheduledArrival, '10:18');
  assert.equal(recalculated.stops[0].scheduledDeparture, '11:03');
  assert.equal(recalculated.stops[1].scheduledArrival, '11:18');
  assert.equal(recalculated.stops[1].scheduledDeparture, '12:03');
  assert.equal(recalculated.stops[0].dwellMinutes, 45);
  assert.equal(recalculated.totalTravelMinutes, 27);
  assert.equal(recalculated.totalDurationMinutes, 123);
  assert.equal(recalculated.totalDistanceMeters, 2750);
  assert.equal(recalculated.scheduledEnd, '12:03');
  assert.match(recalculated.routeFitKey, /21:alternative/);
});

test('propagates a longer selected alternative after retaining each stop base dwell duration', () => {
  const base = normalizeCoursePreview({
    options: [option('FAST', [
      stop(1, {
        basketItemId: 41,
        scheduledArrival: '10:18:00',
        scheduledDeparture: '11:03:00',
        dwellMinutes: 45,
        selectedRoute: route({ mode: 'TRANSIT', durationSeconds: 1080 }),
        alternativeRoute: route({ mode: 'WALK', durationSeconds: 1440 }),
      }),
      stop(2, {
        basketItemId: 42,
        scheduledArrival: '11:18:00',
        scheduledDeparture: '12:03:00',
        dwellMinutes: 45,
        selectedRoute: route({ mode: 'TRANSIT', durationSeconds: 900 }),
      }),
    ], {
      totalDurationMinutes: 123,
      totalTravelMinutes: 33,
      scheduledEnd: '12:03:00',
    })],
  });
  const recalculated = applyRouteSelections(base, { 41: 'alternative' });

  assert.equal(recalculated.stops[0].scheduledArrival, '10:24');
  assert.equal(recalculated.stops[0].scheduledDeparture, '11:09');
  assert.equal(recalculated.stops[1].scheduledArrival, '11:24');
  assert.equal(recalculated.stops[1].scheduledDeparture, '12:09');
  assert.equal(recalculated.stops[0].dwellMinutes, 45);
  assert.equal(recalculated.totalTravelMinutes, 39);
  assert.equal(recalculated.totalDurationMinutes, 129);
  assert.equal(recalculated.scheduledEnd, '12:09');
});

test('keeps the server schedule when route durations are unavailable while still recording the selection', () => {
  const base = normalizeCoursePreview({
    options: [option('FAST', [stop(1, {
      basketItemId: 31,
      selectedRoute: route({ durationSeconds: null }),
      alternativeRoute: route({ mode: 'WALK', durationSeconds: 720 }),
    })])],
  });
  const recalculated = applyRouteSelections(base, { 31: 'alternative' });
  assert.equal(recalculated.scheduleRecalculated, true);
  assert.equal(recalculated.stops[0].scheduledArrival, base.stops[0].scheduledArrival);
  assert.equal(recalculated.totalDurationMinutes, base.totalDurationMinutes);
});

test('only treats a short selected walking route as terrain eligible', () => {
  assert.equal(isTerrainEligibleRoute(route({ mode: 'WALK', durationSeconds: 1200 })), true);
  assert.equal(isTerrainEligibleRoute(route({ mode: 'WALK', durationSeconds: 1201 })), false);
  assert.equal(isTerrainEligibleRoute(route({ mode: 'TRANSIT', durationSeconds: 600 })), false);
});

test('builds the exact preview payload and validates the one-to-five unique place boundary', () => {
  const payload = buildCoursePreviewRequest({
    serviceDate: '2026-08-18',
    desiredStartTime: '10:00',
    // Legacy drafts may still contain this key, but it must not reach the API.
    desiredEndTime: '18:00',
    start: {
      type: 'SEARCHED_PLACE',
      name: '안국역 1번 출구',
      address: 'UI에서만 사용하는 주소',
      latitude: 37.5763,
      longitude: 126.9854,
    },
  }, [
    { basketItemId: 11, dwellMinutes: 45, arrivalDeadline: '15:00' },
    { basketItemId: 12, dwellMinutes: 60, arrivalDeadline: null },
  ]);

  assert.deepEqual(payload, {
    serviceDate: '2026-08-18',
    desiredStartTime: '10:00',
    start: {
      type: 'SEARCHED_PLACE',
      name: '안국역 1번 출구',
      latitude: 37.5763,
      longitude: 126.9854,
    },
    places: [
      { basketItemId: 11, dwellMinutes: 45, arrivalDeadline: '15:00' },
      { basketItemId: 12, dwellMinutes: 60, arrivalDeadline: null },
    ],
  });
  assert.equal(validateCoursePreviewRequest(payload), null);
  assert.equal(validateCoursePreviewRequest({ ...payload, places: [] }), '코스에 포함할 장소를 1개 이상 담아주세요.');
  assert.equal(validateCoursePreviewRequest({ ...payload, places: Array.from({ length: 6 }, (_, index) => ({ basketItemId: index + 1, dwellMinutes: 60, arrivalDeadline: null })) }), null);
  assert.equal(validateCoursePreviewRequest({ ...payload, places: [payload.places[0], payload.places[0]] }), '같은 장소는 코스에 한 번만 담을 수 있어요.');
});

test('rejects preview requests that bypass valid conditions or stop settings', () => {
  const valid = buildCoursePreviewRequest({
    serviceDate: '2026-08-18',
    desiredStartTime: '10:00',
    start: { type: 'CURRENT_LOCATION', name: '현재 위치', latitude: 37.57, longitude: 126.98 },
  }, [{ basketItemId: 11, dwellMinutes: 60, arrivalDeadline: null }]);

  assert.equal(validateCoursePreviewRequest({ ...valid, start: null }), '출발 위치와 날짜, 시간을 먼저 설정해주세요.');
  assert.equal(validateCoursePreviewRequest({ ...valid, desiredStartTime: '25:00' }), '출발 위치와 날짜, 시간을 먼저 설정해주세요.');
  assert.equal(validateCoursePreviewRequest({ ...valid, places: [{ basketItemId: 11, dwellMinutes: 0, arrivalDeadline: null }] }), '장소별 체류시간을 다시 확인해주세요.');
});

test('requires serviceDate to be a real calendar date', () => {
  const payload = buildCoursePreviewRequest({
    serviceDate: '2028-02-29',
    desiredStartTime: '10:00',
    start: { type: 'CURRENT_LOCATION', name: '현재 위치', latitude: 37.57, longitude: 126.98 },
  }, [{ basketItemId: 11, dwellMinutes: 60, arrivalDeadline: null }]);

  assert.equal(validateCoursePreviewRequest(payload), null);
  assert.equal(validateCoursePreviewRequest({ ...payload, serviceDate: '2026-02-31' }), '출발 위치와 날짜, 시간을 먼저 설정해주세요.');
});

test('requires start coordinates to be actual finite numbers', () => {
  const payload = buildCoursePreviewRequest({
    serviceDate: '2026-08-18',
    desiredStartTime: '10:00',
    start: { type: 'CURRENT_LOCATION', name: '현재 위치', latitude: 37.57, longitude: 126.98 },
  }, [{ basketItemId: 11, dwellMinutes: 60, arrivalDeadline: null }]);
  const invalidMessage = '출발 위치와 날짜, 시간을 먼저 설정해주세요.';

  assert.equal(validateCoursePreviewRequest({ ...payload, start: { ...payload.start, latitude: '37.57' } }), invalidMessage);
  assert.equal(validateCoursePreviewRequest({ ...payload, start: { ...payload.start, longitude: false } }), invalidMessage);
  assert.equal(validateCoursePreviewRequest({ ...payload, start: { ...payload.start, latitude: Number.POSITIVE_INFINITY } }), invalidMessage);
});

test('requires integer numeric basket IDs and dwell minutes', () => {
  const payload = buildCoursePreviewRequest({
    serviceDate: '2026-08-18',
    desiredStartTime: '10:00',
    start: { type: 'CURRENT_LOCATION', name: '현재 위치', latitude: 37.57, longitude: 126.98 },
  }, [{ basketItemId: 11, dwellMinutes: 60, arrivalDeadline: null }]);
  const invalidMessage = '장소별 체류시간을 다시 확인해주세요.';

  assert.equal(validateCoursePreviewRequest({ ...payload, places: [{ ...payload.places[0], basketItemId: 11.5 }] }), invalidMessage);
  assert.equal(validateCoursePreviewRequest({ ...payload, places: [{ ...payload.places[0], basketItemId: true }] }), invalidMessage);
  assert.equal(validateCoursePreviewRequest({ ...payload, places: [{ ...payload.places[0], basketItemId: '11' }] }), invalidMessage);
  assert.equal(validateCoursePreviewRequest({ ...payload, places: [{ ...payload.places[0], dwellMinutes: 60.5 }] }), invalidMessage);
  assert.equal(validateCoursePreviewRequest({ ...payload, places: [{ ...payload.places[0], dwellMinutes: false }] }), invalidMessage);
  assert.equal(validateCoursePreviewRequest({ ...payload, places: [{ ...payload.places[0], dwellMinutes: '60' }] }), invalidMessage);
});

test('normalizes every approved COURSE4222 reason into exact safe group copy', () => {
  const normalizeFailure = coursePreviewModel.normalizeCoursePreviewFailure;
  assert.equal(typeof normalizeFailure, 'function');
  const cases = [
    {
      reason: 'PLACE_CLOSED',
      proposal: 'CHANGE_SERVICE_DATE',
      group: { id: 'conditions', label: '출발 조건', action: 'conditions', messages: ['서울공예박물관: 선택한 날짜에는 운영하지 않아요.'] },
    },
    {
      reason: 'ARRIVAL_DEADLINE_EXCEEDED',
      proposal: 'RELAX_ARRIVAL_DEADLINE',
      group: { id: 'stops', label: '장소별 시간', action: 'stops', messages: ['서울공예박물관: 설정한 도착 시각을 맞추기 어려워요.'] },
    },
    {
      reason: 'OPERATING_HOURS_EXCEEDED',
      proposal: 'ADJUST_VISIT_DURATION',
      group: { id: 'stops', label: '장소별 시간', action: 'stops', messages: ['서울공예박물관: 운영시간 안에 방문을 마치기 어려워요.'] },
    },
    {
      reason: 'NO_FEASIBLE_ORDER',
      proposal: 'ADJUST_START_TIME',
      group: { id: 'conditions', label: '출발 조건', action: 'conditions', messages: ['현재 출발 시각으로는 장소별 조건을 모두 맞추기 어려워요.'] },
    },
    {
      reason: 'ROUTE_NOT_FOUND',
      proposal: 'CHECK_ROUTE_AVAILABILITY',
      group: { id: 'route', label: '이동 경로', action: 'route', messages: ['서울공예박물관: 이용 가능한 이동 경로를 찾지 못했어요.'] },
    },
    {
      reason: 'ROUTE_UNAVAILABLE',
      proposal: 'CHECK_ROUTE_AVAILABILITY',
      group: { id: 'route', label: '이동 경로', action: 'route', messages: ['서울공예박물관: 이동 경로를 계산할 수 없어요.'] },
    },
    {
      reason: 'ROUTE_PROVIDER_UNAVAILABLE',
      proposal: 'CHECK_ROUTE_AVAILABILITY',
      group: { id: 'route', label: '이동 경로', action: 'route', messages: ['현재 이동 경로 정보를 불러오기 어려워요.'] },
    },
    {
      reason: 'ROUTE_PROVIDER_NOT_CONFIGURED',
      proposal: 'CHECK_ROUTE_AVAILABILITY',
      group: { id: 'route', label: '이동 경로', action: 'route', messages: ['현재 이동 경로 정보를 확인할 수 없어요.'] },
    },
    {
      reason: 'ROUTE_PROVIDER_TIMEOUT',
      proposal: 'CHECK_ROUTE_AVAILABILITY',
      group: { id: 'route', label: '이동 경로', action: 'route', messages: ['이동 경로 확인을 완료하지 못했어요.'] },
    },
  ];

  cases.forEach(({ reason, proposal, group }) => {
    assert.deepEqual(
      normalizeFailure(failureResult([diagnostic(11, reason, proposal)]), failurePayload(11)),
      { groups: [group] },
      reason,
    );
  });
});

test('keeps every diagnostic in stable semantic group order without retaining raw fields', () => {
  const normalizeFailure = coursePreviewModel.normalizeCoursePreviewFailure;
  const result = failureResult([
    diagnostic(11, 'ROUTE_PROVIDER_TIMEOUT', 'CHECK_ROUTE_AVAILABILITY', '첫 장소'),
    diagnostic(12, 'OPERATING_HOURS_EXCEEDED', 'ADJUST_VISIT_DURATION', '둘째 장소'),
    diagnostic(13, 'NO_FEASIBLE_ORDER', 'ADJUST_START_TIME', '셋째 장소'),
    diagnostic(14, 'PLACE_CLOSED', 'CHANGE_SERVICE_DATE', '넷째 장소'),
    diagnostic(15, 'ROUTE_NOT_FOUND', 'CHECK_ROUTE_AVAILABILITY', '다섯째 장소'),
  ], { message: '서버 원문', code: 'COURSE4222', extra: { secret: true } });
  const before = structuredClone(result);

  assert.deepEqual(normalizeFailure(result, failurePayload(11, 12, 13, 14, 15)), {
    groups: [
      {
        id: 'conditions',
        label: '출발 조건',
        action: 'conditions',
        messages: [
          '현재 출발 시각으로는 장소별 조건을 모두 맞추기 어려워요.',
          '넷째 장소: 선택한 날짜에는 운영하지 않아요.',
        ],
      },
      {
        id: 'stops',
        label: '장소별 시간',
        action: 'stops',
        messages: ['둘째 장소: 운영시간 안에 방문을 마치기 어려워요.'],
      },
      {
        id: 'route',
        label: '이동 경로',
        action: 'route',
        messages: [
          '이동 경로 확인을 완료하지 못했어요.',
          '다섯째 장소: 이용 가능한 이동 경로를 찾지 못했어요.',
        ],
      },
    ],
  });
  assert.deepEqual(result, before, 'normalization must not mutate the server result');
});

test('sanitizes control text, whitespace, bidi overrides, and limits names to 60 Unicode code points', () => {
  const normalizeFailure = coursePreviewModel.normalizeCoursePreviewFailure;
  const longName = `  서울\u0000\u0085  \u202E공예   ${'😀'.repeat(70)}  `;
  const sanitizedName = `서울 공예 ${'😀'.repeat(54)}`;

  assert.deepEqual(normalizeFailure(failureResult([
    diagnostic(11, 'PLACE_CLOSED', 'CHANGE_SERVICE_DATE', longName),
  ]), failurePayload(11)), {
    groups: [{
      id: 'conditions',
      label: '출발 조건',
      action: 'conditions',
      messages: [`${sanitizedName}: 선택한 날짜에는 운영하지 않아요.`],
    }],
  });
});

test('rejects malformed, partial, mismatched, duplicate, and request-divergent diagnostics as a whole', () => {
  const normalizeFailure = coursePreviewModel.normalizeCoursePreviewFailure;
  const valid = diagnostic(11, 'PLACE_CLOSED', 'CHANGE_SERVICE_DATE');
  const cases = [
    [null, failurePayload(11)],
    [{}, failurePayload(11)],
    [failureResult([valid]), null],
    [failureResult([valid]), { places: [] }],
    [failureResult([valid]), { places: Array.from({ length: 6 }, (_, index) => ({ basketItemId: index + 1 })) }],
    [failureResult([valid], { requestedStopCount: '1' }), failurePayload(11)],
    [failureResult([valid], { requestedStopCount: 2 }), failurePayload(11)],
    [failureResult([]), failurePayload(11)],
    [failureResult([valid, valid]), failurePayload(11, 12)],
    [failureResult([diagnostic(12, 'PLACE_CLOSED', 'CHANGE_SERVICE_DATE')]), failurePayload(11)],
    [failureResult([diagnostic(12, 'PLACE_CLOSED', 'CHANGE_SERVICE_DATE'), diagnostic(11, 'PLACE_CLOSED', 'CHANGE_SERVICE_DATE')]), failurePayload(11, 12)],
    [failureResult([valid]), failurePayload(11, 11)],
    [failureResult([{ ...valid, basketItemId: 0 }]), failurePayload(0)],
    [failureResult([{ ...valid, basketItemId: 1.5 }]), failurePayload(1.5)],
    [failureResult([{ ...valid, basketItemId: Number.MAX_SAFE_INTEGER + 1 }]), failurePayload(Number.MAX_SAFE_INTEGER + 1)],
    [failureResult([{ ...valid, placeName: '\u0000\u202E\u0085' }]), failurePayload(11)],
    [failureResult([{ ...valid, reason: 'UNKNOWN_REASON' }]), failurePayload(11)],
    [failureResult([{ ...valid, adjustmentProposal: 'ADJUST_START_TIME' }]), failurePayload(11)],
    [failureResult([valid, { ...diagnostic(12, 'ROUTE_NOT_FOUND', 'CHECK_ROUTE_AVAILABILITY'), placeName: '' }]), failurePayload(11, 12)],
  ];

  cases.forEach(([result, payload], index) => {
    assert.equal(normalizeFailure(result, payload), null, `invalid case ${index + 1}`);
  });
});

test('rejects inherited object property names as unknown diagnostic reasons without throwing', () => {
  const normalizeFailure = coursePreviewModel.normalizeCoursePreviewFailure;

  for (const reason of ['__proto__', 'constructor']) {
    assert.equal(normalizeFailure(failureResult([{
      basketItemId: 11,
      placeName: '서울공예박물관',
      reason,
    }]), failurePayload(11)), null, reason);
  }
});

test('maps course and auth errors to actionable preview messages', () => {
  assert.equal(coursePreviewErrorMessage({ status: 401, code: 'COMMON401' }), '로그인이 만료됐어요. 다시 로그인한 뒤 코스를 계산해주세요.');
  assert.equal(coursePreviewErrorMessage({ code: 'COURSE4041' }), '담아둔 장소가 변경됐어요. 장소 목록을 새로 확인해주세요.');
  assert.equal(coursePreviewErrorMessage({ code: 'COURSE4221' }), '위치 정보가 없는 장소가 있어 코스를 만들 수 없어요. 장소 목록을 확인해주세요.');
  assert.equal(coursePreviewErrorMessage({ code: 'COURSE4222' }), '입력한 조건으로 빠른 코스를 만들 수 없어요. 출발 시간이나 장소별 체류시간을 조정해주세요.');
  assert.equal(coursePreviewErrorMessage({ code: 'COMMON400' }), '입력한 코스 조건을 다시 확인해주세요.');
  assert.equal(coursePreviewErrorMessage(new Error('network')), '코스를 계산하지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.');
});

test('changes the map fit key when a new preview result is generated', () => {
  const first = normalizeCoursePreview({
    generatedAt: '2026-08-18T01:00:00Z',
    options: [option('FAST', [stop(1)])],
  });
  const second = normalizeCoursePreview({
    generatedAt: '2026-08-18T01:01:00Z',
    options: [option('FAST', [stop(1)])],
  });

  assert.ok(first.routeFitKey);
  assert.notEqual(first.routeFitKey, second.routeFitKey);
});
