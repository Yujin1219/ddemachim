export const JONGNO_CONGESTION_REFRESH_MS = 5 * 60 * 1000;
export const JONGNO_CONGESTION_UNAVAILABLE_RETRY_MS = 15 * 1000;

export function hasLiveJongnoCongestion(data) {
  return Array.isArray(data?.areas) && data.areas.some((area) => {
    const level = String(area?.congestionLevel ?? '').trim();
    return level && level !== '정보없음';
  });
}

export function resolveJongnoCongestionRefreshMs(data) {
  return hasLiveJongnoCongestion(data)
    ? JONGNO_CONGESTION_REFRESH_MS
    : JONGNO_CONGESTION_UNAVAILABLE_RETRY_MS;
}
