import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import SelectedPlaceRoutePanel, {
  resolveAvailableRouteMode,
  selectedPlaceDetailTarget,
  visibleRouteModes,
} from './SelectedPlaceRoutePanel.js';

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
const unexpectedConsoleErrors = [];
console.error = (...args) => {
  const message = args.map((value) => String(value)).join(' ');
  if (!message.includes('react-test-renderer is deprecated')) unexpectedConsoleErrors.push(message);
};

const origin = { latitude: 37.5665, longitude: 126.978 };
const destination = { latitude: 37.5559, longitude: 126.9723 };
const selectedPlace = {
  id: 'place-1',
  name: '서울공예박물관',
  latitude: destination.latitude,
  longitude: destination.longitude,
  roadAddress: '서울 종로구 율곡로3길 4',
};

function route(mode, overrides = {}) {
  return {
    mode,
    status: 'AVAILABLE',
    durationSeconds: mode === 'WALK' ? 840 : mode === 'TRANSIT' ? 1320 : 610,
    distanceMeters: mode === 'WALK' ? 960 : mode === 'TRANSIT' ? 2200 : 4800,
    fareWon: mode === 'TAXI' ? 8700 : null,
    transferCount: mode === 'TRANSIT' ? 1 : null,
    walkDistanceMeters: mode === 'TRANSIT' ? 360 : null,
    legs: [],
    ...overrides,
  };
}

function textContent(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent(node.children);
}

function modeButtons(renderer) {
  return renderer.root.findAll(
    (node) => node.type === 'button' && String(node.props.className || '').includes('route-mode-tab'),
  );
}

test.afterEach(() => {
  assert.deepEqual(unexpectedConsoleErrors, [], `unexpected console.error: ${unexpectedConsoleErrors.join('\n')}`);
  unexpectedConsoleErrors.length = 0;
});

test.after(() => {
  console.error = originalConsoleError;
  if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

async function renderPanel(props = {}) {
  let renderer;
  await act(async () => {
    renderer = create(createElement(SelectedPlaceRoutePanel, {
      selectedPlace,
      location: origin,
      locationStatus: 'ready',
      routeStatus: 'ready',
      routeData: { routes: [route('WALK'), route('TRANSIT'), route('TAXI')] },
      activeMode: 'WALK',
      onModeChange: () => {},
      onRetryLocation: () => {},
      onRetryRoute: () => {},
      taxiHref: 'https://t.kakao.com/launch?type=taxi&dest_lat=37.5559&dest_lng=126.9723',
      ...props,
    }));
  });
  return renderer;
}

test('renders current location and three route mode buttons in fixed order', async () => {
  const renderer = await renderPanel();
  const buttons = modeButtons(renderer);

  assert.equal(textContent(renderer.toJSON()).includes('현재 위치에서'), true);
  assert.deepEqual(buttons.map((button) => textContent(button)), ['도보14분', '대중교통22분', '택시10분']);
  assert.deepEqual(buttons.map((button) => button.props['aria-pressed']), [true, false, false]);
  assert.equal(renderer.root.findAll((node) => node.props['aria-live'] === 'polite').length > 0, true);
});

test('filters unavailable transit while keeping available walk and taxi modes', () => {
  assert.deepEqual(visibleRouteModes('ready', {
    routes: [
      { mode: 'WALK', status: 'AVAILABLE' },
      { mode: 'TRANSIT', status: 'UNAVAILABLE', unavailableReason: 'TIMEOUT' },
      { mode: 'TAXI', status: 'AVAILABLE' },
    ],
  }), ['WALK', 'TAXI']);
});

test('resolves a disappeared active mode to the first visible mode', () => {
  assert.equal(resolveAvailableRouteMode('TRANSIT', ['WALK', 'TAXI']), 'WALK');
});

test('resolves a disappeared transit mode to the first available route by priority', () => {
  assert.equal(resolveAvailableRouteMode('TRANSIT', ['WALK', 'TAXI'], {
    routes: [
      route('WALK', { status: 'UNAVAILABLE', unavailableReason: 'NO_ROUTE' }),
      route('TRANSIT', { status: 'UNAVAILABLE', unavailableReason: 'TIMEOUT' }),
      route('TAXI'),
    ],
  }), 'TAXI');
});

test('keeps all route mode tabs visible while routes are loading', () => {
  assert.deepEqual(visibleRouteModes('loading', null), ['WALK', 'TRANSIT', 'TAXI']);
});

test('hides only transit for every transit unavailability reason', () => {
  for (const unavailableReason of ['NO_ROUTE', 'TIMEOUT', 'PROVIDER_UNAVAILABLE', 'NOT_CONFIGURED']) {
    assert.deepEqual(
      visibleRouteModes('ready', {
        routes: [
          { mode: 'WALK', status: 'UNAVAILABLE', unavailableReason: 'NO_ROUTE' },
          { mode: 'TRANSIT', status: 'UNAVAILABLE', unavailableReason },
          { mode: 'TAXI', status: 'UNAVAILABLE', unavailableReason: 'TIMEOUT' },
        ],
      }),
      ['WALK', 'TAXI'],
      unavailableReason,
    );
  }
});

test('shows calculation status on every mode tab while routes are loading', async () => {
  const renderer = await renderPanel({ routeStatus: 'loading', routeData: null });

  assert.deepEqual(
    modeButtons(renderer).map((button) => textContent(button)),
    ['도보계산 중', '대중교통계산 중', '택시계산 중'],
  );
});

test('shows per-mode availability in a partial route response', async () => {
  const renderer = await renderPanel({
    routeData: {
      routes: [
        route('WALK'),
        route('TRANSIT', { status: 'UNAVAILABLE', unavailableReason: 'NO_ROUTE' }),
        route('TAXI', { status: 'UNAVAILABLE', unavailableReason: 'NOT_CONFIGURED' }),
      ],
    },
  });

  assert.deepEqual(
    modeButtons(renderer).map((button) => textContent(button)),
    ['도보14분', '택시이용 불가'],
  );
});

test('shows location and route state copy with a retry action', async () => {
  const locating = await renderPanel({ locationStatus: 'locating', routeStatus: 'idle' });
  assert.equal(textContent(locating.toJSON()).includes('현재 위치 확인 중…'), true);

  const denied = await renderPanel({ locationStatus: 'error', locationErrorCode: 'DENIED', routeStatus: 'idle' });
  assert.equal(
    textContent(denied.toJSON()).includes('위치 권한이 꺼져 있어요. 브라우저 설정에서 허용한 뒤 다시 시도해주세요.'),
    true,
  );
  assert.equal(denied.root.findAll((node) => node.type === 'button' && textContent(node) === '다시 시도').length, 1);

  const loading = await renderPanel({ locationStatus: 'ready', routeStatus: 'loading' });
  assert.equal(textContent(loading.toJSON()).includes('경로 계산 중…'), true);

  const nearby = await renderPanel({ location: destination, routeStatus: 'idle', routeData: null });
  assert.equal(textContent(nearby.toJSON()).includes('이미 목적지 근처예요'), true);
});

test('uses the typed location failure copy for unsupported, timeout, and unavailable errors', async () => {
  const cases = [
    ['UNSUPPORTED', '이 브라우저에서는 현재 위치를 사용할 수 없어요.'],
    ['TIMEOUT', '현재 위치 확인이 지연되고 있어요. 다시 시도해주세요.'],
    ['UNAVAILABLE', '현재 위치를 확인하지 못했어요. 다시 시도해주세요.'],
  ];

  for (const [locationErrorCode, expectedCopy] of cases) {
    const renderer = await renderPanel({ locationStatus: 'error', locationErrorCode, routeStatus: 'idle' });
    assert.equal(textContent(renderer.toJSON()).includes(expectedCopy), true, locationErrorCode);
  }
});

test('hides stale transit detail when the active transit route disappears', async () => {
  const renderer = await renderPanel({
    activeMode: 'TRANSIT',
    routeData: {
      routes: [
        route('WALK'),
        route('TRANSIT', { status: 'UNAVAILABLE', unavailableReason: 'NO_ROUTE' }),
        route('TAXI'),
      ],
    },
  });

  assert.equal(textContent(renderer.toJSON()).includes('대중교통 경로를 찾지 못했어요.'), false);
  assert.equal(textContent(renderer.toJSON()).includes('도보14분'), true);
  assert.deepEqual(modeButtons(renderer).map((button) => button.props['aria-pressed']), [true, false]);
});

test('notifies the controlled parent when the active mode is no longer visible', async () => {
  const modeChanges = [];
  await renderPanel({
    activeMode: 'TRANSIT',
    onModeChange: (mode) => modeChanges.push(mode),
    routeData: {
      routes: [
        route('WALK'),
        route('TRANSIT', { status: 'UNAVAILABLE', unavailableReason: 'NO_ROUTE' }),
        route('TAXI'),
      ],
    },
  });

  assert.deepEqual(modeChanges, ['WALK']);
});

test('renders the first available route when transit disappears and walk is unavailable', async () => {
  const modeChanges = [];
  const renderer = await renderPanel({
    activeMode: 'TRANSIT',
    onModeChange: (mode) => modeChanges.push(mode),
    routeData: {
      routes: [
        route('WALK', { status: 'UNAVAILABLE', unavailableReason: 'NO_ROUTE' }),
        route('TRANSIT', { status: 'UNAVAILABLE', unavailableReason: 'TIMEOUT' }),
        route('TAXI'),
      ],
    },
  });

  assert.deepEqual(modeButtons(renderer).map((button) => button.props['aria-pressed']), [false, true]);
  assert.equal(textContent(renderer.toJSON()).includes('예상 8,700원'), true);
  assert.deepEqual(modeChanges, ['TAXI']);
});

test('shows a retry for temporary provider failure without hiding successful modes', async () => {
  let retryCount = 0;
  const renderer = await renderPanel({
    activeMode: 'TAXI',
    onRetryRoute: () => { retryCount += 1; },
    routeData: {
      routes: [
        route('WALK'),
        route('TRANSIT', { status: 'UNAVAILABLE', unavailableReason: 'TIMEOUT' }),
        route('TAXI', { status: 'UNAVAILABLE', unavailableReason: 'PROVIDER_UNAVAILABLE' }),
      ],
    },
  });
  const copy = textContent(renderer.toJSON());
  const retry = renderer.root.find(
    (node) => node.type === 'button' && textContent(node) === '다시 시도',
  );

  assert.equal(copy.includes('택시 정보를 잠시 불러오지 못했어요.'), true);
  assert.equal(textContent(modeButtons(renderer)[0]), '도보14분');
  assert.equal(textContent(modeButtons(renderer)[1]), '택시일시 오류');
  await act(async () => retry.props.onClick());
  assert.equal(retryCount, 1);
});

test('shows a retry for an explicitly selected walk temporary provider failure', async () => {
  let retryCount = 0;
  const renderer = await renderPanel({
    activeMode: 'WALK',
    onRetryRoute: () => { retryCount += 1; },
    routeData: {
      routes: [
        route('WALK', { status: 'UNAVAILABLE', unavailableReason: 'PROVIDER_UNAVAILABLE' }),
        route('TRANSIT', { status: 'UNAVAILABLE', unavailableReason: 'TIMEOUT' }),
        route('TAXI'),
      ],
    },
  });
  const copy = textContent(renderer.toJSON());
  const retry = renderer.root.find(
    (node) => node.type === 'button' && textContent(node) === '다시 시도',
  );

  assert.equal(copy.includes('도보 정보를 잠시 불러오지 못했어요.'), true);
  assert.deepEqual(modeButtons(renderer).map((button) => textContent(button)), ['도보일시 오류', '택시10분']);
  await act(async () => retry.props.onClick());
  assert.equal(retryCount, 1);
});

test('keeps internal selected-place detail navigation separate from Kakao cards', () => {
  assert.deepEqual(selectedPlaceDetailTarget({ id: 'place-1', externalSource: 'INTERNAL' }), {
    screen: 'place',
    id: 'place-1',
  });
  assert.equal(selectedPlaceDetailTarget({ id: 'kakao:place-1', externalSource: 'KAKAO' }), null);
});

test('explains when an active route mode is not configured', async () => {
  const renderer = await renderPanel({
    activeMode: 'TAXI',
    routeData: {
      routes: [
        route('WALK'),
        route('TRANSIT'),
        route('TAXI', { status: 'UNAVAILABLE', unavailableReason: 'NOT_CONFIGURED' }),
      ],
    },
  });

  assert.equal(textContent(renderer.toJSON()).includes('택시는 지금 이용할 수 없어요.'), true);
});

test('renders taxi fare, note, and Kakao T anchor only for active taxi mode', async () => {
  const renderer = await renderPanel({ activeMode: 'TAXI' });
  const copy = textContent(renderer.toJSON());
  const links = renderer.root.findAll((node) => node.type === 'a' && textContent(node) === '카카오 T로 호출');

  assert.equal(copy.includes('예상 8,700원'), true);
  assert.equal(copy.includes('앱에서 출발지와 목적지를 확인한 뒤 호출을 완료해주세요.'), true);
  assert.equal(links.length, 1);
  assert.equal(links[0].props.href, 'https://t.kakao.com/launch?type=taxi&dest_lat=37.5559&dest_lng=126.9723');
  assert.equal(links[0].props.target, '_blank');

  const walk = await renderPanel({ activeMode: 'WALK' });
  assert.equal(walk.root.findAll((node) => node.type === 'a' && textContent(node) === '카카오 T로 호출').length, 0);
});

test('does not fabricate transit transfer or walking metrics from null-like values', async () => {
  const renderer = await renderPanel({
    activeMode: 'TRANSIT',
    routeData: {
      routes: [
        route('WALK'),
        route('TRANSIT', {
          transferCount: null,
          walkDistanceMeters: '',
        }),
        route('TAXI'),
      ],
    },
  });
  const copy = textContent(renderer.toJSON());

  assert.equal(copy.includes('환승 0회'), false);
  assert.equal(copy.includes('도보 0m'), false);
});

test('shows an invalid-destination message without disabling other panel controls', async () => {
  const renderer = await renderPanel({
    selectedPlace: { ...selectedPlace, latitude: null, longitude: '' },
    location: null,
    locationStatus: 'idle',
    routeStatus: 'idle',
    routeData: null,
  });
  const buttons = modeButtons(renderer);

  assert.equal(textContent(renderer.toJSON()).includes('이 장소는 경로를 계산할 수 없어요'), true);
  assert.equal(buttons.length, 3);
  assert.deepEqual(buttons.map((button) => button.props.disabled), [undefined, undefined, undefined]);
});
