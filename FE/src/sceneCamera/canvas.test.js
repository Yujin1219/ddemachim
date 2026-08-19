import assert from 'node:assert/strict';
import test from 'node:test';

import { captureVideoFrame, exportScenePng } from './canvas.js';

function canvasFixture({ blob = { type: 'image/png' }, throws = false } = {}) {
  const calls = [];
  const context = new Proxy({ globalAlpha: 1 }, {
    set(target, key, value) { calls.push([`set:${String(key)}`, value]); target[key] = value; return true; },
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([String(key), ...args]);
    },
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback, type) { if (throws) throw new Error('encode'); calls.push(['toBlob', type]); callback(blob); },
  };
  return { canvas, calls };
}

test('captures the current decoded video frame into a 1080x1440 cover crop', async () => {
  const fixture = canvasFixture();
  const video = { videoWidth: 1920, videoHeight: 1080 };
  const result = await captureVideoFrame(video, { createCanvas: () => fixture.canvas });
  assert.equal(result.blob.type, 'image/png');
  assert.deepEqual({ width: fixture.canvas.width, height: fixture.canvas.height }, { width: 1080, height: 1440 });
  assert.deepEqual(fixture.calls.find(([name]) => name === 'drawImage'), ['drawImage', video, -740, 0, 2560, 1440]);
});

test('treats null or thrown toBlob encoding as recoverable capture failure', async () => {
  await assert.rejects(captureVideoFrame({ videoWidth: 1, videoHeight: 1 }, { createCanvas: () => canvasFixture({ blob: null }).canvas }), /encode/i);
  await assert.rejects(captureVideoFrame({ videoWidth: 1, videoHeight: 1 }, { createCanvas: () => canvasFixture({ throws: true }).canvas }), /encode/i);
});

test('split export always clips reference left and capture right at exact 540px regardless of comparison', async () => {
  const fixture = canvasFixture();
  const reference = { naturalWidth: 1080, naturalHeight: 1440 };
  const capture = { naturalWidth: 1080, naturalHeight: 1440 };
  await exportScenePng({ mode: 'split', reference, capture, comparison: 83 }, { createCanvas: () => fixture.canvas });
  const meaningful = fixture.calls.filter(([name]) => ['save', 'beginPath', 'rect', 'clip', 'drawImage', 'restore'].includes(name));
  assert.deepEqual(meaningful, [
    ['save'], ['beginPath'], ['rect', 0, 0, 540, 1440], ['clip'], ['drawImage', reference, 0, 0, 1080, 1440], ['restore'],
    ['save'], ['beginPath'], ['rect', 540, 0, 540, 1440], ['clip'], ['drawImage', capture, 0, 0, 1080, 1440], ['restore'],
  ]);
});

test('overlay export draws capture first then transformed reference and no UI chrome', async () => {
  const fixture = canvasFixture();
  const reference = { naturalWidth: 1080, naturalHeight: 1440 };
  const capture = { naturalWidth: 1080, naturalHeight: 1440 };
  await exportScenePng({ mode: 'overlay', reference, capture, overlay: { x: 0.1, y: -0.2, scale: 1.5, opacity: 0.4, visible: true } }, { createCanvas: () => fixture.canvas });
  const draws = fixture.calls.filter(([name]) => name === 'drawImage');
  assert.equal(draws[0][1], capture);
  assert.equal(draws[1][1], reference);
  assert.deepEqual(fixture.calls.find(([name]) => name === 'translate'), ['translate', 648, 432]);
  assert.deepEqual(fixture.calls.find(([name]) => name === 'scale'), ['scale', 1.5, 1.5]);
});

test('trusted 90-degree rotation normalizes decoded pixels without consulting screen orientation', async () => {
  const fixture = canvasFixture();
  const video = { videoWidth: 1920, videoHeight: 1080 };
  await captureVideoFrame(video, { createCanvas: () => fixture.canvas, rotation: 90 });
  assert.deepEqual(fixture.calls.find(([name]) => name === 'translate'), ['translate', 540, 720]);
  assert.deepEqual(fixture.calls.find(([name]) => name === 'rotate'), ['rotate', Math.PI / 2]);
  assert.deepEqual(fixture.calls.find(([name]) => name === 'drawImage'), ['drawImage', video, -960, -540, 1920, 1080]);
});

test('trusted 180- and 270-degree rotations preserve 1080x1440 output with exact transforms', async () => {
  const video = { videoWidth: 1920, videoHeight: 1080 };
  for (const [rotation, radians, draw] of [
    [180, Math.PI, ['drawImage', video, -1280, -720, 2560, 1440]],
    [270, Math.PI * 1.5, ['drawImage', video, -960, -540, 1920, 1080]],
  ]) {
    const fixture = canvasFixture();
    const result = await captureVideoFrame(video, { createCanvas: () => fixture.canvas, rotation });
    assert.deepEqual({ width: result.width, height: result.height }, { width: 1080, height: 1440 });
    assert.deepEqual(fixture.calls.find(([name]) => name === 'translate'), ['translate', 540, 720]);
    assert.deepEqual(fixture.calls.find(([name]) => name === 'rotate'), ['rotate', radians]);
    assert.deepEqual(fixture.calls.find(([name]) => name === 'drawImage'), draw);
  }
});

test('orientation normalization accepts only trusted quarter turns', async () => {
  await assert.rejects(captureVideoFrame({ videoWidth: 10, videoHeight: 20 }, { createCanvas: () => canvasFixture().canvas, rotation: 45 }), /rotation/i);
});
