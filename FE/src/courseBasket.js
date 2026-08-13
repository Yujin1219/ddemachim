const AUTH_RETURN_ROUTE_KEY = 'ddemachim:auth-return-route';

function normalizedSource(item) {
  return String(item?.source || 'DDEMACHIM').trim().toUpperCase();
}

function basketItemIdentity(item) {
  if (!item) return null;
  const source = normalizedSource(item);
  const sourceId = source === 'KAKAO'
    ? item.providerPlaceId
    : item.placeId;
  if (sourceId !== undefined && sourceId !== null && String(sourceId).trim()) {
    return `${source}:${String(sourceId).trim()}`;
  }
  if (item.id !== undefined && item.id !== null && String(item.id).trim()) {
    return `BASKET:${String(item.id).trim()}`;
  }
  return null;
}

export function mergeBasketItem(items, item) {
  const currentItems = Array.isArray(items) ? items : [];
  if (!item) return currentItems;
  const identity = basketItemIdentity(item);
  if (!identity) return [item, ...currentItems];
  return [item, ...currentItems.filter((candidate) => basketItemIdentity(candidate) !== identity)];
}

export function mergeBasketItems(items, additions) {
  return (Array.isArray(additions) ? additions : []).reduceRight(
    (merged, item) => mergeBasketItem(merged, item),
    Array.isArray(items) ? items : [],
  );
}

export function basketHasKakaoPlace(items, providerPlaceId) {
  if (providerPlaceId === undefined || providerPlaceId === null) return false;
  const identity = `KAKAO:${String(providerPlaceId).trim()}`;
  return (Array.isArray(items) ? items : []).some((item) => basketItemIdentity(item) === identity);
}

export function basketHasUserPlace(items, placeId) {
  if (placeId === undefined || placeId === null) return false;
  const identity = `DDEMACHIM:${String(placeId).trim()}`;
  return (Array.isArray(items) ? items : []).some((item) => basketItemIdentity(item) === identity);
}

export function isDuplicateBasketError(error) {
  if (error?.status === 409) return true;
  const code = String(error?.code ?? '').toUpperCase();
  return code.includes('DUPLICATE') || code.includes('ALREADY') || code.includes('EXISTS');
}

export function getKakaoPlaceUrl(place) {
  const providerPlaceId = String(place?.providerPlaceId ?? '').trim();
  return `https://place.map.kakao.com/${encodeURIComponent(providerPlaceId)}`;
}

function sessionStorageOrNull() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function storeAuthReturnRoute(route, storage = sessionStorageOrNull()) {
  if (!storage || !route?.screen) return;
  const target = {
    screen: String(route.screen),
    id: route.id === undefined || route.id === null ? null : String(route.id),
  };
  try {
    storage.setItem(AUTH_RETURN_ROUTE_KEY, JSON.stringify(target));
  } catch {
    // Login still works when session storage is unavailable.
  }
}

export function consumeAuthReturnRoute(storage = sessionStorageOrNull()) {
  if (!storage) return null;
  try {
    const stored = storage.getItem(AUTH_RETURN_ROUTE_KEY);
    storage.removeItem(AUTH_RETURN_ROUTE_KEY);
    if (!stored) return null;
    const route = JSON.parse(stored);
    if (!route?.screen || typeof route.screen !== 'string') return null;
    return {
      screen: route.screen,
      id: route.id === undefined || route.id === null ? null : String(route.id),
    };
  } catch {
    return null;
  }
}
