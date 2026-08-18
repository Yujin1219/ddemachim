import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLatestViewportRequest,
  createViewportLoadGate,
  getMockCrowdingGridDetailAtCoordinate,
  getMockCrowdingMarkerPresentation,
  getSeoulCrowdingSlot,
  reconcileSelectedMockCrowdingGrid,
  toMockCrowdingFeatureCollection,
  toMockCrowdingGridDetail,
} from './mockCrowdingMap.js';

const GRID = Object.freeze({
  gridCode: 'G-100-100',
  coordinates: [[
    [126.9765, 37.5757],
    [126.9771, 37.5757],
    [126.9771, 37.5761],
    [126.9765, 37.5761],
    [126.9765, 37.5757],
  ]],
  centerLatitude: 37.5759,
  centerLongitude: 126.9768,
  score: 76,
  level: 'VERY_CROWDED',
  levelLabel: '붐빔',
  mock: true,
  slotStart: '2026-08-18T14:00:00+09:00',
  slotEnd: '2026-08-18T14:30:00+09:00',
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

test('converts complete MOCK grid responses to GeoJSON without reversing longitude and latitude', () => {
  const collection = toMockCrowdingFeatureCollection([GRID]);

  assert.deepEqual(collection, {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'G-100-100',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [126.9765, 37.5757],
          [126.9771, 37.5757],
          [126.9771, 37.5761],
          [126.9765, 37.5761],
          [126.9765, 37.5757],
        ]],
      },
      properties: {
        gridCode: 'G-100-100',
        centerCoordinate: [126.9768, 37.5759],
        score: 76,
        level: 'VERY_CROWDED',
        levelLabel: '붐빔',
        mock: true,
        slotStart: '2026-08-18T14:00:00+09:00',
        slotEnd: '2026-08-18T14:30:00+09:00',
      },
    }],
  });
});

test('maps canonical levels to Korean labels and rejects malformed successful payloads', () => {
  const levels = [
    ['RELAXED', '여유'],
    ['NORMAL', '보통'],
    ['CROWDED', '약간 붐빔'],
    ['VERY_CROWDED', '붐빔'],
  ];

  const collection = toMockCrowdingFeatureCollection(levels.map(([level], index) => ({
    ...GRID,
    gridCode: `G-${index}`,
    level,
    levelLabel: '',
  })));
  assert.deepEqual(
    collection.features.map((feature) => feature.properties.levelLabel),
    levels.map(([, label]) => label),
  );
  assert.throws(
    () => toMockCrowdingFeatureCollection([{ ...GRID, mock: false }]),
    TypeError,
  );
  assert.throws(
    () => toMockCrowdingFeatureCollection([{ ...GRID, coordinates: [[[37.5757, 226.9765]]] }]),
    TypeError,
  );
});

test('builds selected-grid detail with score, Korean level, and Seoul slot range', () => {
  assert.deepEqual(toMockCrowdingGridDetail(GRID), {
    gridCode: 'G-100-100',
    title: '50m 격자',
    score: 76,
    scoreLabel: '76점',
    level: 'VERY_CROWDED',
    levelLabel: '붐빔',
    slotLabel: '8월 18일 14:00–14:30',
  });
});

test('adds a grid level class and status-oriented accessible wording to a covered place marker only', () => {
  assert.deepEqual(getMockCrowdingMarkerPresentation({
    placeName: '북촌한옥청보리',
    markerLabel: 3,
    grid: GRID,
  }), {
    ariaLabel: '3번 북촌한옥청보리 장소 보기 · 혼잡도 붐빔',
    className: 'is-crowding-very-crowded',
    levelLabel: '붐빔',
  });
  assert.deepEqual(getMockCrowdingMarkerPresentation({
    placeName: '격자 밖 장소',
    markerLabel: null,
    grid: null,
  }), {
    ariaLabel: '격자 밖 장소 장소 보기',
    className: '',
    levelLabel: null,
  });
});

test('reconciles a selected grid to refreshed score and slot data or clears it outside the viewport', () => {
  const refreshed = {
    ...GRID,
    score: 42,
    level: 'NORMAL',
    levelLabel: '보통',
    slotStart: '2026-08-18T14:30:00+09:00',
    slotEnd: '2026-08-18T15:00:00+09:00',
  };

  assert.deepEqual(reconcileSelectedMockCrowdingGrid([refreshed], GRID.gridCode), {
    gridCode: 'G-100-100',
    title: '50m 격자',
    score: 42,
    scoreLabel: '42점',
    level: 'NORMAL',
    levelLabel: '보통',
    slotLabel: '8월 18일 14:30–15:00',
  });
  assert.equal(reconcileSelectedMockCrowdingGrid([refreshed], 'G-outside'), null);
  assert.equal(reconcileSelectedMockCrowdingGrid([refreshed], null), null);
});

test('selects the crowding grid at a projected keyboard coordinate', () => {
  const projectedCoordinate = [14135000, 4519000];
  const source = {
    getFeaturesAtCoordinate(coordinate) {
      assert.equal(coordinate, projectedCoordinate);
      return [{ getProperties: () => GRID }];
    },
  };

  assert.deepEqual(
    getMockCrowdingGridDetailAtCoordinate(source, projectedCoordinate),
    toMockCrowdingGridDetail(GRID),
  );
  assert.equal(getMockCrowdingGridDetailAtCoordinate(source, null), null);
});

test('coalesces duplicate initial viewport events while accepting a changed viewport', () => {
  const gate = createViewportLoadGate();
  const initialBounds = {
    minLat: 37.56,
    maxLat: 37.59,
    minLng: 126.96,
    maxLng: 127.01,
  };

  assert.equal(gate.shouldLoad(initialBounds), true);
  assert.equal(gate.shouldLoad({ ...initialBounds }), false);
  assert.equal(gate.shouldLoad({ ...initialBounds, maxLng: 127.011 }), true);
  assert.equal(gate.shouldLoad({ ...initialBounds, maxLng: 127.011 }), false);
  gate.reset();
  assert.equal(gate.shouldLoad({ ...initialBounds, maxLng: 127.011 }), true);
});

test('resolves half-hour Asia/Seoul slots across the exact boundary', () => {
  const beforeBoundary = getSeoulCrowdingSlot(new Date('2026-08-18T05:29:59.000Z'));
  const atBoundary = getSeoulCrowdingSlot(new Date('2026-08-18T05:30:00.000Z'));

  assert.deepEqual(beforeBoundary, {
    key: '2026-08-18T05:00:00.000Z',
    requestAt: '2026-08-18T05:29:59.000Z',
    startTimestamp: Date.parse('2026-08-18T05:00:00.000Z'),
    endTimestamp: Date.parse('2026-08-18T05:30:00.000Z'),
  });
  assert.equal(atBoundary.key, '2026-08-18T05:30:00.000Z');
  assert.equal(atBoundary.endTimestamp, Date.parse('2026-08-18T06:00:00.000Z'));
});

test('aborts the previous viewport request and applies only the latest successful response', async () => {
  const latestRequest = createLatestViewportRequest();
  const first = deferred();
  const second = deferred();
  const failed = deferred();
  const rendered = ['existing-grid'];
  let firstSignal;

  const firstRun = latestRequest.run(
    (signal) => {
      firstSignal = signal;
      return first.promise;
    },
    (features) => rendered.splice(0, rendered.length, ...features),
  );
  const secondRun = latestRequest.run(
    () => second.promise,
    (features) => rendered.splice(0, rendered.length, ...features),
  );

  assert.equal(firstSignal.aborted, true);
  second.resolve(['fresh-grid']);
  await secondRun;
  first.resolve(['stale-grid']);
  await firstRun;
  assert.deepEqual(rendered, ['fresh-grid']);

  const failedRun = latestRequest.run(
    () => failed.promise,
    (features) => rendered.splice(0, rendered.length, ...features),
  );
  failed.reject(new Error('offline'));
  await failedRun;
  assert.deepEqual(rendered, ['fresh-grid']);
});
