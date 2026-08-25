import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import VWorldMapRegion from './VWorldMapRegion.js';

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalConsoleError = console.error;
const unexpectedConsoleErrors = [];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
console.error = (...args) => {
  const message = args.map((value) => String(value)).join(' ');
  if (!message.includes('react-test-renderer is deprecated')) unexpectedConsoleErrors.push(message);
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

async function renderRegion(props = {}) {
  let renderer;
  await act(async () => {
    renderer = create(createElement(VWorldMapRegion, {
      ariaLabel: '종로구 혼잡도 지도',
      interactive: true,
      showCongestionAreas: true,
      onKeyDown: () => {},
      ...props,
    }, createElement('div', { className: 'map-canvas' })));
  });
  return renderer;
}

test('mounts an interactive crowding map region with a keyboard-selectable center grid', async () => {
  const renderer = await renderRegion();
  const region = renderer.root.find((node) => node.type === 'div' && node.props.role === 'region');

  assert.equal(region.props.role, 'region');
  assert.equal(region.props.tabIndex, 0);
  assert.equal(region.props['aria-keyshortcuts'], 'Enter Space');
  assert.equal(
    region.props['aria-description'],
    'Enter 키로 지도 중심의 혼잡도를 확인할 수 있습니다.',
  );
  assert.equal(typeof region.props.onKeyDown, 'function');

  await act(async () => renderer.unmount());
});

test('does not advertise grid keyboard selection when the crowding layer is hidden', async () => {
  const renderer = await renderRegion({ showCongestionAreas: false });
  const region = renderer.root.find((node) => node.type === 'div' && node.props.role === 'region');

  assert.equal(region.props.tabIndex, undefined);
  assert.equal(region.props['aria-keyshortcuts'], undefined);
  assert.equal(region.props['aria-description'], undefined);

  await act(async () => renderer.unmount());
});

test('navigation location control exposes whether follow camera is active', async () => {
  const { NavigationLocationButton } = await import('./VWorldMapRegion.js');
  assert.equal(typeof NavigationLocationButton, 'function');
  let clicks = 0;
  let renderer;
  await act(async () => {
    renderer = create(createElement(NavigationLocationButton, {
      following: false,
      onClick: () => { clicks += 1; },
    }));
  });

  const button = renderer.root.findByType('button');
  assert.equal(button.props['aria-label'], '현재 위치로 돌아가서 자동 추적 시작');
  assert.equal(button.props['aria-pressed'], false);
  await act(async () => button.props.onClick());
  assert.equal(clicks, 1);
  await act(async () => renderer.unmount());
});
