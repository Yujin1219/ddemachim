export const routeGroups = Object.freeze({
  auth: ['splash', 'intro', 'login', 'signup'],
  discovery: ['map', 'explore', 'place', 'event-detail', 'search', 'search-empty', 'saved', 'trending', 'filming-locations', 'popups', 'live-talk', 'ai-guide'],
  course: ['course-home', 'course-conditions', 'course-place-times', 'basket', 'basket-natural', 'basket-glass', 'compare', 'route-map', 'saved-course-preview'],
  travel: ['progress', 'arrival', 'navigation', 'reroute', 'reroute-applied', 'transit', 'taxi', 'nearby', 'nearby-added', 'nearby-arrival', 'active-course', 'next-stop', 'gps-error', 'taxi-handoff', 'offline', 'closed-place', 'stop-course'],
  filming: ['onsite', 'filming-work', 'filming-content', 'nearby-filming', 'camera', 'scene-list', 'scene-detail', 'shot-result', 'photo-saved', 'image-missing', 'filming-restricted', 'report'],
  record: ['complete', 'record', 'saved-courses', 'record-detail', 'write-review', 'reviews', 'review-detail'],
  my: ['my', 'location-permission', 'notifications', 'profile-edit', 'privacy', 'app-permissions', 'support', 'loading', 'server-error'],
});

export const detailReturnRoutes = new Set(['place', 'event-detail', 'filming-work']);
export const routes = new Set(Object.values(routeGroups).flat());
export const rootRoutes = Object.freeze({
  map: 'map',
  explore: 'explore',
  assistant: 'ai-guide',
  course: 'course-home',
  my: 'my',
});

export function destinationAfterSignup() {
  return rootRoutes.map;
}

const DETAIL_RETURN_STORAGE_KEY = 'ddemachim.detail-return-routes';

function browserSessionStorage() {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

function readDetailReturnRoutes(storage = browserSessionStorage()) {
  if (!storage) return {};
  try {
    const stored = JSON.parse(storage.getItem(DETAIL_RETURN_STORAGE_KEY) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

export function rememberDetailReturnRoute(detailHash, returnHash, storage = browserSessionStorage()) {
  if (!storage || !detailHash?.startsWith('#/') || !returnHash?.startsWith('#/') || detailHash === returnHash) return;
  try {
    storage.setItem(DETAIL_RETURN_STORAGE_KEY, JSON.stringify({
      ...readDetailReturnRoutes(storage),
      [detailHash]: returnHash,
    }));
  } catch {
    // 세션 저장소를 사용할 수 없는 환경에서는 각 상세 화면의 기본 경로를 사용한다.
  }
}

export function detailReturnRouteFor(detailHash, storage = browserSessionStorage()) {
  const returnHash = readDetailReturnRoutes(storage)[detailHash];
  if (typeof returnHash !== 'string' || !returnHash.startsWith('#/') || returnHash === detailHash) return null;
  const [screen, id] = returnHash.replace(/^#\/?/, '').split('/');
  return routes.has(screen) ? { screen, id: id || null } : null;
}
