import assert from 'node:assert/strict';
import test from 'node:test';

import { createOverlayGesture } from './gesture.js';

test('second pointer establishes a pinch baseline and later movement scales from it', () => {
  const patches = [];
  const gesture = createOverlayGesture({
    getOverlay: () => ({ x: 0, y: 0, scale: 1, opacity: 0.5, visible: true }),
    getBounds: () => ({ width: 300, height: 400 }),
    onPatch: (patch) => patches.push(patch),
  });
  gesture.pointerDown({ pointerId: 1, clientX: 100, clientY: 100 });
  gesture.pointerDown({ pointerId: 2, clientX: 200, clientY: 100 });
  gesture.pointerMove({ pointerId: 2, clientX: 250, clientY: 100 });
  assert.deepEqual(patches.at(-1), { scale: 1.5 });
});

test('one pointer drag uses stage-normalized offsets and pointer-up resets the baseline', () => {
  const patches = [];
  const gesture = createOverlayGesture({ getOverlay: () => ({ x: 0.1, y: -0.1, scale: 1 }), getBounds: () => ({ width: 200, height: 400 }), onPatch: (patch) => patches.push(patch) });
  gesture.pointerDown({ pointerId: 7, clientX: 20, clientY: 40 });
  gesture.pointerMove({ pointerId: 7, clientX: 40, clientY: 80 });
  assert.deepEqual(patches.at(-1), { x: 0.2, y: 0 });
  gesture.pointerUp({ pointerId: 7 });
  assert.equal(gesture.pointerMove({ pointerId: 7, clientX: 80, clientY: 80 }), null);
});
