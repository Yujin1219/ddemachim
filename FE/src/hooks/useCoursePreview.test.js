import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement, createRef, forwardRef, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';

import { useCoursePreview } from './useCoursePreview.js';

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
const unexpectedConsoleErrors = [];
console.error = (...args) => {
  const message = args.map((value) => String(value)).join(' ');
  if (!message.includes('react-test-renderer is deprecated')) unexpectedConsoleErrors.push(message);
};

const Harness = forwardRef(function Harness(props, ref) {
  const value = useCoursePreview(props);
  useImperativeHandle(ref, () => value, [value]);
  return null;
});

function validPayload() {
  return {
    serviceDate: '2026-08-18',
    desiredStartTime: '10:00',
    desiredEndTime: '18:00',
    start: { type: 'CURRENT_LOCATION', name: '현재 위치', latitude: 37.57, longitude: 126.98 },
    places: [{ basketItemId: 11, dwellMinutes: 60, arrivalDeadline: null }],
  };
}

function response() {
  return {
    generatedAt: '2026-08-18T01:00:00Z',
    options: [{
      strategy: 'FAST',
      stopCount: 1,
      totalDurationMinutes: 60,
      totalTravelMinutes: 0,
      totalDistanceMeters: 0,
      scheduledStart: '10:00:00',
      scheduledEnd: '11:00:00',
      stops: [{
        sequenceNo: 1,
        basketItemId: 11,
        placeName: '서울공예박물관',
        scheduledArrival: '10:00:00',
        scheduledDeparture: '11:00:00',
        incomingRoute: null,
      }],
    }],
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

test('validates before fetch and shares one in-flight preview request', async () => {
  const requests = [];
  const loadPreview = (payload, options) => new Promise((resolve, reject) => requests.push({ payload, options, resolve, reject }));
  const ref = createRef();
  let renderer;
  await act(async () => {
    renderer = create(createElement(Harness, { ref, loadPreview }));
    await flushPromises();
  });

  try {
    await act(async () => {
      await ref.current.submit({ ...validPayload(), places: [] });
      await flushPromises();
    });
    assert.equal(requests.length, 0);
    assert.equal(ref.current.status, 'validation');

    let first;
    let duplicate;
    await act(async () => {
      first = ref.current.submit(validPayload());
      duplicate = ref.current.submit(validPayload());
      await flushPromises();
    });
    assert.equal(first, duplicate);
    assert.equal(requests.length, 1);
    assert.equal(ref.current.status, 'loading');

    await act(async () => {
      requests[0].resolve(response());
      await first;
      await flushPromises();
    });
    assert.equal(ref.current.status, 'success');
    assert.equal(ref.current.preview.strategy, 'FAST');
    assert.equal(ref.current.preview.stops[0].scheduledArrival, '10:00');
  } finally {
    await act(async () => renderer?.unmount());
  }
});

test('reset aborts a pending request and suppresses its late result', async () => {
  const requests = [];
  const loadPreview = (_payload, options) => new Promise((resolve) => requests.push({ options, resolve }));
  const ref = createRef();
  let renderer;
  await act(async () => {
    renderer = create(createElement(Harness, { ref, loadPreview }));
    await flushPromises();
  });

  let pending;
  try {
    await act(async () => {
      pending = ref.current.submit(validPayload());
      await flushPromises();
    });
    await act(async () => {
      ref.current.reset();
      requests[0].resolve(response());
      await pending;
      await flushPromises();
    });

    assert.equal(requests[0].options.signal.aborted, true);
    assert.equal(ref.current.status, 'idle');
    assert.equal(ref.current.preview, null);
  } finally {
    await act(async () => renderer?.unmount());
  }
});
