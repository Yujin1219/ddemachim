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
  assert.deepEqual(buttons.map((button) => textContent(button)), ['도보', '대중교통', '택시']);
  assert.deepEqual(buttons.map((button) => button.props['aria-pressed']), [true, false, false]);
  assert.equal(renderer.root.findAll((node) => node.props['aria-live'] === 'polite').length > 0, true);
});

test('shows location and route state copy with a retry action', async () => {
  const locating = await renderPanel({ locationStatus: 'locating', routeStatus: 'idle' });
  assert.equal(textContent(locating.toJSON()).includes('현재 위치 확인 중…'), true);

  const denied = await renderPanel({ locationStatus: 'error', locationErrorCode: 'DENIED', routeStatus: 'idle' });
  assert.equal(textContent(denied.toJSON()).includes('현재 위치를 확인하지 못했어요'), true);
  assert.equal(denied.root.findAll((node) => node.type === 'button' && textContent(node) === '다시 시도').length, 1);

  const loading = await renderPanel({ locationStatus: 'ready', routeStatus: 'loading' });
  assert.equal(textContent(loading.toJSON()).includes('경로 계산 중…'), true);

  const nearby = await renderPanel({ location: destination, routeStatus: 'idle', routeData: null });
  assert.equal(textContent(nearby.toJSON()).includes('이미 목적지 근처예요'), true);
});

test('keeps available tabs usable when transit is unavailable', async () => {
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

  assert.equal(textContent(renderer.toJSON()).includes('대중교통 경로 없음'), true);
  assert.deepEqual(modeButtons(renderer).map((button) => button.props['aria-pressed']), [false, true, false]);
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
