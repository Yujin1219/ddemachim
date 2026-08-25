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

function course4222Error(result) {
  const error = new Error('조건에 맞는 빠른 코스를 생성할 수 없습니다.');
  error.status = 422;
  error.code = 'COURSE4222';
  error.result = result;
  return error;
}

function validFailureResult() {
  return {
    requestedStopCount: 1,
    diagnostics: [{
      basketItemId: 11,
      placeName: '서울공예박물관',
      reason: 'PLACE_CLOSED',
      adjustmentProposal: 'CHANGE_SERVICE_DATE',
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
    assert.equal(ref.current.failure, null);

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
    assert.equal(ref.current.failure, null);

    await act(async () => {
      requests[0].resolve(response());
      await first;
      await flushPromises();
    });
    assert.equal(ref.current.status, 'success');
    assert.equal(ref.current.preview.strategy, 'FAST');
    assert.equal(ref.current.preview.stops[0].scheduledArrival, '10:00');
    assert.equal(ref.current.failure, null);
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
    assert.equal(ref.current.failure, null);
  } finally {
    await act(async () => renderer?.unmount());
  }
});

test('adopt opens an already generated AI preview without another fetch', async () => {
  let loadCount = 0;
  const ref = createRef();
  let renderer;
  await act(async () => {
    renderer = create(createElement(Harness, {
      ref,
      loadPreview: async () => { loadCount += 1; return response(); },
    }));
    await flushPromises();
  });

  try {
    await act(async () => {
      ref.current.adopt(response());
      await flushPromises();
    });
    assert.equal(loadCount, 0);
    assert.equal(ref.current.status, 'success');
    assert.equal(ref.current.preview.stops[0].placeName, '서울공예박물관');
  } finally {
    await act(async () => renderer?.unmount());
  }
});

test('stores only a request-matched sanitized COURSE4222 failure', async () => {
  const loadPreview = async () => { throw course4222Error(validFailureResult()); };
  const ref = createRef();
  let renderer;
  await act(async () => {
    renderer = create(createElement(Harness, { ref, loadPreview }));
    await flushPromises();
  });

  try {
    await act(async () => {
      await ref.current.submit(validPayload());
      await flushPromises();
    });

    assert.equal(ref.current.status, 'error');
    assert.deepEqual(ref.current.failure, {
      groups: [{
        id: 'conditions',
        label: '출발 조건',
        action: 'conditions',
        messages: ['서울공예박물관: 선택한 날짜에는 운영하지 않아요.'],
        items: [{
          basketItemId: 11,
          placeName: '서울공예박물관',
          reason: 'PLACE_CLOSED',
          adjustmentProposal: 'CHANGE_SERVICE_DATE',
        }],
      }],
    });
  } finally {
    await act(async () => renderer?.unmount());
  }
});

test('falls back safely when COURSE4222 diagnostics are malformed or not an exact 4222 error', async () => {
  const errors = [
    course4222Error({ requestedStopCount: 1, diagnostics: [] }),
    course4222Error({
      requestedStopCount: 1,
      diagnostics: [{ basketItemId: 11, placeName: '서울공예박물관', reason: '__proto__' }],
    }),
    course4222Error({
      requestedStopCount: 1,
      diagnostics: [{ basketItemId: 11, placeName: '서울공예박물관', reason: 'constructor' }],
    }),
    Object.assign(course4222Error(validFailureResult()), { status: 400 }),
    Object.assign(course4222Error(validFailureResult()), { code: 'COURSE4221' }),
  ];

  for (const error of errors) {
    const ref = createRef();
    let renderer;
    await act(async () => {
      renderer = create(createElement(Harness, { ref, loadPreview: async () => { throw error; } }));
      await flushPromises();
    });
    try {
      await act(async () => {
        await ref.current.submit(validPayload());
        await flushPromises();
      });
      assert.equal(ref.current.status, 'error');
      assert.equal(ref.current.failure, null);
    } finally {
      await act(async () => renderer?.unmount());
    }
  }
});

test('clears a prior structured failure through validation, retry loading, and success', async () => {
  let callCount = 0;
  let resolveRetry;
  const loadPreview = () => {
    callCount += 1;
    if (callCount === 1) return Promise.reject(course4222Error(validFailureResult()));
    return new Promise((resolve) => { resolveRetry = resolve; });
  };
  const ref = createRef();
  let renderer;
  await act(async () => {
    renderer = create(createElement(Harness, { ref, loadPreview }));
    await flushPromises();
  });

  try {
    await act(async () => {
      await ref.current.submit(validPayload());
      await flushPromises();
    });
    assert.ok(ref.current.failure);

    await act(async () => {
      await ref.current.submit({ ...validPayload(), places: [] });
      await flushPromises();
    });
    assert.equal(ref.current.status, 'validation');
    assert.equal(ref.current.failure, null);

    let retryPromise;
    await act(async () => {
      retryPromise = ref.current.retry();
      await flushPromises();
    });
    assert.equal(ref.current.status, 'loading');
    assert.equal(ref.current.failure, null);

    await act(async () => {
      resolveRetry(response());
      await retryPromise;
      await flushPromises();
    });
    assert.equal(ref.current.status, 'success');
    assert.equal(ref.current.failure, null);
  } finally {
    await act(async () => renderer?.unmount());
  }
});

test('preserves auth handling while refusing structured failure data on 401', async () => {
  let authRequiredCount = 0;
  const authError = new Error('로그인이 필요합니다.');
  authError.status = 401;
  authError.code = 'COURSE4222';
  authError.result = validFailureResult();
  const ref = createRef();
  let renderer;
  await act(async () => {
    renderer = create(createElement(Harness, {
      ref,
      loadPreview: async () => { throw authError; },
      onAuthRequired: () => { authRequiredCount += 1; },
    }));
    await flushPromises();
  });

  try {
    await act(async () => {
      await ref.current.submit(validPayload());
      await flushPromises();
    });
    assert.equal(authRequiredCount, 1);
    assert.equal(ref.current.status, 'error');
    assert.equal(ref.current.failure, null);
  } finally {
    await act(async () => renderer?.unmount());
  }
});
