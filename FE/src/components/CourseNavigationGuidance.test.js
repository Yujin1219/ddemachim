import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import CourseNavigationGuidance from './CourseNavigationGuidance.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('forwards one GPS observation with heading metadata and clears its watcher', async () => {
  const originalNavigator = globalThis.navigator;
  let successCallback;
  const cleared = [];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        watchPosition(success) {
          successCallback = success;
          return 17;
        },
        clearWatch(id) {
          cleared.push(id);
        },
      },
    },
  });
  const observations = [];
  const preview = {
    stops: [{
      latitude: 37.58,
      longitude: 126.99,
      incomingRoute: {
        legs: [{ steps: [{ latitude: 37.57, longitude: 126.98, description: '직진하세요' }] }],
      },
    }],
  };
  let renderer;

  try {
    await act(async () => {
      renderer = create(createElement(CourseNavigationGuidance, {
        preview,
        destination: preview.stops[0],
        onLocationChange: (observation) => observations.push(observation),
      }));
    });
    await act(async () => successCallback({
      timestamp: 1234,
      coords: {
        latitude: 37.5665,
        longitude: 126.978,
        heading: 47,
        speed: 1.2,
        accuracy: 9,
      },
    }));

    assert.deepEqual(observations, [{
      coordinate: [126.978, 37.5665],
      heading: 47,
      speed: 1.2,
      accuracy: 9,
      timestamp: 1234,
    }]);
    await act(async () => renderer.unmount());
    assert.deepEqual(cleared, [17]);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});

test('keeps GPS follow observations active when route guidance text is unavailable', async () => {
  const originalNavigator = globalThis.navigator;
  let successCallback;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        watchPosition(success) {
          successCallback = success;
          return 23;
        },
        clearWatch() {},
      },
    },
  });
  const observations = [];
  const preview = {
    stops: [{
      latitude: 37.58,
      longitude: 126.99,
      incomingRoute: {
        legs: [{
          geometry: { type: 'LineString', coordinates: [[126.978, 37.5665], [126.99, 37.58]] },
          steps: [],
        }],
      },
    }],
  };
  let renderer;

  try {
    await act(async () => {
      renderer = create(createElement(CourseNavigationGuidance, {
        preview,
        destination: preview.stops[0],
        onLocationChange: (observation) => observations.push(observation),
      }));
    });
    assert.equal(typeof successCallback, 'function');
    await act(async () => successCallback({
      timestamp: 5678,
      coords: {
        latitude: 37.5665,
        longitude: 126.978,
        heading: null,
        speed: null,
        accuracy: 12,
      },
    }));
    assert.deepEqual(observations[0].coordinate, [126.978, 37.5665]);
    await act(async () => renderer.unmount());
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});

test('detects arrival once within 30m even when route guidance steps are unavailable', async () => {
  const originalNavigator = globalThis.navigator;
  let successCallback;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        watchPosition(success) {
          successCallback = success;
          return 29;
        },
        clearWatch() {},
      },
    },
  });
  const arrivals = [];
  const destination = {
    latitude: 37.58,
    longitude: 126.99,
    incomingRoute: {
      legs: [{
        geometry: { type: 'LineString', coordinates: [[126.978, 37.5665], [126.99, 37.58]] },
        steps: [],
      }],
    },
  };
  let renderer;

  try {
    await act(async () => {
      renderer = create(createElement(CourseNavigationGuidance, {
        preview: { stops: [destination] },
        destination,
        onArrival: (stop) => arrivals.push(stop),
      }));
    });
    await act(async () => successCallback({
      timestamp: 6000,
      coords: {
        latitude: destination.latitude,
        longitude: destination.longitude,
        heading: null,
        speed: null,
        accuracy: 8,
      },
    }));
    await act(async () => successCallback({
      timestamp: 7000,
      coords: {
        latitude: destination.latitude,
        longitude: destination.longitude,
        heading: null,
        speed: null,
        accuracy: 8,
      },
    }));

    assert.deepEqual(arrivals, [destination]);
    await act(async () => renderer.unmount());
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});

test('advances to a later nearby instruction when an intermediate guidance point is missed', async () => {
  const steps = [
    { latitude: 37.5665, longitude: 126.9780, description: '첫 번째 안내' },
    { latitude: 37.5665, longitude: 126.9785, description: '두 번째 안내' },
    { latitude: 37.5665, longitude: 126.9790, description: '세 번째 안내' },
  ];
  const route = { legs: [{ steps }] };
  const destination = { latitude: 37.58, longitude: 126.99 };
  let renderer;

  await act(async () => {
    renderer = create(createElement(CourseNavigationGuidance, {
      preview: { stops: [] },
      route,
      destination,
      currentLocation: [126.9780, 37.5665],
    }));
  });
  await act(async () => {
    renderer.update(createElement(CourseNavigationGuidance, {
      preview: { stops: [] },
      route,
      destination,
      currentLocation: [126.9790, 37.5665],
    }));
  });

  const status = renderer.root.findByProps({ role: 'status' });
  assert.match(status.findByType('span').children.join(''), /3 \/ 3/);
  assert.match(status.findByType('strong').children.join(''), /세 번째 안내/);
  await act(async () => renderer.unmount());
});
