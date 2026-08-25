const AFFIRMATIVE_COURSE_PATTERN = /^(?:응|웅|어|네|예|그래|좋아|오케이|ㅇㅇ|진행해|만들어|생성해)(?:요|줘|주세요|\s.*)?$/u;

export function isAiCourseConfirmation(value) {
  const message = String(value || '').trim().replace(/[.!?]+$/u, '');
  if (!message || /^(?:아니|아니요|취소|잠깐)/u.test(message)) return false;
  return AFFIRMATIVE_COURSE_PATTERN.test(message)
    || /^(?:이대로|그대로|네\s+|예\s+).*(?:생성|만들|진행)/u.test(message);
}

export function buildAiCourseDraft(proposal) {
  const start = proposal?.startLocation || {};
  return {
    serviceDate: proposal?.date || null,
    desiredStartTime: proposal?.startTime || null,
    startTiming: 'SCHEDULED',
    start: {
      type: 'CURRENT_LOCATION',
      latitude: Number(start.latitude),
      longitude: Number(start.longitude),
      name: start.name || '출발지',
    },
  };
}

function selectedAiCourseOption(preview, strategy) {
  const options = Array.isArray(preview?.options) ? preview.options : [];
  return options.find((option) => option?.strategy === strategy)
    || (preview?.strategy === strategy ? preview : null)
    || options.find((option) => option?.strategy === 'FAST')
    || preview
    || null;
}

export function getAiCoursePreviewPlaceIds(preview, strategy) {
  const stops = selectedAiCourseOption(preview, strategy)?.stops;
  if (!Array.isArray(stops)) return [];
  return stops.map((stop) => Number(stop?.placeId))
    .filter((placeId) => Number.isSafeInteger(placeId) && placeId > 0);
}

export function buildAiCourseSaveInput(preview, strategy, basketItems, routeSelections = {}) {
  const stops = selectedAiCourseOption(preview, strategy)?.stops;
  if (!Array.isArray(stops) || stops.length === 0) return null;
  const basketItemByPlaceId = new Map((Array.isArray(basketItems) ? basketItems : [])
    .map((item) => [Number(item?.placeId), item]));
  const places = [];
  const mappedRouteSelections = {};

  for (const stop of stops) {
    const placeId = Number(stop?.placeId);
    const basketItem = basketItemByPlaceId.get(placeId);
    const basketItemId = Number(basketItem?.id);
    const dwellMinutes = Number(stop?.dwellMinutes);
    if (!Number.isSafeInteger(placeId) || placeId <= 0
      || !Number.isSafeInteger(basketItemId) || basketItemId <= 0
      || !Number.isInteger(dwellMinutes) || dwellMinutes < 1) return null;
    places.push({ basketItemId, dwellMinutes, arrivalDeadline: null });
    const selectedRoute = routeSelections[String(stop?.basketItemId ?? stop?.sequenceNo)];
    if (selectedRoute) mappedRouteSelections[basketItemId] = selectedRoute;
  }

  return { places, routeSelections: mappedRouteSelections };
}
