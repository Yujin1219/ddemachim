import assert from 'node:assert/strict';
import test from 'node:test';

import { createCameraController } from './mediaController.js';

function streamFixture() {
  const listeners = new Map();
  const track = {
    stops: 0,
    stop() { this.stops += 1; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  return { stream: { getTracks: () => [track] }, track, end: () => listeners.get('ended')?.() };
}

test('requests the rear camera synchronously and falls back once only for OverconstrainedError', async () => {
  const calls = [];
  const fixture = streamFixture();
  const mediaDevices = { getUserMedia(constraints) {
    calls.push(constraints);
    if (calls.length === 1) return Promise.reject(Object.assign(new Error('constraint'), { name: 'OverconstrainedError' }));
    return Promise.resolve(fixture.stream);
  } };
  const controller = createCameraController({ mediaDevices });
  const pending = controller.start('42');
  assert.equal(calls.length, 1);
  await pending;
  assert.deepEqual(calls, [
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: true, audio: false },
  ]);
});

test('does not retry permission or device failures', async () => {
  let calls = 0;
  const controller = createCameraController({ mediaDevices: { getUserMedia() { calls += 1; return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); } } });
  await assert.rejects(controller.start('42'), { name: 'NotAllowedError' });
  assert.equal(calls, 1);
});

test('stops stale success streams and current streams on close, ended, and visibility departure', async () => {
  const first = streamFixture();
  const second = streamFixture();
  let resolveFirst;
  const requests = [new Promise((resolve) => { resolveFirst = resolve; }), Promise.resolve(second.stream)];
  let stoppedReason = null;
  const controller = createCameraController({ mediaDevices: { getUserMedia: () => requests.shift() }, onStop: (reason) => { stoppedReason = reason; } });
  const stale = controller.start('1');
  await controller.start('2');
  resolveFirst(first.stream);
  await stale;
  assert.equal(first.track.stops, 1);
  second.end();
  assert.equal(second.track.stops, 1);
  assert.equal(stoppedReason, 'ended');

  const third = streamFixture();
  const next = createCameraController({ mediaDevices: { getUserMedia: () => Promise.resolve(third.stream) } });
  await next.start('3');
  next.handleVisibilityChange(true);
  assert.equal(third.track.stops, 1);
});

test('binds metadata-ready video without mirroring and clears srcObject on stop', async () => {
  const fixture = streamFixture();
  const video = { srcObject: null, videoWidth: 1920, videoHeight: 1080, play: async () => {}, addEventListener() {}, removeEventListener() {} };
  const controller = createCameraController({ mediaDevices: { getUserMedia: () => Promise.resolve(fixture.stream) } });
  await controller.start('42');
  const dimensions = await controller.bindVideo(video);
  assert.deepEqual(dimensions, { width: 1920, height: 1080 });
  assert.equal(video.srcObject, fixture.stream);
  controller.stop('close');
  assert.equal(video.srcObject, null);
});

test('can start after a Strict Mode effect cleanup while stale pre-cleanup success stays stopped', async () => {
  const stale = streamFixture();
  const fresh = streamFixture();
  let resolveStale;
  const requests = [new Promise((resolve) => { resolveStale = resolve; }), Promise.resolve(fresh.stream)];
  const controller = createCameraController({ mediaDevices: { getUserMedia: () => requests.shift() } });
  const first = controller.start('42');
  controller.dispose();
  const second = controller.start('42');
  resolveStale(stale.stream);
  await first;
  assert.equal(stale.track.stops, 1);
  assert.equal(await second, fresh.stream);
  assert.equal(fresh.track.stops, 0);
});

test('stopping while metadata is pending detaches video listeners and settles the bind', async () => {
  const fixture = streamFixture();
  const listeners = new Map();
  const video = {
    srcObject: null,
    videoWidth: 0,
    videoHeight: 0,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    play: async () => {},
  };
  const controller = createCameraController({ mediaDevices: { getUserMedia: () => Promise.resolve(fixture.stream) } });
  await controller.start('42');
  const binding = controller.bindVideo(video);
  assert.equal(listeners.size, 2);
  controller.stop('close');
  await assert.rejects(binding, { name: 'AbortError' });
  assert.equal(listeners.size, 0);
  assert.equal(video.srcObject, null);
});

test('rejects insecure contexts with HTTPS guidance before requesting media', async () => {
  let requests = 0;
  const controller = createCameraController({ isSecureContext: false, mediaDevices: { getUserMedia() { requests += 1; } } });
  await assert.rejects(controller.start('42'), (error) => error.name === 'SecurityError' && /HTTPS/.test(error.message));
  assert.equal(requests, 0);
});

test('metadata timeout stops tracks, clears srcObject, and detaches listeners', async () => {
  const fixture = streamFixture();
  const listeners = new Map();
  const video = { srcObject: null, videoWidth: 0, videoHeight: 0, addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); }, play: async () => {} };
  const controller = createCameraController({ metadataTimeoutMs: 2, mediaDevices: { getUserMedia: () => Promise.resolve(fixture.stream) } });
  await controller.start('42');
  await assert.rejects(controller.bindVideo(video), (error) => error.name === 'TimeoutError');
  assert.equal(fixture.track.stops, 1);
  assert.equal(video.srcObject, null);
  assert.equal(listeners.size, 0);
});

test('play timeout stops tracks and clears the bound video when playback never settles', async () => {
  const fixture = streamFixture();
  const video = { srcObject: null, videoWidth: 1920, videoHeight: 1080, addEventListener() {}, removeEventListener() {}, play: () => new Promise(() => {}) };
  const controller = createCameraController({ metadataTimeoutMs: 2, mediaDevices: { getUserMedia: () => Promise.resolve(fixture.stream) } });
  await controller.start('42');
  await assert.rejects(controller.bindVideo(video), (error) => error.name === 'TimeoutError');
  assert.equal(fixture.track.stops, 1);
  assert.equal(video.srcObject, null);
});

test('a newer bind cancels a pending play wait without stopping the active stream', async () => {
  const fixture = streamFixture();
  const firstVideo = { srcObject: null, videoWidth: 1920, videoHeight: 1080, addEventListener() {}, removeEventListener() {}, play: () => new Promise(() => {}) };
  const secondVideo = { srcObject: null, videoWidth: 1920, videoHeight: 1080, addEventListener() {}, removeEventListener() {}, play: async () => {} };
  const controller = createCameraController({ metadataTimeoutMs: 10, mediaDevices: { getUserMedia: () => Promise.resolve(fixture.stream) } });
  await controller.start('42');
  const staleBinding = controller.bindVideo(firstVideo);
  await Promise.resolve();
  assert.deepEqual(await controller.bindVideo(secondVideo), { width: 1920, height: 1080 });
  await assert.rejects(staleBinding, { name: 'AbortError' });
  assert.equal(controller.getStream(), fixture.stream);
  assert.equal(fixture.track.stops, 0);
  controller.stop('close');
});
