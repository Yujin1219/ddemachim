const BASE_URL = '/api';

// BE는 공통 응답 봉투 { isSuccess, code, message, result }로 감싸서 내려준다.
// 실패 응답도 같은 모양으로 오므로(HTTP 상태코드 + JSON body), 항상 JSON을 파싱해서
// isSuccess로 성공/실패를 판단하고, 성공이면 result만 꺼내서 반환한다.
async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const body = await response.json();
  if (!response.ok || body.isSuccess === false) {
    throw new Error(body.message || `API ${path} failed: ${response.status}`);
  }
  return body.result;
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function fetchPlaces({ category, district, tag, keyword, page = 0, size = 10 } = {}) {
  return request(`/places${toQuery({ category, district, tag, keyword, page, size })}`);
}

export function fetchMapPlaces({ category, tag, minLat, maxLat, minLng, maxLng, limit = 300, signal } = {}) {
  return request(`/places/map${toQuery({ category, tag, minLat, maxLat, minLng, maxLng, limit })}`, { signal });
}

export function fetchPlace(id) {
  return request(`/places/${id}`);
}

export function fetchPlaceFilmingLocations(placeId) {
  return request(`/places/${placeId}/filming-locations`);
}

export function fetchEvents({ keyword, page = 0, size = 10 } = {}) {
  return request(`/events${toQuery({ keyword, page, size })}`);
}

export function fetchEvent(id) {
  return request(`/events/${id}`);
}

export function fetchMediaContents({ page = 0, size = 10 } = {}) {
  return request(`/media-contents${toQuery({ page, size })}`);
}

export function fetchMediaContent(id) {
  return request(`/media-contents/${id}`);
}

export function fetchMediaFilmingLocations(mediaContentId) {
  return request(`/media-contents/${mediaContentId}/filming-locations`);
}
