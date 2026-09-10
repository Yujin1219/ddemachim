import { withBasePath } from '../utils/appPath.js';
const BASE_URL = withBasePath('/api');
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

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...requestOptions, headers });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    const error = new Error('백엔드 서버에 연결할 수 없습니다. 서버와 프록시 상태를 확인해주세요.');
    error.name = 'ApiRequestError';
    error.status = 0;
    error.code = 'NETWORK_ERROR';
    error.path = path;
    error.method = requestOptions.method || 'GET';
    error.cause = cause;
    throw error;
  }
  let responseText;
  try {
    responseText = await response.text();
  } catch (cause) {
    const error = new Error('서버 응답을 받는 중 연결이 끊어졌습니다.');
    error.name = 'ApiRequestError';
    error.status = response.status;
    error.code = 'RESPONSE_READ_ERROR';
    error.path = path;
    error.method = requestOptions.method || 'GET';
    error.cause = cause;
    throw error;
  }
  let body = {};
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      if (auth && response.status === 401) clearAuth();
      const error = new Error(`API ${path} 응답을 JSON으로 읽지 못했습니다.`);
      error.name = 'ApiRequestError';
      error.status = response.status;
      error.code = 'INVALID_RESPONSE';
      error.path = path;
      error.method = requestOptions.method || 'GET';
      throw error;
    }
  }
  if (!response.ok || body.isSuccess === false) {
    const errorCode = String(body.code ?? '');
    const isAuthError = response.status === 401
      || /(?:401|UNAUTHORIZED|TOKEN[_-]?EXPIRED|AUTH[_-]?EXPIRED)/i.test(errorCode);
    if (auth && isAuthError) clearAuth();

    const error = new Error(body.message || `API ${path} failed: ${response.status}`);
    error.name = 'ApiRequestError';
    error.status = isAuthError ? 401 : response.status;
    error.code = body.code;
    error.path = path;
    error.method = requestOptions.method || 'GET';
    if (path === '/courses/preview' && response.status === 422 && body.code === 'COURSE4222') {
      error.result = body.result;
    }
    throw error;
  }
  return body.result;
}

const AI_GUIDE_ERROR_PRESENTATIONS = {
  AIGUIDE5032: {
    title: '현재 이용할 수 없습니다',
    message: 'AI 가이드가 잠시 중단되어 있어요. 나중에 다시 이용해주세요.',
    unavailable: true,
  },
  AIGUIDE4291: {
    title: 'OpenAI 사용량 한도를 초과했어요',
    message: 'OpenAI API의 분당 요청 한도와 프로젝트 결제 크레딧을 확인한 뒤 다시 시도해주세요.',
  },
  AIGUIDE5031: {
    title: 'AI 가이드 설정이 필요해요',
    message: '백엔드 실행 환경의 OPENAI_API_KEY, OPENAI_MODEL(예: gpt-4.1-mini), OPENAI_BASE_URL을 확인한 뒤 서버를 재시작해주세요.',
  },
  AIGUIDE5021: {
    title: 'OpenAI 서버에 연결하지 못했어요',
    message: '백엔드는 실행 중이지만 OpenAI API 호출에 실패했습니다. 네트워크와 API 키의 프로젝트 상태를 확인해주세요.',
  },
  AIGUIDE5041: {
    title: 'OpenAI 응답 시간이 초과됐어요',
    message: '요청 처리 시간이 제한을 넘었습니다. 잠시 후 질문을 짧게 바꿔 다시 시도해주세요.',
  },
  AIGUIDE5022: {
    title: 'OpenAI 응답 형식이 올바르지 않아요',
    message: '모델이 해석할 수 없는 응답을 보냈습니다. 다시 시도해도 반복되면 백엔드 로그를 확인해주세요.',
  },
  AIGUIDE5023: {
    title: '도구 호출 인자를 해석하지 못했어요',
    message: 'OpenAI가 지원하지 않는 형식으로 함수를 요청했습니다. 질문을 조금 더 구체적으로 작성해주세요.',
  },
  AIGUIDE5024: {
    title: '지원하지 않는 도구가 요청됐어요',
    message: '현재 AI 가이드가 처리할 수 없는 기능입니다. 백엔드의 Tool 등록 상태를 확인해주세요.',
  },
  AIGUIDE4221: {
    title: '도구 호출이 너무 많이 반복됐어요',
    message: '필요한 장소·날짜·출발지 정보를 한 번에 알려주거나 새 대화로 다시 시도해주세요.',
  },
  NETWORK_ERROR: {
    title: '백엔드 서버에 연결하지 못했어요',
    message: 'localhost:8080의 백엔드와 Vite 프록시 설정을 확인한 뒤 다시 시도해주세요.',
  },
  INVALID_RESPONSE: {
    title: '서버 응답을 읽지 못했어요',
    message: '프록시가 JSON이 아닌 오류 페이지를 반환했을 수 있습니다. 백엔드와 Vite 터미널 로그를 확인해주세요.',
  },
  RESPONSE_READ_ERROR: {
    title: '응답을 받는 중 연결이 끊겼어요',
    message: '백엔드가 처리 중 종료됐거나 프록시 연결이 끊겼습니다. 두 서버의 터미널 로그를 확인해주세요.',
  },
};

export function getAiGuideErrorPresentation(error) {
  const code = String(error?.code || '');
  const status = Number.isFinite(error?.status) ? error.status : null;
  const known = AI_GUIDE_ERROR_PRESENTATIONS[code];
  const fallback = status === 401
    ? { title: '로그인이 필요해요', message: '다시 로그인한 뒤 AI 가이드 요청을 보내주세요.' }
    : { title: 'AI 가이드 요청에 실패했어요', message: error?.message || '잠시 후 다시 시도해주세요.' };

  return {
    ...(known || fallback),
    code: code || null,
    status,
    technical: known?.unavailable ? null : [status ? `HTTP ${status}` : null, code || null].filter(Boolean).join(' · '),
  };
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

export function sendAiGuideMessage({ message, history = [], currentLocation = null, previousResponseId = null, signal } = {}) {
  return post('/v1/ai-guide/chats', {
    message, history, currentLocation, previousResponseId,
  }, { signal, auth: true });
}

export function createAiCoursePreview(proposal, { signal } = {}) {
  return post('/v1/ai-courses/preview', proposal, { signal, auth: true });
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

export function fetchPlaceTrends({ limit = 6, signal } = {}) {
  return request(`/places/trends${toQuery({ limit })}`, { signal });
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

export function fetchMockCrowdingPoints(points, { at, signal } = {}) {
  const payload = { points };
  if (at !== undefined && at !== null && at !== '') {
    payload.at = at instanceof Date ? at.toISOString() : at;
  }
  return post('/v1/crowding/points', payload, { signal });
}

export function fetchMockCrowdingGrids(
  { minLat, maxLat, minLng, maxLng } = {},
  { at, signal } = {},
) {
  const requestAt = at instanceof Date ? at.toISOString() : at;
  return request(`/v1/crowding/grids${toQuery({
    minLat,
    maxLat,
    minLng,
    maxLng,
    at: requestAt,
  })}`, { signal });
}

export function fetchPlace(id, { signal } = {}) {
  return request(`/places/${id}`, { signal });
}

export function addPlaceToCourseBasket(placeId, { signal, imageUrl } = {}) {
  return request(`/course-basket/places/${placeId}${toQuery({ imageUrl })}`, { method: 'POST', signal, auth: true });
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
    imageUrl: place.imageUrl ?? '',
  };
  return post('/course-basket/kakao-places', payload, { signal, auth: true });
}

export function fetchCourseBasketPlaces({ signal } = {}) {
  return request('/course-basket/places', { signal, auth: true });
}

export function deleteCourseBasketPlace(basketItemId, { signal } = {}) {
  return request(`/course-basket/places/${basketItemId}`, { method: 'DELETE', signal, auth: true });
}

export function fetchCoursePreview(payload, { signal } = {}) {
  return post('/courses/preview', payload, { signal, auth: true });
}

export function createCourse(payload, { signal } = {}) {
  return post('/courses', payload, { signal, auth: true });
}

export function fetchCourses({ status, signal } = {}) {
  return request(`/courses${toQuery({ status })}`, { signal, auth: true });
}

export function fetchCourse(courseId, { signal } = {}) {
  return request(`/courses/${courseId}`, { signal, auth: true });
}

export function startCourse(courseId, { replaceActive = false, signal } = {}) {
  return post(`/courses/${courseId}/start`, { replaceActive }, { signal, auth: true });
}

export function completeCourse(courseId, { signal } = {}) {
  return post(`/courses/${courseId}/complete`, {}, { signal, auth: true });
}

export function replanCourse(courseId, payload, { signal } = {}) {
  return post(`/courses/${courseId}/replan`, payload, { signal, auth: true });
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

export function fetchFilmingWorks({ contentType, keyword, page = 0, size = 12, signal } = {}) {
  return request(`/media-contents/filming-works${toQuery({ contentType, keyword, page, size })}`, { signal });
}

export function fetchMediaContent(id, { signal } = {}) {
  return request(`/media-contents/${id}`, { signal });
}

export function fetchMediaFilmingLocations(mediaContentId, { signal } = {}) {
  return request(`/media-contents/${mediaContentId}/filming-locations`, { signal });
}

export function fetchFilmingLocation(filmingLocationId, { signal } = {}) {
  return request(`/filming-locations/${filmingLocationId}`, { signal });
}
