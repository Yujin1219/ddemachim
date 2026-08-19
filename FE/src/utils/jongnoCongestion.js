import { useMemo, useSyncExternalStore } from 'react';
import GeoJSON from 'ol/format/GeoJSON.js';
import { fetchJongnoCongestion } from '../api/client';
import {
  hasLiveJongnoCongestion,
  JONGNO_CONGESTION_REFRESH_MS,
  resolveJongnoCongestionRefreshMs,
} from './jongnoCongestionRefresh.js';

export { JONGNO_CONGESTION_REFRESH_MS } from './jongnoCongestionRefresh.js';

const JONGNO_CONGESTION_AREA_URL = '/data/jongno-city-areas.geojson';
const geoJsonFormat = new GeoJSON();
const listeners = new Set();

let polygonRequest = null;
let congestionRequest = null;
let refreshTimerId = null;
let lastCongestionAttemptAt = 0;
let snapshot = {
  polygons: null,
  data: null,
  polygonsLoading: false,
  congestionLoading: false,
  polygonError: null,
  congestionError: null,
  cachedAt: 0,
};

function publish(patch) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

function normalizeAreaCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function finiteArea(value) {
  const area = Number(value);
  return Number.isFinite(area) && area >= 0 ? area : Number.POSITIVE_INFINITY;
}

function readCongestionPolygons(collection) {
  return geoJsonFormat
    .readFeatures(collection, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:4326',
    })
    .map((feature, sourceIndex) => ({
      areaCode: normalizeAreaCode(feature.get('areaCode')),
      areaName: feature.get('areaName') || null,
      category: feature.get('category') || null,
      originalAreaM2: finiteArea(feature.get('originalAreaM2')),
      geometry: feature.getGeometry(),
      sourceIndex,
    }))
    .filter((area) => area.areaCode && area.geometry);
}

function loadCongestionPolygons() {
  if (snapshot.polygons) return Promise.resolve(snapshot.polygons);
  if (polygonRequest) return polygonRequest;

  publish({ polygonsLoading: true, polygonError: null });
  polygonRequest = fetch(JONGNO_CONGESTION_AREA_URL, {
    headers: { Accept: 'application/geo+json, application/json' },
  })
    .then((response) => {
      if (!response.ok) throw new Error(`혼잡도 영역을 불러오지 못했어요. (${response.status})`);
      return response.json();
    })
    .then((collection) => {
      const polygons = readCongestionPolygons(collection);
      publish({ polygons, polygonsLoading: false, polygonError: null });
      return polygons;
    })
    .catch((error) => {
      publish({ polygonsLoading: false, polygonError: error });
      throw error;
    })
    .finally(() => {
      polygonRequest = null;
    });

  return polygonRequest;
}

function congestionCacheIsFresh() {
  return Boolean(
    hasLiveJongnoCongestion(snapshot.data)
      && snapshot.cachedAt
      && Date.now() - snapshot.cachedAt < JONGNO_CONGESTION_REFRESH_MS,
  );
}

function loadCongestionData({ force = false } = {}) {
  if (!force && congestionCacheIsFresh()) return Promise.resolve(snapshot.data);
  if (congestionRequest) return congestionRequest;

  lastCongestionAttemptAt = Date.now();
  publish({ congestionLoading: true, congestionError: null });
  congestionRequest = fetchJongnoCongestion()
    .then((data) => {
      publish({
        data,
        congestionLoading: false,
        congestionError: null,
        cachedAt: Date.now(),
      });
      return data;
    })
    .catch((error) => {
      publish({ congestionLoading: false, congestionError: error });
      throw error;
    })
    .finally(() => {
      congestionRequest = null;
    });

  return congestionRequest;
}

function loadSharedResources({ forceCongestion = false } = {}) {
  return Promise.allSettled([
    loadCongestionPolygons(),
    loadCongestionData({ force: forceCongestion }),
  ]);
}

function clearRefreshTimer() {
  if (refreshTimerId === null || typeof window === 'undefined') return;
  window.clearTimeout(refreshTimerId);
  refreshTimerId = null;
}

function scheduleRefresh() {
  if (typeof window === 'undefined' || listeners.size === 0) return;
  clearRefreshTimer();

  const refreshMs = resolveJongnoCongestionRefreshMs(snapshot.data);
  const lastReferenceAt = hasLiveJongnoCongestion(snapshot.data)
    ? snapshot.cachedAt
    : lastCongestionAttemptAt;
  const elapsed = lastReferenceAt ? Date.now() - lastReferenceAt : 0;
  const delay = lastReferenceAt
    ? Math.max(1000, refreshMs - elapsed)
    : refreshMs;

  refreshTimerId = window.setTimeout(async () => {
    refreshTimerId = null;
    await loadSharedResources({ forceCongestion: true });
    scheduleRefresh();
  }, delay);
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void loadSharedResources().then(scheduleRefresh);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) clearRefreshTimer();
  };
}

function getSnapshot() {
  return snapshot;
}

export function useJongnoCongestion() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function compareCoveredAreas(left, right) {
  if (left.originalAreaM2 !== right.originalAreaM2) {
    return left.originalAreaM2 - right.originalAreaM2;
  }
  if (left.areaCode !== right.areaCode) return left.areaCode < right.areaCode ? -1 : 1;
  return left.sourceIndex - right.sourceIndex;
}

export function matchJongnoCongestionAtPoint(currentSnapshot, longitudeValue, latitudeValue) {
  const longitude = Number(longitudeValue);
  const latitude = Number(latitudeValue);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (!currentSnapshot?.polygons || !currentSnapshot?.data?.areas) return null;

  const coveredArea = currentSnapshot.polygons
    .filter((area) => area.geometry.intersectsCoordinate([longitude, latitude]))
    .sort(compareCoveredAreas)[0];
  if (!coveredArea) return null;

  const liveArea = currentSnapshot.data.areas.find(
    (area) => normalizeAreaCode(area.areaCode) === coveredArea.areaCode,
  );
  const congestionLevel = String(liveArea?.congestionLevel ?? '').trim();
  if (!liveArea || !congestionLevel || congestionLevel === '정보없음') return null;

  const cacheExpired = Boolean(
    currentSnapshot.cachedAt
      && Date.now() - currentSnapshot.cachedAt >= JONGNO_CONGESTION_REFRESH_MS,
  );

  return {
    ...liveArea,
    areaCode: liveArea.areaCode || coveredArea.areaCode,
    areaName: liveArea.areaName || coveredArea.areaName,
    category: liveArea.category || coveredArea.category,
    originalAreaM2: Number.isFinite(coveredArea.originalAreaM2) ? coveredArea.originalAreaM2 : null,
    congestionLevel,
    updatedAt: currentSnapshot.data.updatedAt ?? liveArea.updatedAt ?? null,
    stale: Boolean(currentSnapshot.data.stale || cacheExpired),
    sourceStale: Boolean(currentSnapshot.data.stale),
  };
}

export function useJongnoCongestionAtPoint(longitude, latitude) {
  const currentSnapshot = useJongnoCongestion();
  return useMemo(
    () => matchJongnoCongestionAtPoint(currentSnapshot, longitude, latitude),
    [currentSnapshot, latitude, longitude],
  );
}

export function formatCongestionPopulation(area) {
  const min = Number(area?.populationMin);
  const max = Number(area?.populationMax);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return `${min.toLocaleString('ko-KR')}~${max.toLocaleString('ko-KR')}명`;
  }
  return '인원 정보 없음';
}

export function formatCongestionTime(value) {
  const text = String(value ?? '').trim();
  if (!text) return '기준 시간 정보 없음';
  const normalized = text.replace('T', ' ').replace(/:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?$/, '');
  return normalized || text;
}

export function mergeCongestionArea(area, congestion) {
  if (!area) return null;
  const matched = congestion?.areas?.find(
    (item) => normalizeAreaCode(item.areaCode) === normalizeAreaCode(area.areaCode),
  );
  if (!matched) return area;
  return {
    ...area,
    ...matched,
    updatedAt: congestion.updatedAt ?? area.updatedAt,
    stale: congestion.stale ?? area.stale,
  };
}
