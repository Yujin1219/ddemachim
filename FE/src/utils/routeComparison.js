export const ROUTE_MODES = ['WALK', 'TRANSIT', 'TAXI'];

export function normalizeRouteCoordinate(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function distanceBetweenMeters(originValue, destinationValue) {
  const origin = normalizeRouteCoordinate(originValue);
  const destination = normalizeRouteCoordinate(destinationValue);
  if (!origin || !destination) return Number.POSITIVE_INFINITY;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatRouteDuration(secondsValue) {
  const seconds = Number(secondsValue);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

export function formatRouteDistance(metersValue) {
  const meters = Number(metersValue);
  if (!Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1_000) return `${Math.round(meters)}m`;
  return `${Number((meters / 1_000).toFixed(1))}km`;
}

export function formatRouteFare(wonValue) {
  const won = Number(wonValue);
  return Number.isFinite(won) && won >= 0 ? `${Math.round(won).toLocaleString('ko-KR')}원` : null;
}

export function routeOptionByMode(response, mode) {
  return response?.routes?.find((route) => route?.mode === mode) ?? null;
}

function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('Route location request aborted', 'AbortError');
  }
  const error = new Error('Route location request aborted');
  error.name = 'AbortError';
  return error;
}

class RouteLocationError extends Error {
  constructor(code, message = '현재 위치를 확인할 수 없습니다.') {
    super(message);
    this.name = 'RouteLocationError';
    this.code = code;
  }
}

function locationErrorCode(error) {
  if (error?.code === 1) return 'DENIED';
  if (error?.code === 2) return 'UNAVAILABLE';
  if (error?.code === 3) return 'TIMEOUT';
  return 'UNAVAILABLE';
}

export function requestRoutePosition({
  geolocation = typeof navigator === 'undefined' ? null : navigator.geolocation,
  signal,
} = {}) {
  if (signal?.aborted) return Promise.reject(createAbortError());
  if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
    return Promise.reject(new RouteLocationError('UNSUPPORTED'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => signal?.removeEventListener('abort', handleAbort);
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const handleAbort = () => settle(reject, createAbortError());

    signal?.addEventListener('abort', handleAbort, { once: true });

    try {
      geolocation.getCurrentPosition(
        (position) => {
          const coordinates = normalizeRouteCoordinate({
            latitude: position?.coords?.latitude,
            longitude: position?.coords?.longitude,
          });
          if (!coordinates) {
            settle(reject, new RouteLocationError('UNAVAILABLE'));
            return;
          }
          settle(resolve, coordinates);
        },
        (error) => settle(reject, new RouteLocationError(locationErrorCode(error))),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        },
      );
    } catch {
      settle(reject, new RouteLocationError('UNAVAILABLE'));
    }
  });
}

export function buildKakaoTaxiHref(destinationValue, { mobile, template } = {}) {
  const destination = normalizeRouteCoordinate(destinationValue);
  if (!destination) return null;
  const isMobile = mobile ?? /Android|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent || '');
  if (!isMobile) return 'https://www.kakaomobility.com/service-kakaot';
  const source = template || import.meta.env?.VITE_KAKAO_T_TAXI_URL_TEMPLATE
    || 'https://t.kakao.com/launch?type=taxi&dest_lat={lat}&dest_lng={lng}';
  return source
    .replaceAll('{lat}', encodeURIComponent(destination.latitude))
    .replaceAll('{lng}', encodeURIComponent(destination.longitude));
}
