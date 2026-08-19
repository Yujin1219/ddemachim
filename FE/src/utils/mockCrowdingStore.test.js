import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockCrowdingStore } from './mockCrowdingStore.js';

const FIRST_SLOT = {
  start: '2026-08-18T14:00:00+09:00',
  end: '2026-08-18T14:30:00+09:00',
};
const SECOND_SLOT = {
  start: '2026-08-18T14:30:00+09:00',
  end: '2026-08-18T15:00:00+09:00',
};

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function coveredResult(point, { score = 42, level = 'NORMAL', levelLabel = '보통', slot = FIRST_SLOT } = {}) {
  return {
    referenceId: point.referenceId,
    covered: true,
    gridCode: 'G-100-100',
    score,
    level,
    levelLabel,
    mock: true,
    slotStart: slot.start,
    slotEnd: slot.end,
  };
}

function createBrowserHarness(initialNow = '2026-08-18T05:17:00.000Z') {
  let currentNow = new Date(initialNow);
  let nextTimerId = 1;
  const timers = new Map();
  const visibilityListeners = new Set();
  const visibilityTarget = {
    visibilityState: 'visible',
    addEventListener(type, listener) {
      if (type === 'visibilitychange') visibilityListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'visibilitychange') visibilityListeners.delete(listener);
    },
  };

  return {
    now: () => new Date(currentNow),
    setNow(value) {
      currentNow = new Date(value);
    },
    scheduleTimeout(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    cancelTimeout(id) {
      timers.delete(id);
    },
    runNextTimer() {
      const next = timers.entries().next().value;
      assert.ok(next, 'a slot-boundary timer should be scheduled');
      const [id, timer] = next;
      timers.delete(id);
      timer.callback();
      return timer.delay;
    },
    dispatchVisibilityChange() {
      visibilityListeners.forEach((listener) => listener());
    },
    timerCount: () => timers.size,
    visibilityListenerCount: () => visibilityListeners.size,
    visibilityTarget,
  };
}

function createStore(fetchPoints, browser = createBrowserHarness()) {
  return {
    browser,
    store: createMockCrowdingStore({
      fetchPoints,
      now: browser.now,
      scheduleTimeout: browser.scheduleTimeout,
      cancelTimeout: browser.cancelTimeout,
      visibilityTarget: browser.visibilityTarget,
    }),
  };
}

test('same-microtask registrations use one request and deduplicate exact coordinates', async () => {
  const calls = [];
  const { store } = createStore(async (points, options) => {
    calls.push({ options, points });
    return points.map((point) => coveredResult(point));
  });
  const published = [];
  const unsubscribeFirst = store.subscribe(126.9768, 37.5759, () => {
    published.push(store.getSnapshot(126.9768, 37.5759));
  });
  const unsubscribeDuplicate = store.subscribe('126.9768', '37.5759', () => {
    published.push(store.getSnapshot(126.9768, 37.5759));
  });
  const unsubscribeSecond = store.subscribe(126.9832, 37.5826, () => {});

  await flushMicrotasks();

  assert.equal(calls.length, 1);
  assert.deepEqual(
    calls[0].points.map(({ latitude, longitude }) => ({ latitude, longitude })),
    [
      { latitude: 37.5759, longitude: 126.9768 },
      { latitude: 37.5826, longitude: 126.9832 },
    ],
  );
  assert.equal(new Set(calls[0].points.map((point) => point.referenceId)).size, 2);
  assert.equal(calls[0].options.at, '2026-08-18T05:17:00.000Z');
  assert.equal(published.at(-1).score, 42);
  assert.equal(published.at(-2).score, 42);

  unsubscribeFirst();
  unsubscribeDuplicate();
  unsubscribeSecond();
});

test('a point removed before flush can register again after another point keeps the store active', async () => {
  const calls = [];
  const { store } = createStore(async (points) => {
    calls.push(points);
    return points.map((point) => coveredResult(point));
  });
  const unsubscribeKept = store.subscribe(126.9832, 37.5826, () => {});
  const unsubscribeRemoved = store.subscribe(126.9768, 37.5759, () => {});
  unsubscribeRemoved();
  await flushMicrotasks();

  assert.deepEqual(
    calls[0].map(({ latitude, longitude }) => ({ latitude, longitude })),
    [{ latitude: 37.5826, longitude: 126.9832 }],
  );

  const unsubscribeRegisteredAgain = store.subscribe(126.9768, 37.5759, () => {});
  await flushMicrotasks();
  assert.deepEqual(
    calls[1].map(({ latitude, longitude }) => ({ latitude, longitude })),
    [{ latitude: 37.5759, longitude: 126.9768 }],
  );

  unsubscribeRegisteredAgain();
  unsubscribeKept();
});

test('successful point data publishes the badge shape and stays cached for the current slot', async () => {
  let requestCount = 0;
  const { store } = createStore(async (points) => {
    requestCount += 1;
    return points.map((point) => coveredResult(point));
  });
  const unsubscribe = store.subscribe(126.9768, 37.5759, () => {});

  assert.deepEqual(store.getSnapshot(126.9768, 37.5759), {
    status: 'loading',
    congestionLevel: null,
    score: null,
    level: null,
    levelLabel: null,
    mock: null,
    slotStart: null,
    slotEnd: null,
    covered: null,
  });
  await flushMicrotasks();

  assert.deepEqual(store.getSnapshot(126.9768, 37.5759), {
    status: 'ready',
    congestionLevel: '보통',
    score: 42,
    level: 'NORMAL',
    levelLabel: '보통',
    mock: true,
    slotStart: FIRST_SLOT.start,
    slotEnd: FIRST_SLOT.end,
    covered: true,
  });
  unsubscribe();

  const unsubscribeCached = store.subscribe(126.9768, 37.5759, () => {});
  await flushMicrotasks();
  assert.equal(requestCount, 1);
  unsubscribeCached();
});

test('the slot boundary aborts old work and stale responses cannot replace the new slot', async () => {
  const requests = [];
  const browser = createBrowserHarness();
  const { store } = createStore((points, options) => {
    const response = deferred();
    requests.push({ options, points, response });
    return response.promise;
  }, browser);
  const unsubscribe = store.subscribe(126.9768, 37.5759, () => {});
  await flushMicrotasks();
  assert.equal(requests.length, 1);

  browser.setNow('2026-08-18T05:30:00.100Z');
  const scheduledDelay = browser.runNextTimer();
  assert.ok(scheduledDelay > 0 && scheduledDelay <= 30 * 60 * 1000);
  await flushMicrotasks();

  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(requests.length, 2);
  requests[0].response.resolve(requests[0].points.map((point) => coveredResult(point, { score: 25 })));
  await flushMicrotasks();
  assert.equal(store.getSnapshot(126.9768, 37.5759).status, 'loading');
  assert.equal(store.getSnapshot(126.9768, 37.5759).score, null);

  requests[1].response.resolve(requests[1].points.map((point) => coveredResult(point, {
    score: 76,
    level: 'VERY_CROWDED',
    levelLabel: '붐빔',
    slot: SECOND_SLOT,
  })));
  await flushMicrotasks();
  assert.equal(store.getSnapshot(126.9768, 37.5759).score, 76);
  assert.equal(store.getSnapshot(126.9768, 37.5759).slotStart, SECOND_SLOT.start);

  unsubscribe();
});

test('visibility changes re-check the slot and the last unsubscribe cleans browser resources', async () => {
  const calls = [];
  const browser = createBrowserHarness();
  const { store } = createStore(async (points, options) => {
    calls.push({ options, points });
    const slot = calls.length === 1 ? FIRST_SLOT : SECOND_SLOT;
    return points.map((point) => coveredResult(point, { slot }));
  }, browser);
  const unsubscribe = store.subscribe(126.9768, 37.5759, () => {});
  await flushMicrotasks();

  assert.equal(browser.timerCount(), 1);
  assert.equal(browser.visibilityListenerCount(), 1);
  browser.setNow('2026-08-18T05:31:00.000Z');
  browser.dispatchVisibilityChange();
  await flushMicrotasks();
  assert.equal(calls.length, 2);
  assert.equal(store.getSnapshot(126.9768, 37.5759).slotStart, SECOND_SLOT.start);

  unsubscribe();
  assert.equal(browser.timerCount(), 0);
  assert.equal(browser.visibilityListenerCount(), 0);
});

test('missing and invalid coordinates stay idle without a network request', async () => {
  let requestCount = 0;
  const { store } = createStore(async () => {
    requestCount += 1;
    return [];
  });
  const unsubscribes = [
    store.subscribe(undefined, 37.5759, () => {}),
    store.subscribe(126.9768, '', () => {}),
    store.subscribe(181, 37.5759, () => {}),
    store.subscribe(126.9768, -91, () => {}),
  ];

  await flushMicrotasks();

  assert.equal(requestCount, 0);
  assert.equal(store.getSnapshot(undefined, 37.5759).status, 'idle');
  unsubscribes.forEach((unsubscribe) => unsubscribe());
});

test('loading and request failures never expose congestion values', async () => {
  const response = deferred();
  const { store } = createStore(() => response.promise);
  const unsubscribe = store.subscribe(126.9768, 37.5759, () => {});

  assert.equal(store.getSnapshot(126.9768, 37.5759).status, 'loading');
  assert.equal(store.getSnapshot(126.9768, 37.5759).congestionLevel, null);
  response.reject(new Error('network unavailable'));
  await flushMicrotasks();

  assert.deepEqual(store.getSnapshot(126.9768, 37.5759), {
    status: 'error',
    congestionLevel: null,
    score: null,
    level: null,
    levelLabel: null,
    mock: null,
    slotStart: null,
    slotEnd: null,
    covered: null,
  });
  unsubscribe();
});

test('uncovered responses publish no fabricated score, level, MOCK flag, or slot', async () => {
  const { store } = createStore(async (points) => points.map((point) => ({
    referenceId: point.referenceId,
    covered: false,
  })));
  const unsubscribe = store.subscribe(127.2, 37.7, () => {});
  await flushMicrotasks();

  assert.deepEqual(store.getSnapshot(127.2, 37.7), {
    status: 'uncovered',
    congestionLevel: null,
    score: null,
    level: null,
    levelLabel: null,
    mock: null,
    slotStart: null,
    slotEnd: null,
    covered: false,
  });
  unsubscribe();
});
