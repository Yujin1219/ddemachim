const SCENE_SCREENS = new Set(['scene-detail', 'camera', 'shot-result']);

export function normalizeFilmingLocationId(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : null;
}

export function buildSceneHash(screen, id) {
  const normalizedId = normalizeFilmingLocationId(id);
  if (!SCENE_SCREENS.has(screen) || !normalizedId) return null;
  return `#/${screen}/${normalizedId}`;
}

export function parseSceneHash(hash) {
  const [screen, rawId, extra] = String(hash ?? '').replace(/^#\/?/, '').split('/');
  const id = normalizeFilmingLocationId(rawId);
  if (!SCENE_SCREENS.has(screen) || !id || extra) return { screen: null, id: null };
  return { screen, id };
}

export function guardSceneRouteHash(hash) {
  const candidate = String(hash ?? '').replace(/^#\/?/, '').split('/')[0];
  if (!SCENE_SCREENS.has(candidate)) return null;
  const parsed = parseSceneHash(hash);
  return parsed.screen
    ? { ...parsed, replaceHash: null }
    : { screen: 'map', id: null, replaceHash: '#/map' };
}
