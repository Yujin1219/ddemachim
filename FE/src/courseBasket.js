const AUTH_RETURN_ROUTE_KEY = 'ddemachim:auth-return-route';

function normalizedSource(item) {
  return String(item?.source || 'DDEMACHIM').trim().toUpperCase();
}

export function getBasketItemPresentation(item) {
  const imageUrl = typeof item?.imageUrl === 'string' && item.imageUrl.trim()
    ? item.imageUrl.trim()
    : null;
  const source = normalizedSource(item);
  const category = String(item?.categoryName || '').toLowerCase();

  if (/전시|행사|공연|축제|팝업|event/.test(category) || item?.categoryGroupCode === 'EVENT') {
    return { label: '전시·행사', tone: 'event', imageUrl: imageUrl || '/assets/figma/explore-popup.png' };
  }
  if (source === 'KAKAO') {
    return { label: '카카오 장소', tone: 'kakao', imageUrl: imageUrl || '/assets/place-default.svg' };
  }
  if (/촬영|드라마|영화/.test(category)) return { label: '촬영지', tone: 'filming', imageUrl: imageUrl || '/assets/figma/explore-scene.jpeg' };
  if (/음식|식당|맛집|restaurant/.test(category)) return { label: '음식점', tone: 'restaurant', imageUrl: imageUrl || '/assets/cafe-garden.png' };
  if (/카페|커피|디저트|cafe/.test(category)) return { label: '카페', tone: 'cafe', imageUrl: imageUrl || '/assets/cafe-garden.png' };
  if (/공원|숲|산책|park/.test(category)) return { label: '공원', tone: 'park', imageUrl: imageUrl || '/assets/palace-garden.png' };
  return { label: '관광지', tone: 'landmark', imageUrl: imageUrl || '/assets/palace-garden.png' };
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

export function selectCourseBasketItems(items, selectedIds) {
  const currentItems = Array.isArray(items) ? items : [];
  if (!Array.isArray(selectedIds)) return currentItems;
  const itemsById = new Map(currentItems.map((item) => [String(item.id), item]));
  return selectedIds.map((id) => itemsById.get(String(id))).filter(Boolean);
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

export function getBasketItemNavigation(item) {
  const source = normalizedSource(item);
  const internalPlaceId = Number(item?.placeId ?? item?.place?.id ?? item?.ddemachimPlaceId);
  if (source !== 'KAKAO') {
    return Number.isSafeInteger(internalPlaceId) && internalPlaceId > 0
      ? { type: 'route', screen: 'place', id: internalPlaceId }
      : { type: 'disabled' };
  }

  const providerPlaceId = String(item?.providerPlaceId ?? '').trim();
  const categoryGroupCode = String(item?.categoryGroupCode ?? '').trim().toUpperCase();
  const categoryName = String(item?.categoryName ?? '').trim();
  const isEvent = categoryGroupCode === 'EVENT' || categoryName === '전시·행사';
  if (isEvent && providerPlaceId) {
    return { type: 'route', screen: 'event-detail', id: providerPlaceId.replace(/^event:/, '') };
  }
  return providerPlaceId
    ? { type: 'external', href: getKakaoPlaceUrl(item) }
    : { type: 'disabled' };
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
