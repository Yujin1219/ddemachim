import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';

import { SceneCameraProvider, SceneCameraVideo, shouldResetSceneSession, useSceneCamera } from './SceneCameraSession.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reference = { url: '/assets/scenes/42.png', altText: '승인 참고', attribution: '권리 승인', width: 1080, height: 1440 };

function eventTarget() {
  const listeners = new Map();
  return {
    hidden: false,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    emit(type) { listeners.get(type)?.(); },
  };
}

function streamFixture() {
  const listeners = new Map();
  const track = { stops: 0, stop() { this.stops += 1; }, addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  return { stream: { getTracks: () => [track] }, track, end: () => listeners.get('ended')?.() };
}

function mountedSession({ requests, captureFrame, objectUrlApi } = {}) {
  let api;
  let video;
  const windowTarget = eventTarget();
  const documentTarget = eventTarget();
  const Probe = () => { api = useSceneCamera(); return null; };
  const props = {
    routeId: '42',
    referenceMap: { 42: reference, 43: { ...reference, url: '/assets/scenes/43.png' } },
    preflight: async (metadata) => ({ metadata, image: { naturalWidth: 1080, naturalHeight: 1440 } }),
    mediaDevices: { getUserMedia: () => requests.shift() },
    captureFrame,
    objectUrlApi,
    windowTarget,
    documentTarget,
  };
  const render = (screen, id = '42', withVideo = screen === 'camera') => React.createElement(SceneCameraProvider, { ...props, screen, routeId: id }, React.createElement(React.Fragment, null, React.createElement(Probe), withVideo ? React.createElement(SceneCameraVideo, { className: 'test-video' }) : null));
  let renderer;
  act(() => { renderer = create(render('scene-detail'), { createNodeMock(element) { if (element.type === 'video') { video = { srcObject: null, videoWidth: 1920, videoHeight: 1080, playCalls: 0, play() { this.playCalls += 1; return Promise.resolve(); }, addEventListener() {}, removeEventListener() {} }; return video; } return null; } }); });
  return { get api() { return api; }, get video() { return video; }, renderer, render, windowTarget, documentTarget };
}

test('route transitions preserve the same-ID capture flow and retake loop only', () => {
  assert.equal(shouldResetSceneSession({ screen: 'scene-detail', id: '42' }, { screen: 'camera', id: '42' }), false);
  assert.equal(shouldResetSceneSession({ screen: 'camera', id: '42' }, { screen: 'shot-result', id: '42' }), false);
  assert.equal(shouldResetSceneSession({ screen: 'shot-result', id: '42' }, { screen: 'camera', id: '42' }), false);
  assert.equal(shouldResetSceneSession({ screen: 'shot-result', id: '42' }, { screen: 'scene-detail', id: '42' }), true);
  assert.equal(shouldResetSceneSession({ screen: 'camera', id: '42' }, { screen: 'camera', id: '43' }), true);
});

test('mounted same-ID retake survives the result-to-camera route update and rebinds video', async () => {
  const first = streamFixture();
  const second = streamFixture();
  const revoked = [];
  const session = mountedSession({
    requests: [first, second].map(({ stream }) => Promise.resolve(stream)),
    captureFrame: async () => ({ blob: {}, width: 1080, height: 1440 }),
    objectUrlApi: { createObjectURL: () => 'blob:first-capture', revokeObjectURL: (url) => revoked.push(url) },
  });
  await act(async () => { await session.api.prepareReference('42'); });
  act(() => { session.api.dispatch({ type: 'SET_OVERLAY', patch: { x: 0.2, scale: 1.4 } }); session.renderer.update(session.render('camera')); });
  await act(async () => { await session.api.startCamera('42', () => {}); });
  await act(async () => { await session.api.capture(); });
  act(() => session.renderer.update(session.render('shot-result', '42', false)));
  const referenceBeforeRetake = session.api.state.reference;

  await act(async () => {
    await session.api.retake('42', (screen, id) => session.renderer.update(session.render(screen, id)));
  });

  assert.equal(session.api.state.reference, referenceBeforeRetake);
  assert.deepEqual(session.api.state.overlay, { x: 0.2, y: 0, scale: 1.4, opacity: 0.45, visible: true, mode: 'image' });
  assert.equal(session.api.state.captured, null);
  assert.equal(session.api.state.flowState, 'camera-ready');
  assert.equal(session.video.srcObject, second.stream);
  assert.deepEqual(revoked, ['blob:first-capture']);
  act(() => session.renderer.unmount());
});

test('mounted retry rebinds the existing video after denial and pagehide interruption', async () => {
  const first = Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  first.catch(() => {});
  const second = streamFixture();
  const third = streamFixture();
  const session = mountedSession({ requests: [first, Promise.resolve(second.stream), Promise.resolve(third.stream)] });
  await act(async () => { await session.api.prepareReference('42'); });
  await act(async () => { await assert.rejects(session.api.startCamera('42', () => {}), { name: 'NotAllowedError' }); });
  act(() => { session.renderer.update(session.render('camera')); });
  await act(async () => { await session.api.startCamera('42', () => {}); });
  assert.equal(session.video.srcObject, second.stream);
  assert.equal(session.video.playCalls, 1);
  await act(async () => { session.windowTarget.emit('pagehide'); });
  assert.equal(second.track.stops, 1);
  assert.equal(session.video.srcObject, null);
  await act(async () => { await session.api.startCamera('42', () => {}); });
  assert.equal(session.video.srcObject, third.stream);
  assert.equal(session.video.playCalls, 2);
  act(() => session.renderer.unmount());
});

test('mounted session recovers from ended and hidden streams by binding each replacement', async () => {
  const first = streamFixture();
  const second = streamFixture();
  const third = streamFixture();
  const session = mountedSession({ requests: [first, second, third].map(({ stream }) => Promise.resolve(stream)) });
  await act(async () => { await session.api.prepareReference('42'); });
  act(() => { session.renderer.update(session.render('camera')); });
  await act(async () => { await session.api.startCamera('42', () => {}); });
  act(() => first.end());
  assert.equal(first.track.stops, 1);
  assert.equal(session.video.srcObject, null);
  await act(async () => { await session.api.startCamera('42', () => {}); });
  assert.equal(session.video.srcObject, second.stream);
  session.documentTarget.hidden = true;
  act(() => session.documentTarget.emit('visibilitychange'));
  assert.equal(second.track.stops, 1);
  session.documentTarget.hidden = false;
  await act(async () => { await session.api.startCamera('42', () => {}); });
  assert.equal(session.video.srcObject, third.stream);
  assert.equal(session.video.playCalls, 3);
  act(() => session.renderer.unmount());
});

test('capture failure keeps recovery available and a retry rebinds a fresh stream', async () => {
  const first = streamFixture();
  const second = streamFixture();
  const session = mountedSession({ requests: [first, second].map(({ stream }) => Promise.resolve(stream)), captureFrame: async () => { throw new Error('canvas failed'); } });
  await act(async () => { await session.api.prepareReference('42'); });
  act(() => { session.renderer.update(session.render('camera')); });
  await act(async () => { await session.api.startCamera('42', () => {}); });
  await act(async () => { assert.equal(await session.api.capture(), null); });
  assert.equal(session.api.state.error.code, 'capture-failed');
  await act(async () => { await session.api.startCamera('42', () => {}); });
  assert.equal(first.track.stops, 1);
  assert.equal(session.video.srcObject, second.stream);
  act(() => session.renderer.unmount());
});

test('camera entry focus restoration is consumed once after close or back recovery', async () => {
  const fixture = streamFixture();
  const session = mountedSession({ requests: [Promise.resolve(fixture.stream)] });
  await act(async () => { await session.api.prepareReference('42'); });
  await act(async () => { await session.api.startCamera('42', () => {}); });
  act(() => session.api.close());
  assert.equal(session.api.consumeCameraEntryFocus(), true);
  assert.equal(session.api.consumeCameraEntryFocus(), false);
  act(() => session.renderer.unmount());
});

test('route departure invalidates a pending capture and never creates a stale object URL', async () => {
  const fixture = streamFixture();
  let resolveCapture;
  const captureFrame = () => new Promise((resolve) => { resolveCapture = resolve; });
  const created = [];
  const session = mountedSession({ requests: [Promise.resolve(fixture.stream)], captureFrame, objectUrlApi: { createObjectURL(blob) { created.push(blob); return 'blob:stale'; }, revokeObjectURL() {} } });
  await act(async () => { await session.api.prepareReference('42'); });
  act(() => { session.renderer.update(session.render('camera')); });
  await act(async () => { await session.api.startCamera('42', () => {}); });
  let pending;
  act(() => { pending = session.api.capture(); });
  await act(async () => { session.renderer.update(session.render('map', null, false)); });
  await act(async () => { resolveCapture({ blob: { type: 'image/png' }, width: 1080, height: 1440 }); assert.equal(await pending, null); });
  assert.deepEqual(created, []);
  assert.equal(session.api.state.captured, null);
  act(() => session.renderer.unmount());
});

test('mounted capture URLs are revoked on retake, new ID, close, and unmount', async () => {
  const streams = Array.from({ length: 4 }, streamFixture);
  const revoked = [];
  let nextUrl = 0;
  const session = mountedSession({ requests: streams.map(({ stream }) => Promise.resolve(stream)), captureFrame: async () => ({ blob: {}, width: 1080, height: 1440 }), objectUrlApi: { createObjectURL: () => `blob:${++nextUrl}`, revokeObjectURL: (url) => revoked.push(url) } });
  await act(async () => { await session.api.prepareReference('42'); });
  await act(async () => { await session.api.startCamera('42', () => {}); });
  await act(async () => { await session.api.capture(); });
  await act(async () => { await session.api.retake('42', () => {}); });
  assert.deepEqual(revoked, ['blob:1']);
  await act(async () => { await session.api.capture(); });
  await act(async () => { await session.api.prepareReference('43', { force: true }); });
  assert.deepEqual(revoked, ['blob:1', 'blob:2']);
  await act(async () => { await session.api.startCamera('43', () => {}); await session.api.capture(); });
  act(() => session.api.close());
  assert.deepEqual(revoked, ['blob:1', 'blob:2', 'blob:3']);
  await act(async () => { await session.api.prepareReference('42', { force: true }); await session.api.startCamera('42', () => {}); await session.api.capture(); });
  act(() => session.renderer.unmount());
  assert.deepEqual(revoked, ['blob:1', 'blob:2', 'blob:3', 'blob:4']);
});

test('StrictMode replaces an invalidated reference preflight and dedupes after it becomes ready', async () => {
  const pendingPreflights = [];
  let api;
  let renderer;
  const target = eventTarget();
  const preflight = (metadata) => new Promise((resolve) => {
    pendingPreflights.push({ metadata, resolve });
  });
  const AutoPrepareProbe = () => {
    api = useSceneCamera();
    React.useEffect(() => {
      if (api.referenceStatus === 'idle') void api.prepareReference('42');
    }, [api.prepareReference, api.referenceStatus]);
    return null;
  };

  await act(async () => {
    renderer = create(React.createElement(React.StrictMode, null,
      React.createElement(SceneCameraProvider, {
        screen: 'scene-detail',
        routeId: '42',
        referenceMap: { 42: reference },
        preflight,
        windowTarget: target,
        documentTarget: target,
      }, React.createElement(AutoPrepareProbe))));
  });

  assert.equal(pendingPreflights.length, 2);
  assert.equal(api.referenceStatus, 'checking');
  await act(async () => {
    pendingPreflights[0].resolve({ metadata: pendingPreflights[0].metadata, image: { naturalWidth: 1080, naturalHeight: 1440 } });
  });
  assert.equal(api.referenceStatus, 'checking');
  assert.equal(api.state.flowState, 'preparing');
  await act(async () => {
    pendingPreflights[1].resolve({ metadata: pendingPreflights[1].metadata, image: { naturalWidth: 1080, naturalHeight: 1440 } });
  });
  assert.equal(api.referenceStatus, 'ready');
  assert.equal(api.state.flowState, 'idle');
  assert.equal(api.state.error, null);

  await act(async () => {
    assert.deepEqual(await api.prepareReference('42'), { status: 'ready' });
  });
  assert.equal(pendingPreflights.length, 2);
  act(() => renderer.unmount());
});

test('StrictMode video binding keeps only the current metadata listeners and detaches them on unmount', async () => {
  const fixture = streamFixture();
  const listeners = new Map();
  const listenerCount = () => [...listeners.values()].reduce((total, values) => total + values.size, 0);
  let api;
  const target = eventTarget();
  const Probe = () => { api = useSceneCamera(); return null; };
  const render = (screen, withVideo) => React.createElement(SceneCameraProvider, {
    screen,
    routeId: '42',
    referenceMap: { 42: reference },
    preflight: async (metadata) => ({ metadata, image: { naturalWidth: 1080, naturalHeight: 1440 } }),
    mediaDevices: { getUserMedia: () => Promise.resolve(fixture.stream) },
    cameraOptions: { metadataTimeoutMs: 50 },
    windowTarget: target,
    documentTarget: target,
  }, React.createElement(React.Fragment, null,
    React.createElement(Probe),
    withVideo ? React.createElement(React.StrictMode, null, React.createElement(SceneCameraVideo)) : null));
  const video = {
    srcObject: null,
    videoWidth: 0,
    videoHeight: 0,
    play: async () => {},
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  let renderer;
  act(() => { renderer = create(render('scene-detail', false), { createNodeMock(element) { return element.type === 'video' ? video : null; } }); });
  await act(async () => { await api.prepareReference('42'); await api.startCamera('42', () => {}); });
  await act(async () => renderer.update(render('camera', true)));
  const listenersAfterStrictMount = listenerCount();
  act(() => renderer.unmount());
  const listenersAfterUnmount = listenerCount();

  assert.equal(listenersAfterStrictMount, 2);
  assert.equal(listenersAfterUnmount, 0);
  assert.equal(fixture.track.stops, 1);
});

test('StrictMode stale play timeout cannot overwrite the newer camera-ready state', async () => {
  const fixture = streamFixture();
  let api;
  let playCalls = 0;
  const target = eventTarget();
  const Probe = () => { api = useSceneCamera(); return null; };
  const render = (screen, withVideo) => React.createElement(SceneCameraProvider, {
    screen,
    routeId: '42',
    referenceMap: { 42: reference },
    preflight: async (metadata) => ({ metadata, image: { naturalWidth: 1080, naturalHeight: 1440 } }),
    mediaDevices: { getUserMedia: () => Promise.resolve(fixture.stream) },
    cameraOptions: { metadataTimeoutMs: 10 },
    windowTarget: target,
    documentTarget: target,
  }, React.createElement(React.Fragment, null,
    React.createElement(Probe),
    withVideo ? React.createElement(React.StrictMode, null, React.createElement(SceneCameraVideo)) : null));
  const video = {
    srcObject: null,
    videoWidth: 1920,
    videoHeight: 1080,
    addEventListener() {},
    removeEventListener() {},
    play() { playCalls += 1; return playCalls === 1 ? new Promise(() => {}) : Promise.resolve(); },
  };
  let renderer;
  act(() => { renderer = create(render('scene-detail', false), { createNodeMock(element) { return element.type === 'video' ? video : null; } }); });
  await act(async () => { await api.prepareReference('42'); await api.startCamera('42', () => {}); });
  await act(async () => renderer.update(render('camera', true)));
  assert.equal(api.state.flowState, 'camera-ready');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  assert.equal(api.state.flowState, 'camera-ready');
  assert.equal(api.state.error, null);
  assert.equal(fixture.track.stops, 0);
  act(() => renderer.unmount());
});

test('entering scene detail from map completes the reference check', async () => {
  let api;
  const target = eventTarget();
  const preflight = async (metadata) => ({ metadata, image: {} });
  const AutoPrepare = () => {
    api = useSceneCamera();
    React.useEffect(() => {
      if (api.referenceStatus === 'idle') void api.prepareReference('42');
    }, [api.prepareReference, api.referenceStatus]);
    return null;
  };
  const props = { referenceMap: { 42: reference }, preflight, windowTarget: target, documentTarget: target };
  const render = (screen) => React.createElement(SceneCameraProvider,
    { ...props, screen, routeId: screen === 'scene-detail' ? '42' : null },
    screen === 'scene-detail' ? React.createElement(AutoPrepare) : null);
  let renderer;
  try {
    await act(async () => { renderer = create(render('map')); });
    await act(async () => { renderer.update(render('scene-detail')); });
    assert.equal(api.referenceStatus, 'ready');
  } finally {
    await act(async () => renderer.unmount());
  }
});
