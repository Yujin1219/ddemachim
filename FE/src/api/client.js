const BASE_URL = '/api';
const ACCESS_TOKEN_KEY = 'accessToken';
const USER_KEY = 'user';

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAccessToken() {
  return getStorage()?.getItem(ACCESS_TOKEN_KEY) || null;
}

export function getUser() {
  const rawUser = getStorage()?.getItem(USER_KEY);
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

export function saveUser(user) {
  const storage = getStorage();
  if (!storage || !user) return false;

  try {
    storage.setItem(USER_KEY, JSON.stringify(user));
    return true;
  } catch {
    return false;
  }
}

export function saveAuth({ accessToken, ...user } = {}) {
  if (!accessToken) throw new Error('인증 토큰을 받지 못했어요.');

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(ACCESS_TOKEN_KEY, accessToken);
      storage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      throw new Error('로그인 정보를 저장하지 못했어요. 브라우저 저장소를 확인해주세요.');
    }
  }

  return { accessToken, user };
}

export function clearAuth() {
  const storage = getStorage();
  storage?.removeItem(ACCESS_TOKEN_KEY);
  storage?.removeItem(USER_KEY);
}

// BE는 공통 응답 봉투 { isSuccess, code, message, result }로 감싸서 내려준다.
// 실패 응답도 같은 모양으로 오므로(HTTP 상태코드 + JSON body), 항상 JSON을 파싱해서
// isSuccess로 성공/실패를 판단하고, 성공이면 result만 꺼내서 반환한다.
async function request(path, options = {}) {
  const { auth = false, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  headers.set('Accept', 'application/json');
  if (typeof requestOptions.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const accessToken = auth ? getAccessToken() : null;
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${BASE_URL}${path}`, { ...requestOptions, headers });
  const responseText = await response.text();
  let body = {};
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      if (response.status === 401) clearAuth();
      throw new Error(`API ${path} 응답을 읽지 못했어요.`);
    }
  }
  if (!response.ok || body.isSuccess === false) {
    const errorCode = String(body.code ?? '');
    const isAuthError = response.status === 401
      || /(?:401|UNAUTHORIZED|TOKEN[_-]?EXPIRED|AUTH[_-]?EXPIRED)/i.test(errorCode);
    if (isAuthError) clearAuth();

    const error = new Error(body.message || `API ${path} failed: ${response.status}`);
    error.status = isAuthError ? 401 : response.status;
    error.code = body.code;
    throw error;
  }
  return body.result;
}

function post(path, payload, options = {}) {
  return request(path, { method: 'POST', body: JSON.stringify(payload), ...options });
}

export function signup({ email, password, nickname }) {
  clearAuth();
  return post('/v1/auth/signup', { email, password, nickname }, { auth: false });
}

export function login({ email, password }) {
  clearAuth();
  return post('/v1/auth/login', { email, password }, { auth: false });
}

export function fetchMyProfile({ signal } = {}) {
  return request('/v1/members/me', { signal, auth: true });
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function fetchPlaces({ category, district, tag, filmingContentType, keyword, page = 0, size = 10, signal } = {}) {
  return request(`/places${toQuery({ category, district, tag, filmingContentType, keyword, page, size })}`, { signal });
}

export function fetchKakaoPlaces(query, { latitude, longitude, radius, signal } = {}) {
  return request(`/place-search/kakao${toQuery({ query, latitude, longitude, radius })}`, { signal });
}

export function fetchMapPlaces({ category, tag, minLat, maxLat, minLng, maxLng, limit = 300, signal } = {}) {
  return request(`/places/map${toQuery({ category, tag, minLat, maxLat, minLng, maxLng, limit })}`, { signal });
}

export function fetchRouteComparison({ origin, destination, signal } = {}) {
  const coordinate = (value) => ({
    latitude: value?.latitude,
    longitude: value?.longitude,
  });
  return post('/routes/compare', {
    origin: coordinate(origin),
    destination: coordinate(destination),
  }, { signal });
}

export function fetchJongnoCongestion({ signal } = {}) {
  return request('/citydata/congestion/jongno', { signal });
}

export function fetchPlace(id, { signal } = {}) {
  return request(`/places/${id}`, { signal });
}

export function addPlaceToCourseBasket(placeId, { signal } = {}) {
  return request(`/course-basket/places/${placeId}`, { method: 'POST', signal, auth: true });
}

export function addKakaoPlaceToCourseBasket(place, { signal } = {}) {
  const payload = {
    providerPlaceId: place.providerPlaceId,
    name: place.name,
    categoryName: place.categoryName ?? '',
    categoryGroupCode: place.categoryGroupCode ?? '',
    roadAddress: place.roadAddress ?? '',
    lotAddress: place.lotAddress ?? '',
    longitude: Number(place.longitude),
    latitude: Number(place.latitude),
    phone: place.phone ?? '',
  };
  return post('/course-basket/kakao-places', payload, { signal, auth: true });
}

export function fetchCourseBasketPlaces({ signal } = {}) {
  return request('/course-basket/places', { signal, auth: true });
}

export function fetchPlaceFilmingLocations(placeId) {
  return request(`/places/${placeId}/filming-locations`);
}

export function fetchEvents({ keyword, status, sortMode, latitude, longitude, page = 0, size = 10, signal } = {}) {
  return request(`/events${toQuery({ keyword, status, sortMode, latitude, longitude, page, size })}`, { signal });
}

export function fetchEvent(id, { signal } = {}) {
  return request(`/events/${id}`, { signal });
}

export function fetchMediaContents({ page = 0, size = 10, signal } = {}) {
  return request(`/media-contents${toQuery({ page, size })}`, { signal });
}

export function fetchFilmingWorks({ contentType, page = 0, size = 12, signal } = {}) {
  return request(`/media-contents/filming-works${toQuery({ contentType, page, size })}`, { signal });
}

export function fetchMediaContent(id, { signal } = {}) {
  return request(`/media-contents/${id}`, { signal });
}

export function fetchMediaFilmingLocations(mediaContentId, { signal } = {}) {
  return request(`/media-contents/${mediaContentId}/filming-locations`, { signal });
}
