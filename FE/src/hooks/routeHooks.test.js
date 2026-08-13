import assert from 'node:assert/strict';
import test from 'node:test';
import React, {
  StrictMode,
  createElement,
  createRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { act, create } from 'react-test-renderer';

import { useCurrentLocation } from './useCurrentLocation.js';
import { useRouteComparison } from './useRouteComparison.js';

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
const unexpectedConsoleErrors = [];
console.error = (...args) => {
  const message = args.map((value) => String(value)).join(' ');
  if (!message.includes('react-test-renderer is deprecated')) {
    unexpectedConsoleErrors.push(message);
  }
};

const CurrentLocationHarness = forwardRef(function CurrentLocationHarness(props, ref) {
  const value = useCurrentLocation(props);
  useImperativeHandle(ref, () => value, [value]);
  return null;
});

const RouteComparisonHarness = forwardRef(function RouteComparisonHarness(props, ref) {
  const value = useRouteComparison(props);
  useImperativeHandle(ref, () => value, [value]);
  return null;
});

function createGeolocation() {
  const requests = [];
  return {
    requests,
    geolocation: {
      getCurrentPosition(onSuccess, onError, options) {
        requests.push({ onSuccess, onError, options });
      },
    },
  };
}

function replaceNavigator(geolocation) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    enumerable: true,
    value: { geolocation },
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

test.afterEach(() => {
  assert.deepEqual(unexpectedConsoleErrors, [], `unexpected console.error: ${unexpectedConsoleErrors.join('\n')}`);
  unexpectedConsoleErrors.length = 0;
});

test.after(() => {
  console.error = originalConsoleError;
  if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test('useCurrentLocation restarts auto locate after StrictMode effect cleanup', async () => {
  const { geolocation, requests } = createGeolocation();
  const restoreNavigator = replaceNavigator(geolocation);
  let renderer;
  const ref = createRef();

  try {
    await act(async () => {
      renderer = create(
        createElement(
          StrictMode,
          null,
          createElement(CurrentLocationHarness, { ref, auto: true }),
        ),
      );
      await flushPromises();
    });

    assert.equal(requests.length, 2, 'StrictMode should restart the one-shot request after cleanup');
    await act(async () => {
      requests[0].onSuccess({ coords: { latitude: 37.5, longitude: 127 } });
      requests[1].onSuccess({ coords: { latitude: 37.5665, longitude: 126.978 } });
      await flushPromises();
    });

    assert.equal(ref.current.status, 'ready');
    assert.deepEqual(ref.current.location, { latitude: 37.5665, longitude: 126.978 });
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    restoreNavigator();
  }
});

test('useCurrentLocation shares concurrent locate promises', async () => {
  const { geolocation, requests } = createGeolocation();
  const restoreNavigator = replaceNavigator(geolocation);
  let renderer;
  const ref = createRef();

  try {
    await act(async () => {
      renderer = create(createElement(CurrentLocationHarness, { ref, auto: false }));
      await flushPromises();
    });

    let firstPromise;
    let secondPromise;
    await act(async () => {
      firstPromise = ref.current.locate();
      secondPromise = ref.current.locate();
      await flushPromises();
    });
    assert.equal(firstPromise, secondPromise);
    assert.equal(requests.length, 1);

    await act(async () => {
      requests[0].onSuccess({ coords: { latitude: 37.5665, longitude: 126.978 } });
      await Promise.all([firstPromise, secondPromise]);
    });
    assert.equal(ref.current.status, 'ready');
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    restoreNavigator();
  }
});

test('useCurrentLocation clear aborts and suppresses a late callback', async () => {
  const { geolocation, requests } = createGeolocation();
  const restoreNavigator = replaceNavigator(geolocation);
  let renderer;
  const ref = createRef();

  try {
    await act(async () => {
      renderer = create(createElement(CurrentLocationHarness, { ref, auto: false }));
      await flushPromises();
    });
    let locationPromise;
    await act(async () => {
      locationPromise = ref.current.locate();
      await flushPromises();
    });
    await act(async () => {
      ref.current.clear();
      requests[0].onSuccess({ coords: { latitude: 37.5665, longitude: 126.978 } });
      await locationPromise;
      await flushPromises();
    });

    assert.equal(ref.current.status, 'idle');
    assert.equal(ref.current.location, null);
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    restoreNavigator();
  }
});

function successResponse(result) {
  return new Response(JSON.stringify({ isSuccess: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('useRouteComparison aborts changed-coordinate requests and suppresses stale data', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = (_url, options) => new Promise((resolve, reject) => {
    requests.push({ options, resolve, reject });
  });
  let renderer;
  const ref = createRef();
  const firstOrigin = { latitude: 37.5665, longitude: 126.978 };
  const destination = { latitude: 37.5559, longitude: 126.9723 };

  try {
    await act(async () => {
      renderer = create(createElement(RouteComparisonHarness, {
        ref,
        origin: firstOrigin,
        destination,
      }));
      await flushPromises();
    });
    assert.equal(requests.length, 1);
    const firstSignal = requests[0].options.signal;

    await act(async () => {
      renderer.update(createElement(RouteComparisonHarness, {
        ref,
        origin: { latitude: 37.5666, longitude: 126.978 },
        destination,
      }));
      await flushPromises();
    });
    assert.equal(firstSignal.aborted, true);
    assert.equal(requests.length, 2);

    await act(async () => {
      requests[0].resolve(successResponse({ marker: 'stale' }));
      requests[1].resolve(successResponse({ marker: 'fresh' }));
      await flushPromises();
    });
    assert.equal(ref.current.status, 'ready');
    assert.deepEqual(ref.current.data, { marker: 'fresh' });
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    globalThis.fetch = originalFetch;
  }
});

test('useRouteComparison retries after an error', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = (_url, options) => new Promise((resolve, reject) => {
    requests.push({ options, resolve, reject });
  });
  let renderer;
  const ref = createRef();
  const props = {
    ref,
    origin: { latitude: 37.5665, longitude: 126.978 },
    destination: { latitude: 37.5559, longitude: 126.9723 },
  };

  try {
    await act(async () => {
      renderer = create(createElement(RouteComparisonHarness, props));
      await flushPromises();
    });
    await act(async () => {
      requests[0].reject(new Error('temporary failure'));
      await flushPromises();
    });
    assert.equal(ref.current.status, 'error');
    assert.equal(ref.current.error.message, 'temporary failure');

    await act(async () => {
      ref.current.retry();
      await flushPromises();
    });
    assert.equal(requests.length, 2);
    await act(async () => {
      requests[1].resolve(successResponse({ marker: 'retried' }));
      await flushPromises();
    });
    assert.equal(ref.current.status, 'ready');
    assert.deepEqual(ref.current.data, { marker: 'retried' });
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    globalThis.fetch = originalFetch;
  }
});

test('useRouteComparison does not fetch when destination is within 30 meters', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return successResponse({ marker: 'unexpected' });
  };
  let renderer;
  const ref = createRef();

  try {
    await act(async () => {
      renderer = create(createElement(RouteComparisonHarness, {
        ref,
        origin: { latitude: 37.5665, longitude: 126.978 },
        destination: { latitude: 37.5666, longitude: 126.978 },
      }));
      await flushPromises();
    });
    assert.equal(fetchCalls, 0);
    assert.equal(ref.current.status, 'idle');
    assert.equal(ref.current.data, null);
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    globalThis.fetch = originalFetch;
  }
});
