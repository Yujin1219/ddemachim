import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';

import { BROWSER_DECODED_VIDEO_ROTATION, SceneCameraProvider, useSceneCamera } from './SceneCameraSession.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('provider captures browser-decoded presentation-upright video with intentional zero rotation', async () => {
  const track = { stop() {}, addEventListener() {}, removeEventListener() {} };
  const stream = { getTracks: () => [track] };
  const target = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const reference = { url: '/assets/scenes/42.png', altText: '승인 참고', attribution: '권리 승인', width: 1080, height: 1440 };
  let api;
  let receivedOptions;
  const Probe = () => { api = useSceneCamera(); return null; };
  let renderer;
  act(() => {
    renderer = create(React.createElement(SceneCameraProvider, {
      screen: 'camera',
      routeId: '42',
      referenceMap: { 42: reference },
      preflight: async (metadata) => ({ metadata, image: { naturalWidth: 1080, naturalHeight: 1440 } }),
      mediaDevices: { getUserMedia: () => Promise.resolve(stream) },
      captureFrame: async (_video, options) => { receivedOptions = options; return { blob: {}, width: 1080, height: 1440 }; },
      objectUrlApi: { createObjectURL: () => 'blob:capture', revokeObjectURL() {} },
      windowTarget: target,
      documentTarget: target,
    }, React.createElement(Probe)));
  });
  await act(async () => { await api.prepareReference('42'); await api.startCamera('42', () => {}); await api.capture(); });
  assert.equal(BROWSER_DECODED_VIDEO_ROTATION, 0);
  assert.deepEqual(receivedOptions, { rotation: BROWSER_DECODED_VIDEO_ROTATION });
  act(() => renderer.unmount());
});
