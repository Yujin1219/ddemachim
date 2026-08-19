import assert from 'node:assert/strict';
import test from 'node:test';

import { captureVideoFrame, exportScenePng } from './canvas.js';
import { createSceneNavigationTarget, startCameraGesture } from './flow.js';
import { createCameraController } from './mediaController.js';
import { createObjectUrlOwner } from './objectUrlOwner.js';
import { normalizeReferenceStill, preflightReference } from './reference.js';
import { attemptFileShare } from './share.js';

function outputCanvas(blob) {
  return {
    getContext: () => ({ drawImage() {}, save() {}, beginPath() {}, rect() {}, clip() {}, restore() {} }),
    toBlob: (callback) => callback(blob),
  };
}

test('injected approved same-origin fixture completes reference, camera, capture, split export, and share with one ID', async () => {
  const id = '42';
  const metadata = normalizeReferenceStill({ url: '/assets/scenes/test-42.png', altText: '승인된 참고 구도', attribution: '테스트 권리 제공자', width: 1080, height: 1440 }, { origin: 'https://camera.test' });
  const referenceImage = {
    naturalWidth: 1080,
    naturalHeight: 1440,
    decode: async () => {},
    set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); },
  };
  const preflight = await preflightReference(metadata, {
    createImage: () => referenceImage,
    createCanvas: () => ({ getContext: () => ({ drawImage() {}, getImageData() { return { data: [0, 0, 0, 0] }; } }) }),
  });
  assert.equal(preflight.metadata, metadata);

  const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {}, removeEventListener() {} };
  const stream = { getTracks: () => [track] };
  const controller = createCameraController({ mediaDevices: { getUserMedia: () => Promise.resolve(stream) } });
  let cameraRoute;
  const acquisition = startCameraGesture({
    id,
    isReferenceReady: true,
    controller,
    onStarting() {},
    navigate: (screen, routeId) => { cameraRoute = createSceneNavigationTarget(screen, routeId); },
  });
  assert.equal(cameraRoute.hash, '#/camera/42');
  await acquisition;
  const video = { srcObject: null, videoWidth: 1920, videoHeight: 1080, play: async () => {}, addEventListener() {}, removeEventListener() {} };
  await controller.bindVideo(video);

  const captureBlob = { type: 'image/png', name: 'capture' };
  const captured = await captureVideoFrame(video, { createCanvas: () => outputCanvas(captureBlob) });
  controller.stop('capture');
  assert.equal(track.stopped, true);
  const owner = createObjectUrlOwner({ createObjectURL: () => 'blob:capture-42', revokeObjectURL() {} });
  assert.equal(owner.replace(captured.blob), 'blob:capture-42');

  const exportBlob = { type: 'image/png', name: 'export' };
  const exported = await exportScenePng({ mode: 'split', reference: referenceImage, capture: { naturalWidth: 1080, naturalHeight: 1440 }, comparison: 91 }, { createCanvas: () => outputCanvas(exportBlob) });
  const shared = await attemptFileShare(exported.blob, {
    navigator: { canShare: ({ files }) => files.length === 1, share: async () => {} },
    fileFactory: (parts, name, options) => ({ parts, name, type: options.type }),
    filename: `scene-camera-${id}.png`,
  });
  assert.equal(shared.status, 'shared');
  assert.equal(shared.file.name, 'scene-camera-42.png');
  assert.equal(createSceneNavigationTarget('shot-result', id).hash, '#/shot-result/42');
});
