import assert from 'node:assert/strict';
import test from 'node:test';

import { OUTPUT, createSceneGeometry, geometryToCssVars } from './geometry.js';

test('creates a centered 3:4 cover plan for portrait and landscape sources', () => {
  assert.deepEqual(OUTPUT, { width: 1080, height: 1440 });
  assert.deepEqual(createSceneGeometry({ sourceWidth: 1920, sourceHeight: 1080, stageWidth: 1080, stageHeight: 1440 }).base,
    { dx: -740, dy: 0, dw: 2560, dh: 1440 });
  assert.deepEqual(createSceneGeometry({ sourceWidth: 900, sourceHeight: 1600, stageWidth: 1080, stageHeight: 1440 }).base,
    { dx: 0, dy: -240, dw: 1080, dh: 1920 });
});

test('uses the same normalized overlay transform for DOM variables and canvas draw plan', () => {
  const plan = createSceneGeometry({
    sourceWidth: 1080,
    sourceHeight: 1440,
    stageWidth: 1080,
    stageHeight: 1440,
    overlay: { x: 0.25, y: -0.1, scale: 1.5, opacity: 0.4, visible: true },
  });
  assert.deepEqual(plan.overlay, { translateX: 270, translateY: -144, scale: 1.5, opacity: 0.4, visible: true });
  assert.deepEqual(geometryToCssVars(plan), {
    '--scene-overlay-x': '25%', '--scene-overlay-y': '-10%', '--scene-overlay-scale': 1.5, '--scene-overlay-opacity': 0.4,
  });
});

test('rejects missing intrinsic dimensions instead of guessing orientation', () => {
  assert.throws(() => createSceneGeometry({ sourceWidth: 0, sourceHeight: 1440, stageWidth: 1080, stageHeight: 1440 }), /dimensions/i);
});
