import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import CoursePreviewResults from './CoursePreviewResults.js';

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
const unexpectedConsoleErrors = [];
console.error = (...args) => {
  const message = args.map((value) => String(value)).join(' ');
  if (!message.includes('react-test-renderer is deprecated')) unexpectedConsoleErrors.push(message);
};

function textContent(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent(node.children);
}

function FakeMap(props) {
  return createElement('div', { role: 'img', 'aria-label': props.ariaLabel });
}

const walkStep = {
  streetName: '율곡로',
  distanceMeters: 180,
  description: '횡단보도를 건너세요',
  geometry: { type: 'LineString', coordinates: [[126.98, 37.57], [126.99, 37.58]] },
};
const preview = {
  strategy: 'FAST',
  stopCount: 2,
  totalDurationMinutes: 260,
  totalTravelMinutes: 52,
  totalDistanceMeters: 7800,
  scheduledStart: '10:00',
  scheduledEnd: '14:20',
  routeFitKey: 'generated-1',
  routeLegs: [{ mode: 'WALK', routeName: '도보', geometry: walkStep.geometry, steps: [walkStep] }],
  stops: [
    {
      sequenceNo: 1,
      placeName: '서울공예박물관',
      address: '서울 종로구 율곡로3길 4',
      latitude: 37.576,
      longitude: 126.983,
      dwellMinutes: 45,
      dwellSource: 'USER',
      arrivalDeadline: '11:10',
      arrivalBufferMinutes: 10,
      scheduledArrival: '11:00',
      scheduledDeparture: '11:45',
      travelMinutesFromPrevious: 15,
      travelDistanceMeters: 2800,
      hoursSourceType: 'REAL',
      openTime: '09:00',
      closeTime: '18:00',
      incomingRoute: {
        mode: 'TRANSIT',
        status: 'AVAILABLE',
        durationSeconds: 900,
        distanceMeters: 2800,
        fareWon: 1500,
        transferCount: 0,
        walkDistanceMeters: 180,
        unavailableReason: null,
        legs: [
          { mode: 'TRANSIT', routeName: '종로02', durationSeconds: 600, distanceMeters: 2400, geometry: null, steps: [] },
          { mode: 'WALK', routeName: '도보', durationSeconds: 300, distanceMeters: 400, geometry: null, steps: [walkStep] },
        ],
      },
    },
    {
      sequenceNo: 2,
      placeName: '도토리가든',
      address: '서울 종로구 계동길 19-8',
      latitude: 37.58,
      longitude: 126.986,
      dwellMinutes: 60,
      dwellSource: 'DEFAULT',
      arrivalDeadline: null,
      arrivalBufferMinutes: null,
      scheduledArrival: '12:10',
      scheduledDeparture: '13:10',
      travelMinutesFromPrevious: null,
      travelDistanceMeters: null,
      hoursSourceType: 'DEMO_DEFAULT',
      openTime: '09:00',
      closeTime: '21:00',
      incomingRoute: {
        mode: 'TRANSIT',
        status: 'UNAVAILABLE',
        durationSeconds: null,
        distanceMeters: null,
        fareWon: null,
        transferCount: null,
        walkDistanceMeters: null,
        unavailableReason: 'NO_ROUTE',
        legs: [],
      },
    },
  ],
};

test.afterEach(() => {
  assert.deepEqual(unexpectedConsoleErrors, [], `unexpected console.error: ${unexpectedConsoleErrors.join('\n')}`);
  unexpectedConsoleErrors.length = 0;
});

test.after(() => {
  console.error = originalConsoleError;
  if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test('renders FAST schedule, authoritative hours, incoming legs, WALK steps, and map geometry', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
      onEditConditions: () => {},
      onEditStops: () => {},
    }));
  });

  const copy = textContent(renderer.toJSON());
  const map = renderer.root.findByType(FakeMap);
  assert.equal(copy.includes('빠른 코스'), true);
  assert.equal(copy.includes('4시간 20분'), true);
  assert.equal(copy.includes('이동 52분'), true);
  assert.equal(copy.includes('7.8km'), true);
  assert.equal(copy.includes('11:00 도착 · 11:45 출발'), true);
  assert.equal(copy.includes('실제 운영시간 · 09:00-18:00'), true);
  assert.equal(copy.includes('데모 기본 운영시간 · 09:00-21:00'), true);
  assert.equal(copy.includes('종로02'), true);
  assert.equal(copy.includes('횡단보도를 건너세요'), true);
  assert.equal(copy.includes('경로 정보 없음'), true);
  assert.equal(map.props.routeLegs, preview.routeLegs);
  assert.equal(map.props.routeFitKey, 'generated-1');
  assert.equal(map.props.center, undefined);
  assert.equal(map.props.interactive, true);
  assert.equal(map.props.clusterPlaces, false);
  assert.equal(map.props.showCongestionAreas, false);
  assert.equal(map.props.fitPlaceMarkers, false);
  assert.equal(map.props.placeRequestKey, 'generated-1');
  assert.deepEqual(map.props.routeFitPadding, [20, 20, 20, 20]);
  assert.deepEqual(await map.props.loadPlacesInBounds(), [
    { id: '1-서울공예박물관', name: '서울공예박물관', latitude: 37.576, longitude: 126.983, sequenceNo: 1 },
    { id: '2-도토리가든', name: '도토리가든', latitude: 37.58, longitude: 126.986, sequenceNo: 2 },
  ]);
  assert.equal(map.props.placeMarkerLabel({ sequenceNo: 2 }), 2);
});

test('switches every displayed and mapped value between FAST and QUIET by strategy', async () => {
  const quietStop = {
    ...preview.stops[1],
    sequenceNo: 1,
    placeName: '한적한 북촌 정원',
    scheduledArrival: '10:40',
    scheduledDeparture: '11:40',
    congestionScore: 67,
    latitude: 35.18,
    longitude: 129.07,
  };
  const quiet = {
    ...preview,
    strategy: 'QUIET',
    stopCount: 1,
    totalDurationMinutes: 310,
    totalTravelMinutes: 70,
    totalDistanceMeters: 9100,
    scheduledStart: '10:20',
    scheduledEnd: '15:30',
    averageCongestionScore: 33,
    routeFitKey: 'generated-1|QUIET|12:1:10:40',
    routeLegs: [{ mode: 'WALK', routeName: '조용한 길', geometry: null, steps: [] }],
    stops: [quietStop],
  };
  const responsePreview = { ...preview, options: [quiet, preview] };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: responsePreview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
      onEditConditions: () => {},
      onEditStops: () => {},
    }));
  });

  const radios = renderer.root.findAllByType('input');
  const fastRadio = radios.find((input) => input.props.value === 'FAST');
  const quietRadio = radios.find((input) => input.props.value === 'QUIET');
  assert.equal(fastRadio.props.type, 'radio');
  assert.equal(fastRadio.props.name, quietRadio.props.name);
  assert.equal(fastRadio.props.checked, true);
  assert.equal(quietRadio.props.checked, false);

  await act(async () => quietRadio.props.onChange({ target: { value: 'QUIET' } }));

  const copy = textContent(renderer.toJSON());
  const selectedRadios = renderer.root.findAllByType('input');
  const map = renderer.root.findByType(FakeMap);
  assert.equal(selectedRadios.find((input) => input.props.value === 'QUIET').props.checked, true);
  assert.equal(copy.includes('한적한 코스'), true);
  assert.equal(copy.includes('10:20-15:30 · 1곳'), true);
  assert.equal(copy.includes('5시간 10분'), true);
  assert.equal(copy.includes('이동 1시간 10분'), true);
  assert.equal(copy.includes('9.1km'), true);
  assert.equal(copy.includes('한적한 북촌 정원'), true);
  assert.equal(copy.includes('10:40 도착 · 11:40 출발'), true);
  assert.equal(copy.includes('평균 혼잡도 보통'), true);
  assert.equal(copy.includes('예상 혼잡도 약간 붐빔'), true);
  assert.equal(copy.includes('서울공예박물관'), true);
  assert.equal(map.props.routeLegs, quiet.routeLegs);
  assert.equal(map.props.routeFitKey, quiet.routeFitKey);
  assert.equal(map.props.placeRequestKey, quiet.routeFitKey);
  assert.equal(map.props.fitPlaceMarkers, true);
  assert.deepEqual(await map.props.loadPlacesInBounds(), [
    { id: '1-한적한 북촌 정원', name: '한적한 북촌 정원', latitude: 35.18, longitude: 129.07, sequenceNo: 1 },
  ]);
  assert.deepEqual(map.props.center, [129.07, 35.18]);
  assert.equal(map.props.ariaLabel, '한적한 코스 추천 경로 지도');
});

test('resets a prior QUIET choice to FAST when a new response arrives', async () => {
  const quiet = { ...preview, strategy: 'QUIET', routeFitKey: 'quiet-route' };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: { ...preview, options: [quiet, preview] },
      status: 'success',
      MapComponent: FakeMap,
    }));
  });
  const quietRadio = renderer.root.findAllByType('input').find((input) => input.props.value === 'QUIET');
  await act(async () => quietRadio.props.onChange({ target: { value: 'QUIET' } }));

  const nextFastOption = { ...preview, routeFitKey: 'next-fast-route', totalDurationMinutes: 120 };
  const nextQuietOption = { ...quiet, routeFitKey: 'next-quiet-route', totalDurationMinutes: 360 };
  const nextFast = { ...nextFastOption, options: [nextQuietOption, nextFastOption] };
  await act(async () => {
    renderer.update(createElement(CoursePreviewResults, {
      preview: nextFast,
      status: 'success',
      MapComponent: FakeMap,
    }));
  });

  const nextRadios = renderer.root.findAllByType('input');
  assert.equal(nextRadios.find((input) => input.props.value === 'FAST').props.checked, true);
  assert.equal(nextRadios.find((input) => input.props.value === 'QUIET').props.checked, false);
  assert.equal(textContent(renderer.toJSON()).includes('2시간'), true);
  assert.equal(renderer.root.findByType(FakeMap).props.routeFitKey, 'next-fast-route');
});

test('switches an individual leg locally and propagates a longer route to its map and downstream schedule', async () => {
  const alternativeGeometry = { type: 'LineString', coordinates: [[126.982, 37.572], [126.99, 37.58]] };
  const alternativeRoute = {
    mode: 'WALK',
    status: 'AVAILABLE',
    durationSeconds: 1200,
    distanceMeters: 900,
    legs: [{ mode: 'WALK', routeName: '대안 도보', durationSeconds: 1200, distanceMeters: 900, geometry: alternativeGeometry, steps: [] }],
  };
  const selectable = {
    ...preview,
    stops: [
      {
        ...preview.stops[0],
        basketItemId: 101,
        scheduledArrival: '10:15',
        scheduledDeparture: '11:00',
        selectedRoute: preview.stops[0].incomingRoute,
        alternativeRoute,
      },
      {
        ...preview.stops[1],
        basketItemId: 102,
        scheduledArrival: '11:15',
        scheduledDeparture: '12:15',
        selectedRoute: { ...preview.stops[0].incomingRoute, legs: [] },
      },
    ],
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, { preview: selectable, status: 'success', MapComponent: FakeMap }));
  });

  const alternative = renderer.root.findAllByType('input').find((input) => input.props.value === 'alternative');
  assert.ok(alternative);
  assert.equal(textContent(renderer.toJSON()).includes('대안 · 도보 20분'), true);
  await act(async () => alternative.props.onChange());

  const copy = textContent(renderer.toJSON());
  const map = renderer.root.findByType(FakeMap);
  assert.equal(copy.includes('대체 경로를 반영해 예상 일정이 다시 계산되었어요.'), true);
  assert.equal(copy.includes('10:20 도착 · 11:05 출발'), true);
  assert.equal(copy.includes('11:20 도착 · 12:20 출발'), true);
  assert.equal(copy.includes('4시간 25분'), true);
  assert.equal(copy.includes('이동 57분'), true);
  assert.deepEqual(map.props.routeLegs, [alternativeRoute.legs[0]]);
  assert.match(map.props.routeFitKey, /101:alternative/);
  assert.equal(map.props.placeRequestKey, map.props.routeFitKey);
  assert.deepEqual(await map.props.loadPlacesInBounds(), [
    { id: 101, name: '서울공예박물관', latitude: 37.576, longitude: 126.983, sequenceNo: 1 },
    { id: 102, name: '도토리가든', latitude: 37.58, longitude: 126.986, sequenceNo: 2 },
  ]);
});

test('hides EASY terrain metrics for transit and reveals them only for a short selected walk', async () => {
  const easyPreview = {
    ...preview,
    strategy: 'EASY',
    totalAscentMeters: 18,
    elevationComparisons: [{
      sequenceNo: 1,
      placeName: '서울공예박물관',
      originalAscentMeters: 22,
      easyAscentMeters: 18,
      originalSteepUphillDistanceMeters: 50,
      easySteepUphillDistanceMeters: 20,
      easyCoveragePercent: 100,
    }],
    stops: [{
      ...preview.stops[0],
      basketItemId: 201,
      ascentMeters: 18,
      selectedRoute: preview.stops[0].incomingRoute,
      alternativeRoute: {
        mode: 'WALK',
        status: 'AVAILABLE',
        durationSeconds: 1200,
        distanceMeters: 1000,
        legs: [],
      },
    }],
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, { preview: easyPreview, status: 'success', MapComponent: FakeMap }));
  });
  assert.equal(textContent(renderer.toJSON()).includes('상승 고도'), false);

  const alternative = renderer.root.findAllByType('input').find((input) => input.props.value === 'alternative');
  await act(async () => alternative.props.onChange());
  assert.equal(textContent(renderer.toJSON()).includes('상승 고도 18m'), true);
  assert.equal(textContent(renderer.toJSON()).includes('도보 경사 비교'), true);
});

test('announces course preview loading as a busy status', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'loading',
      MapComponent: FakeMap,
    }));
  });

  const status = renderer.root.findByProps({ role: 'status' });
  assert.equal(status.props['aria-busy'], true);
  assert.equal(textContent(status).includes('빠른 코스를 계산하고 있어요'), true);
});

test('renders an actionable preview error without discarding the draft', async () => {
  let retryCount = 0;
  let backCount = 0;
  let editCount = 0;
  let editStopsCount = 0;
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'error',
      message: '입력한 조건으로 빠른 코스를 만들 수 없어요.',
      onBack: () => { backCount += 1; },
      onRetry: () => { retryCount += 1; },
      onEditConditions: () => { editCount += 1; },
      onEditStops: () => { editStopsCount += 1; },
    }));
  });

  const alert = renderer.root.findByProps({ role: 'alert' });
  assert.equal(textContent(alert).includes('입력한 조건으로 빠른 코스를 만들 수 없어요.'), true);
  const buttons = renderer.root.findAllByType('button');
  const retry = buttons.find((button) => textContent(button) === '다시 계산하기');
  const edit = buttons.find((button) => textContent(button) === '출발 조건 수정');
  const editStops = buttons.find((button) => textContent(button) === '장소별 시간 수정');
  const back = buttons.find((button) => button.props['aria-label'] === '이전');
  assert.ok(retry);
  assert.ok(edit);
  assert.ok(editStops);
  assert.ok(back);
  await act(async () => retry.props.onClick());
  await act(async () => edit.props.onClick());
  await act(async () => editStops.props.onClick());
  await act(async () => back.props.onClick());
  assert.equal(retryCount, 1);
  assert.equal(editCount, 1);
  assert.equal(editStopsCount, 1);
  assert.equal(backCount, 1);
});
