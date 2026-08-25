import assert from 'node:assert/strict';
import test from 'node:test';

test('calculates walking distance and compass bearing from consecutive GPS fixes', async () => {
  const camera = await import('./navigationCamera.js').catch(() => ({}));
  const start = { latitude: 37.5665, longitude: 126.9780 };
  const north = { latitude: 37.5666, longitude: 126.9780 };

  assert.ok(camera.distanceMeters(start, north) > 11);
  assert.ok(camera.distanceMeters(start, north) < 12);
  assert.equal(camera.bearingDegrees(start, north), 0);
});

test('keeps the previous heading while the walker is effectively stationary', async () => {
  const { resolveNavigationHeading } = await import('./navigationCamera.js');
  const result = resolveNavigationHeading({
    previousFix: { latitude: 37.5665, longitude: 126.9780 },
    currentFix: { latitude: 37.56651, longitude: 126.9780, heading: 180, speed: 0 },
    previousHeading: 42,
  });

  assert.equal(result.heading, 42);
  assert.equal(result.source, 'held');
  assert.ok(result.movedMeters > 1 && result.movedMeters < 1.2);
});

test('uses a reliable GPS heading on the first fix without inventing a bearing', async () => {
  const { resolveNavigationHeading } = await import('./navigationCamera.js');
  const result = resolveNavigationHeading({
    previousFix: null,
    currentFix: {
      latitude: 37.5665,
      longitude: 126.978,
      heading: 47,
      speed: 1,
      accuracy: 7,
    },
    previousHeading: null,
  });

  assert.equal(result.heading, 47);
  assert.equal(result.source, 'gps');
});

test('prefers a reliable GPS heading and smooths it toward the prior direction', async () => {
  const { resolveNavigationHeading } = await import('./navigationCamera.js');
  const result = resolveNavigationHeading({
    previousFix: { latitude: 37.5665, longitude: 126.9780 },
    currentFix: {
      latitude: 37.5666,
      longitude: 126.9780,
      heading: 90,
      speed: 1.1,
      accuracy: 8,
    },
    previousHeading: 0,
  });

  assert.equal(result.heading, 31.5);
  assert.equal(result.source, 'gps');
});

test('caps a single heading update so a GPS spike cannot snap the map around', async () => {
  const { resolveNavigationHeading } = await import('./navigationCamera.js');
  const result = resolveNavigationHeading({
    previousFix: { latitude: 37.5665, longitude: 126.9780 },
    currentFix: {
      latitude: 37.5666,
      longitude: 126.9780,
      heading: 180,
      speed: 1,
      accuracy: 8,
    },
    previousHeading: 0,
  });

  assert.equal(result.heading, 325);
});

test('falls back to coordinate bearing when browser heading is unavailable', async () => {
  const { resolveNavigationHeading } = await import('./navigationCamera.js');
  const result = resolveNavigationHeading({
    previousFix: { latitude: 37.5665, longitude: 126.9780 },
    currentFix: { latitude: 37.5665, longitude: 126.9781, heading: null },
    previousHeading: null,
  });

  assert.ok(result.heading > 89.9 && result.heading < 90.1);
  assert.equal(result.source, 'bearing');
});

test('smooths across north using the shortest turn instead of spinning around', async () => {
  const { resolveNavigationHeading } = await import('./navigationCamera.js');
  const result = resolveNavigationHeading({
    previousFix: { latitude: 37.5665, longitude: 126.9780 },
    currentFix: {
      latitude: 37.5666,
      longitude: 126.9780,
      heading: 1,
      speed: 1,
      accuracy: 5,
    },
    previousHeading: 359,
    minHeadingChange: 0,
  });

  assert.ok(result.heading > 359.6 && result.heading < 359.8);
});

test('chooses an equivalent OpenLayers rotation on the shortest animation path', async () => {
  const camera = await import('./navigationCamera.js');
  const currentRotation = -(359 * Math.PI) / 180;
  const nextRotation = camera.rotationForHeading(1, currentRotation);

  assert.ok(Math.abs((nextRotation - currentRotation) + (2 * Math.PI / 180)) < 1e-10);
});

test('offsets the view center so the walker appears at 68 percent of map height', async () => {
  const camera = await import('./navigationCamera.js');

  assert.deepEqual(camera.navigationViewCenter({
    coordinate: [1000, 2000],
    size: [400, 800],
    resolution: 2,
    rotation: 0,
  }), [1000, 2288]);
});
