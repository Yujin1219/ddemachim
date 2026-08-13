import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import SelectedPlaceRoutePanel from './SelectedPlaceRoutePanel.js';

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
    ['도보14분', '대중교통경로 없음', '택시이용 불가'],
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

test('distinguishes no-route detail copy while keeping available tabs usable', async () => {
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

  assert.equal(textContent(renderer.toJSON()).includes('대중교통 경로를 찾지 못했어요.'), true);
  assert.deepEqual(modeButtons(renderer).map((button) => button.props['aria-pressed']), [false, true, false]);
});

test('shows a retry for temporary provider failure without hiding successful modes', async () => {
  let retryCount = 0;
  const renderer = await renderPanel({
    activeMode: 'TRANSIT',
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

  assert.equal(copy.includes('대중교통 정보를 잠시 불러오지 못했어요.'), true);
  assert.equal(textContent(modeButtons(renderer)[0]), '도보14분');
  assert.equal(textContent(modeButtons(renderer)[2]), '택시일시 오류');
  await act(async () => retry.props.onClick());
  assert.equal(retryCount, 1);
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
