import { useCallback, useSyncExternalStore } from 'react';
import { fetchMockCrowdingPoints } from '../api/client.js';

const SLOT_DURATION_MS = 30 * 60 * 1000;
const SEOUL_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;

function pointSnapshot(status, patch = {}) {
  return Object.freeze({
    status,
    congestionLevel: null,
    score: null,
    level: null,
    levelLabel: null,
    mock: null,
    slotStart: null,
    slotEnd: null,
    covered: null,
    ...patch,
  });
}

const IDLE_SNAPSHOT = pointSnapshot('idle');
const LOADING_SNAPSHOT = pointSnapshot('loading');
const ERROR_SNAPSHOT = pointSnapshot('error');
const UNCOVERED_SNAPSHOT = pointSnapshot('uncovered', { covered: false });

function normalizeCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

function normalizePoint(longitudeValue, latitudeValue) {
  const longitude = normalizeCoordinate(longitudeValue, -180, 180);
  const latitude = normalizeCoordinate(latitudeValue, -90, 90);
  if (longitude === null || latitude === null) return null;
  return {
    key: `${longitude},${latitude}`,
    latitude,
    longitude,
  };
}

function resolveSlot(value) {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError('A valid current time is required.');

  const shiftedTimestamp = timestamp + SEOUL_UTC_OFFSET_MS;
  const shiftedSlotStart = Math.floor(shiftedTimestamp / SLOT_DURATION_MS) * SLOT_DURATION_MS;
  const startTimestamp = shiftedSlotStart - SEOUL_UTC_OFFSET_MS;
  return {
    key: new Date(startTimestamp).toISOString(),
    requestAt: new Date(timestamp).toISOString(),
    startTimestamp,
    endTimestamp: startTimestamp + SLOT_DURATION_MS,
  };
}

function responseMatchesSlot(item, slot) {
  const startTimestamp = Date.parse(item?.slotStart);
  const endTimestamp = Date.parse(item?.slotEnd);
  return startTimestamp === slot.startTimestamp && endTimestamp === slot.endTimestamp;
}

function normalizeResponse(item, slot) {
  if (item?.covered === false) return UNCOVERED_SNAPSHOT;
  if (item?.covered !== true || item.mock !== true || !responseMatchesSlot(item, slot)) {
    return ERROR_SNAPSHOT;
  }

  const score = Number(item.score);
  const level = typeof item.level === 'string' ? item.level.trim() : '';
  const levelLabel = typeof item.levelLabel === 'string' ? item.levelLabel.trim() : '';
  if (!Number.isInteger(score) || score < 1 || score > 100 || !level || !levelLabel) {
    return ERROR_SNAPSHOT;
  }

  return pointSnapshot('ready', {
    congestionLevel: levelLabel,
    score,
    level,
    levelLabel,
    mock: true,
    slotStart: item.slotStart,
    slotEnd: item.slotEnd,
    covered: true,
  });
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

export function createMockCrowdingStore({
  fetchPoints = fetchMockCrowdingPoints,
  now = () => new Date(),
  scheduleTimeout = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancelTimeout = (timerId) => globalThis.clearTimeout(timerId),
  visibilityTarget = typeof document === 'undefined' ? null : document,
  enqueueMicrotask = globalThis.queueMicrotask?.bind(globalThis)
    ?? ((callback) => Promise.resolve().then(callback)),
} = {}) {
  const entries = new Map();
  const queuedKeys = new Set();
  const activeRequests = new Set();
  let activeSlot = null;
  let boundaryTimerId = null;
  let flushScheduled = false;
  let flushToken = 0;
  let generation = 0;
  let subscriberCount = 0;
  let lifecycleActive = false;

  function getOrCreateEntry(point) {
    let entry = entries.get(point.key);
    if (!entry) {
      entry = {
        ...point,
        referenceId: `point:${point.key}`,
        listeners: new Set(),
        snapshot: IDLE_SNAPSHOT,
        cacheSlotKey: null,
        queued: false,
        requestGeneration: null,
      };
      entries.set(point.key, entry);
    }
    return entry;
  }

  function publish(entry, snapshot) {
    if (entry.snapshot === snapshot) return;
    entry.snapshot = snapshot;
    entry.listeners.forEach((listener) => listener());
  }

  function clearBoundaryTimer() {
    if (boundaryTimerId === null) return;
    cancelTimeout(boundaryTimerId);
    boundaryTimerId = null;
  }

  function scheduleBoundaryCheck() {
    clearBoundaryTimer();
    if (!lifecycleActive || !visibilityTarget || !activeSlot) return;
    const delay = Math.max(1, activeSlot.endTimestamp - now().getTime() + 25);
    boundaryTimerId = scheduleTimeout(() => {
      boundaryTimerId = null;
      if (!ensureCurrentSlot()) scheduleBoundaryCheck();
    }, delay);
  }

  function abortActiveRequests() {
    activeRequests.forEach((controller) => controller.abort());
    activeRequests.clear();
  }

  function invalidateQueuedFlush() {
    flushToken += 1;
    flushScheduled = false;
    queuedKeys.clear();
    entries.forEach((entry) => {
      entry.queued = false;
      entry.requestGeneration = null;
    });
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    const scheduledToken = flushToken;
    enqueueMicrotask(() => {
      if (scheduledToken !== flushToken) return;
      flushScheduled = false;
      void flushQueue();
    });
  }

  function queueEntry(entry) {
    if (
      entry.listeners.size === 0
      || entry.queued
      || entry.requestGeneration !== null
      || entry.cacheSlotKey === activeSlot?.key
    ) return;

    entry.queued = true;
    queuedKeys.add(entry.key);
    publish(entry, LOADING_SNAPSHOT);
    scheduleFlush();
  }

  function transitionToSlot(nextSlot) {
    generation += 1;
    activeSlot = nextSlot;
    abortActiveRequests();
    invalidateQueuedFlush();

    entries.forEach((entry) => {
      entry.cacheSlotKey = null;
      if (entry.listeners.size > 0) queueEntry(entry);
      else entry.snapshot = IDLE_SNAPSHOT;
    });
    scheduleBoundaryCheck();
  }

  function ensureCurrentSlot() {
    const nextSlot = resolveSlot(now());
    if (!activeSlot) {
      activeSlot = nextSlot;
      scheduleBoundaryCheck();
      return false;
    }
    if (nextSlot.key === activeSlot.key) return false;
    transitionToSlot(nextSlot);
    return true;
  }

  async function flushQueue() {
    const startingGeneration = generation;
    ensureCurrentSlot();
    if (startingGeneration !== generation || !activeSlot) return;

    const drainedEntries = [...queuedKeys]
      .map((key) => entries.get(key))
      .filter(Boolean);
    queuedKeys.clear();
    drainedEntries.forEach((entry) => {
      entry.queued = false;
    });
    const requestEntries = drainedEntries.filter((entry) => entry.listeners.size > 0);
    if (requestEntries.length === 0) return;

    const requestSlot = activeSlot;
    const requestGeneration = generation;
    const controller = new AbortController();
    activeRequests.add(controller);
    requestEntries.forEach((entry) => {
      entry.requestGeneration = requestGeneration;
    });

    const points = requestEntries.map((entry) => ({
      referenceId: entry.referenceId,
      latitude: entry.latitude,
      longitude: entry.longitude,
    }));

    try {
      const result = await fetchPoints(points, {
        at: requestSlot.requestAt,
        signal: controller.signal,
      });
      ensureCurrentSlot();
      if (controller.signal.aborted || requestGeneration !== generation || requestSlot.key !== activeSlot?.key) {
        return;
      }

      const resultsByReference = new Map(
        (Array.isArray(result) ? result : []).map((item) => [item?.referenceId, item]),
      );
      requestEntries.forEach((entry) => {
        const snapshot = normalizeResponse(resultsByReference.get(entry.referenceId), requestSlot);
        entry.cacheSlotKey = snapshot.status === 'ready' || snapshot.status === 'uncovered'
          ? requestSlot.key
          : null;
        publish(entry, snapshot);
      });
    } catch (error) {
      if (
        controller.signal.aborted
        || isAbortError(error)
        || requestGeneration !== generation
        || requestSlot.key !== activeSlot?.key
      ) return;
      requestEntries.forEach((entry) => {
        entry.cacheSlotKey = null;
        publish(entry, ERROR_SNAPSHOT);
      });
    } finally {
      activeRequests.delete(controller);
      requestEntries.forEach((entry) => {
        if (entry.requestGeneration === requestGeneration) entry.requestGeneration = null;
      });
    }
  }

  function handleVisibilityChange() {
    if (visibilityTarget?.visibilityState === 'hidden') return;
    const slotChanged = ensureCurrentSlot();
    if (slotChanged) return;
    entries.forEach((entry) => {
      if (entry.listeners.size > 0 && entry.cacheSlotKey !== activeSlot?.key) queueEntry(entry);
    });
  }

  function startLifecycle() {
    lifecycleActive = true;
    ensureCurrentSlot();
    visibilityTarget?.addEventListener?.('visibilitychange', handleVisibilityChange);
    scheduleBoundaryCheck();
  }

  function stopLifecycle() {
    lifecycleActive = false;
    clearBoundaryTimer();
    visibilityTarget?.removeEventListener?.('visibilitychange', handleVisibilityChange);
    generation += 1;
    abortActiveRequests();
    invalidateQueuedFlush();
    entries.forEach((entry) => {
      if (entry.snapshot.status === 'loading') entry.snapshot = IDLE_SNAPSHOT;
    });
  }

  function subscribe(longitude, latitude, listener) {
    const point = normalizePoint(longitude, latitude);
    if (!point) return () => {};

    const entry = getOrCreateEntry(point);
    entry.listeners.add(listener);
    subscriberCount += 1;
    if (subscriberCount === 1) startLifecycle();
    else ensureCurrentSlot();
    queueEntry(entry);

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      if (entry.listeners.delete(listener)) subscriberCount -= 1;
      if (subscriberCount === 0) stopLifecycle();
    };
  }

  function getSnapshot(longitude, latitude) {
    const point = normalizePoint(longitude, latitude);
    if (!point) return IDLE_SNAPSHOT;
    const entry = entries.get(point.key);
    if (!entry) return IDLE_SNAPSHOT;

    const currentSlotKey = resolveSlot(now()).key;
    if (entry.cacheSlotKey && entry.cacheSlotKey !== currentSlotKey) return IDLE_SNAPSHOT;
    return entry.snapshot;
  }

  return { getSnapshot, subscribe };
}

const mockCrowdingStore = createMockCrowdingStore();

export function useMockCrowdingAtPoint(longitude, latitude) {
  const subscribe = useCallback(
    (listener) => mockCrowdingStore.subscribe(longitude, latitude, listener),
    [latitude, longitude],
  );
  const getSnapshot = useCallback(
    () => mockCrowdingStore.getSnapshot(longitude, latitude),
    [latitude, longitude],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
