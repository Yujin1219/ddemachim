import assert from 'node:assert/strict';
import test from 'node:test';

import { createSceneSession, sceneCameraReducer } from './sessionReducer.js';

const reference = Object.freeze({ url: '/assets/scenes/42.png', altText: '참고 장면', attribution: '승인됨', width: 1080, height: 1440 });

test('starts a new ID with immutable reference defaults and resets result state', () => {
  const captured = { blob: {}, objectUrl: 'blob:old', width: 1080, height: 1440 };
  const previous = { ...createSceneSession(), filmingLocationId: '1', captured, comparison: 17, exportMode: 'overlay' };
  const next = sceneCameraReducer(previous, { type: 'BEGIN_SCENE', id: '42', reference });
  assert.equal(next.filmingLocationId, '42');
  assert.deepEqual(next.reference, reference);
  assert.notEqual(next.reference, reference);
  assert.deepEqual(next.overlay, { x: 0, y: 0, scale: 1, opacity: 0.45, visible: true, mode: 'image' });
  assert.equal(next.captured, null);
  assert.equal(next.comparison, 50);
  assert.equal(next.exportMode, 'split');
});

test('camera-specific framing is applied on entry and restored by reset', () => {
  const shiftedReference = Object.freeze({
    ...reference,
    defaultOverlay: { x: -0.08, y: 0, scale: 1 },
  });
  let state = sceneCameraReducer(createSceneSession(), {
    type: 'BEGIN_SCENE',
    id: '78',
    reference: shiftedReference,
  });

  assert.deepEqual(state.overlay, { x: -0.08, y: 0, scale: 1, opacity: 0.45, visible: true, mode: 'image' });

  state = sceneCameraReducer(state, { type: 'SET_OVERLAY', patch: { x: 0.3, scale: 1.4 } });
  state = sceneCameraReducer(state, { type: 'RESET_OVERLAY' });
  assert.deepEqual(state.overlay, { x: -0.08, y: 0, scale: 1, opacity: 0.45, visible: true, mode: 'image' });
});

test('clamps overlay and comparison controls to their canonical limits', () => {
  let state = createSceneSession();
  state = sceneCameraReducer(state, { type: 'SET_OVERLAY', patch: { x: 9, y: -9, scale: 5, opacity: 0, visible: false } });
  assert.deepEqual(state.overlay, { x: 0.5, y: -0.5, scale: 2, opacity: 0.1, visible: false, mode: 'image' });
  state = sceneCameraReducer(state, { type: 'SET_COMPARISON', value: 120.2 });
  assert.equal(state.comparison, 100);
});

test('starts every newly captured result at an even comparison position', () => {
  const previous = { ...createSceneSession(), comparison: 82 };
  const next = sceneCameraReducer(previous, { type: 'CAPTURED', captured: { blob: {}, objectUrl: 'blob:capture', width: 1080, height: 1440 } });
  assert.equal(next.comparison, 50);
});

test('same-ID retake preserves reference and framing while clearing capture', () => {
  const state = {
    ...createSceneSession(),
    filmingLocationId: '42',
    reference,
    overlay: { x: 0.2, y: -0.1, scale: 1.3, opacity: 0.6, visible: false },
    captured: { blob: {}, objectUrl: 'blob:capture', width: 100, height: 200 },
  };
  const next = sceneCameraReducer(state, { type: 'RETAKE', id: '42' });
  assert.equal(next.reference, reference);
  assert.deepEqual(next.overlay, state.overlay);
  assert.equal(next.captured, null);
});

test('ignores stale token actions', () => {
  const state = { ...createSceneSession(), token: 8, flowState: 'preparing' };
  const next = sceneCameraReducer(state, { type: 'CAMERA_READY', token: 7 });
  assert.equal(next, state);
});
