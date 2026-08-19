const FALLBACK_DWELL_MINUTES = 60;
const MIN_DWELL_MINUTES = 10;
const MAX_DWELL_MINUTES = 1440;

function normalizeDwellMinutes(value, fallback = FALLBACK_DWELL_MINUTES) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 1) return fallback;
  return Math.min(MAX_DWELL_MINUTES, Math.max(MIN_DWELL_MINUTES, Math.round(minutes)));
}

export function createCourseStopSettings(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const defaultDwellMinutes = normalizeDwellMinutes(item?.defaultDwellMinutes);
    return {
      basketItemId: item?.id,
      defaultDwellMinutes,
      dwellMinutes: defaultDwellMinutes,
      hasArrivalDeadline: false,
      arrivalDeadline: '',
    };
  });
}

export function reconcileCourseStopSettings(items, currentSettings) {
  const existingById = new Map(
    (Array.isArray(currentSettings) ? currentSettings : [])
      .map((setting) => [String(setting.basketItemId), setting]),
  );
  return createCourseStopSettings(items).map((created) => {
    const existing = existingById.get(String(created.basketItemId));
    return existing ? { ...existing, defaultDwellMinutes: created.defaultDwellMinutes } : created;
  });
}

export function updateCourseStopSetting(settings, basketItemId, patch) {
  return (Array.isArray(settings) ? settings : []).map((setting) => {
    if (setting.basketItemId !== basketItemId) return setting;
    const next = { ...setting, ...patch };
    if (Object.hasOwn(patch, 'dwellMinutes')) {
      next.dwellMinutes = normalizeDwellMinutes(patch.dwellMinutes, MIN_DWELL_MINUTES);
    }
    if (patch.hasArrivalDeadline === false) next.arrivalDeadline = '';
    return next;
  });
}

export function buildCoursePreviewPlaces(settings) {
  return (Array.isArray(settings) ? settings : []).map((setting) => ({
    basketItemId: setting.basketItemId,
    dwellMinutes: normalizeDwellMinutes(setting.dwellMinutes),
    arrivalDeadline: setting.hasArrivalDeadline && setting.arrivalDeadline
      ? setting.arrivalDeadline
      : null,
  }));
}
