import { buildSceneHash, normalizeFilmingLocationId } from './routes.js';

const SCENE_ROUTE_NAMES = new Set(['scene-detail', 'camera', 'shot-result']);

export function createSceneNavigationTarget(screen, id) {
  if (!SCENE_ROUTE_NAMES.has(screen)) return null;
  const normalizedId = normalizeFilmingLocationId(id);
  const hash = buildSceneHash(screen, normalizedId);
  return hash ? { screen, id: normalizedId, hash } : null;
}

export function sceneRouteMotion(screen, reducedMotion) {
  if (!['camera', 'shot-result'].includes(screen)) return null;
  return reducedMotion
    ? { initial: false, animate: { opacity: 1 }, transition: { duration: 0 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.16, ease: 'easeOut' } };
}

export function startCameraGesture({ id, isReferenceReady, controller, onStarting, navigate }) {
  const normalizedId = normalizeFilmingLocationId(id);
  if (!normalizedId || !isReferenceReady) return null;
  const pending = controller.start(normalizedId);
  onStarting?.(pending);
  navigate?.('camera', normalizedId);
  return pending;
}

export function resultGuardDestination({ id, captured }) {
  const normalizedId = normalizeFilmingLocationId(id);
  if (!normalizedId) return { screen: 'map', id: null, replace: true, notice: 'invalid-scene' };
  if (!captured) return { screen: 'scene-detail', id: normalizedId, replace: true, notice: 'capture-missing' };
  return null;
}
