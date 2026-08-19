import assert from 'node:assert/strict';
import test from 'node:test';

import { createSceneNavigationTarget, resultGuardDestination, sceneRouteMotion, startCameraGesture } from './flow.js';

test('invokes getUserMedia controller start before state work and hash navigation in the click stack', () => {
  const order = [];
  const pending = Promise.resolve();
  const result = startCameraGesture({
    id: '42',
    isReferenceReady: true,
    controller: { start: () => { order.push('getUserMedia'); return pending; } },
    onStarting: () => order.push('state'),
    navigate: () => order.push('navigate'),
  });
  assert.equal(result, pending);
  assert.deepEqual(order, ['getUserMedia', 'state', 'navigate']);
});

test('does not request camera or navigate with invalid ID or unready reference', () => {
  let calls = 0;
  const dependencies = { controller: { start: () => { calls += 1; } }, onStarting() {}, navigate() {} };
  assert.equal(startCameraGesture({ ...dependencies, id: null, isReferenceReady: true }), null);
  assert.equal(startCameraGesture({ ...dependencies, id: '42', isReferenceReady: false }), null);
  assert.equal(calls, 0);
});

test('direct result access replaces to same-ID detail without creating a back loop', () => {
  assert.deepEqual(resultGuardDestination({ id: '42', captured: null }), { screen: 'scene-detail', id: '42', replace: true, notice: 'capture-missing' });
  assert.equal(resultGuardDestination({ id: '42', captured: {} }), null);
  assert.deepEqual(resultGuardDestination({ id: null, captured: null }), { screen: 'map', id: null, replace: true, notice: 'invalid-scene' });
});

test('scene navigation targets reject invalid IDs and preserve canonical hashes', () => {
  assert.deepEqual(createSceneNavigationTarget('camera', '0042'), { screen: 'camera', id: '42', hash: '#/camera/42' });
  assert.equal(createSceneNavigationTarget('shot-result', 'bad'), null);
  assert.equal(createSceneNavigationTarget('map', '42'), null);
});

test('camera routes use fade-only motion and reduced motion is immediate', () => {
  assert.deepEqual(sceneRouteMotion('camera', false), { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.16, ease: 'easeOut' } });
  assert.deepEqual(sceneRouteMotion('shot-result', true), { initial: false, animate: { opacity: 1 }, transition: { duration: 0 } });
});
