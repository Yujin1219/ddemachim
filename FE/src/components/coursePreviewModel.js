function normalizeTime(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value || '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function congestionNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function isValidServiceDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function buildCoursePreviewRequest(draft, places) {
  return {
    serviceDate: draft?.serviceDate,
    desiredStartTime: draft?.desiredStartTime,
    start: {
      type: draft?.start?.type,
      name: draft?.start?.name,
      latitude: draft?.start?.latitude,
      longitude: draft?.start?.longitude,
    },
    places: (Array.isArray(places) ? places : []).map((place) => ({
      basketItemId: place?.basketItemId,
      dwellMinutes: place?.dwellMinutes,
      arrivalDeadline: place?.arrivalDeadline || null,
    })),
  };
}

export function validateCoursePreviewRequest(payload) {
  const serviceDateValid = isValidServiceDate(payload?.serviceDate);
  const startTime = normalizeTime(payload?.desiredStartTime);
  const startType = payload?.start?.type;
  const latitude = payload?.start?.latitude;
  const longitude = payload?.start?.longitude;
  const startValid = (startType === 'CURRENT_LOCATION' || startType === 'SEARCHED_PLACE')
    && typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && (startType !== 'SEARCHED_PLACE' || Boolean(payload?.start?.name?.trim()));
  if (!serviceDateValid || !startTime || !startValid) {
    return '출발 위치와 날짜, 시간을 먼저 설정해주세요.';
  }

  const places = Array.isArray(payload?.places) ? payload.places : [];
  if (places.length === 0) return '코스에 포함할 장소를 1개 이상 담아주세요.';
  if (places.length > 5) return '코스에는 장소를 최대 5개까지 담을 수 있어요.';
  const settingsValid = places.every((place) => {
    const basketItemId = place?.basketItemId;
    const dwellMinutes = place?.dwellMinutes;
    const deadlineValid = place?.arrivalDeadline === null
      || place?.arrivalDeadline === undefined
      || Boolean(normalizeTime(place.arrivalDeadline));
    return typeof basketItemId === 'number' && Number.isSafeInteger(basketItemId) && basketItemId > 0
      && typeof dwellMinutes === 'number' && Number.isInteger(dwellMinutes) && dwellMinutes >= 1 && dwellMinutes <= 1440
      && deadlineValid;
  });
  if (!settingsValid) return '장소별 체류시간을 다시 확인해주세요.';
  const basketItemIds = places.map((place) => place?.basketItemId);
  if (new Set(basketItemIds).size !== basketItemIds.length) return '같은 장소는 코스에 한 번만 담을 수 있어요.';
  return null;
}

export function coursePreviewErrorMessage(error) {
  const code = String(error?.code || '').toUpperCase();
  if (error?.status === 401 || code.includes('401')) {
    return '로그인이 만료됐어요. 다시 로그인한 뒤 코스를 계산해주세요.';
  }
  if (code === 'COURSE4041') return '담아둔 장소가 변경됐어요. 장소 목록을 새로 확인해주세요.';
  if (code === 'COURSE4221') return '위치 정보가 없는 장소가 있어 코스를 만들 수 없어요. 장소 목록을 확인해주세요.';
  if (code === 'COURSE4222') return '입력한 조건으로 빠른 코스를 만들 수 없어요. 출발 시간이나 장소별 체류시간을 조정해주세요.';
  if (code === 'COMMON400' || code === 'COURSE4001') return '입력한 코스 조건을 다시 확인해주세요.';
  return '코스를 계산하지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.';
}

export function formatPreviewDuration(value) {
  const minutes = finiteNumber(value);
  if (minutes === null || minutes < 0) return '정보 없음';
  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  if (!hours) return `${remainder}분`;
  return remainder ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

export function formatPreviewDistance(value) {
  const meters = finiteNumber(value);
  if (meters === null || meters < 0) return '정보 없음';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1).replace(/\.0$/, '')}km`;
}

export function formatCongestionLevel(value) {
  const score = congestionNumber(value);
  if (score === null) return null;
  if (score < 16.5) return '여유';
  if (score < 50) return '보통';
  if (score < 83.5) return '약간 붐빔';
  return '붐빔';
}

function normalizeGeometry(geometry) {
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return null;
  const coordinates = geometry.coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
    const longitude = finiteNumber(coordinate[0]);
    const latitude = finiteNumber(coordinate[1]);
    if (longitude === null || latitude === null) return null;
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
    return [longitude, latitude];
  });
  if (coordinates.length < 2 || coordinates.some((coordinate) => coordinate === null)) return null;
  return { type: 'LineString', coordinates };
}

function normalizeStep(step) {
  return {
    streetName: step?.streetName || null,
    distanceMeters: finiteNumber(step?.distanceMeters),
    description: step?.description || null,
    geometry: normalizeGeometry(step?.geometry),
  };
}

function normalizeLeg(leg) {
  return {
    mode: leg?.mode || null,
    routeName: leg?.routeName || null,
    durationSeconds: finiteNumber(leg?.durationSeconds),
    distanceMeters: finiteNumber(leg?.distanceMeters),
    geometry: normalizeGeometry(leg?.geometry),
    steps: Array.isArray(leg?.steps) ? leg.steps.map(normalizeStep) : [],
  };
}

function normalizeRoute(route) {
  if (!route || typeof route !== 'object') return null;
  return {
    ...route,
    durationSeconds: finiteNumber(route.durationSeconds),
    distanceMeters: finiteNumber(route.distanceMeters),
    fareWon: finiteNumber(route.fareWon),
    transferCount: finiteNumber(route.transferCount),
    walkDistanceMeters: finiteNumber(route.walkDistanceMeters),
    legs: Array.isArray(route.legs) ? route.legs.map(normalizeLeg) : [],
  };
}

export function flattenRouteLegs(stops) {
  return stops.flatMap((stop) => (stop.selectedRoute?.legs || stop.incomingRoute?.legs || []).flatMap((leg) => {
    if (leg.geometry) return [leg];
    if (leg.mode !== 'WALK') return [];
    return leg.steps
      .filter((step) => step.geometry)
      .map((step) => ({
        mode: 'WALK',
        routeName: leg.routeName,
        durationSeconds: null,
        distanceMeters: step.distanceMeters,
        streetName: step.streetName,
        description: step.description,
        geometry: step.geometry,
        steps: [step],
      }));
  }));
}

function routeDurationMinutes(route) {
  if (!route || route.status !== 'AVAILABLE' || route.durationSeconds === null || route.durationSeconds === undefined) {
    return null;
  }
  return route.durationSeconds >= 0 ? Math.ceil(route.durationSeconds / 60) : null;
}

function routeDistanceMeters(route) {
  if (!route || route.status !== 'AVAILABLE' || route.distanceMeters === null || route.distanceMeters === undefined) {
    return null;
  }
  return route.distanceMeters >= 0 ? route.distanceMeters : null;
}

function minutesFromTime(value) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return (hours * 60) + minutes;
}

function timelineMinutes(value, notBefore = null) {
  const minutes = minutesFromTime(value);
  if (minutes === null) return null;
  if (!Number.isFinite(notBefore)) return minutes;
  return minutes + (Math.max(0, Math.ceil((notBefore - minutes) / 1440)) * 1440);
}

function formatTimelineTime(minutes) {
  if (!Number.isFinite(minutes)) return null;
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function offsetMetric(value, delta) {
  return Number.isFinite(value) && Number.isFinite(delta) ? value + delta : value;
}

export function stopRouteSelectionKey(stop, index = 0) {
  return String(stop?.basketItemId ?? stop?.sequenceNo ?? index);
}

export function isTerrainEligibleRoute(route) {
  const duration = routeDurationMinutes(route);
  return route?.mode === 'WALK' && duration !== null && duration <= 20;
}

/**
 * Keeps the server response as the scheduling baseline. A shorter route uses
 * existing server-side waiting/fixed-time slack before changing later stops;
 * a longer route propagates only the resulting overrun.
 */
export function applyRouteSelections(preview, selections = {}) {
  if (!preview || !Array.isArray(preview.stops)) return preview;
  let totalTravelDurationDelta = 0;
  let cumulativeDistanceDelta = 0;
  let hasTravelDurationDelta = false;
  let hasDistanceDelta = false;
  let scheduleRecalculated = false;
  let previousBaselineDeparture = timelineMinutes(preview.scheduledStart);
  let previousAdjustedDeparture = previousBaselineDeparture;
  let lastBaselineDeparture = null;
  let lastScheduleShift = null;
  const selectionSignature = [];
  const stops = preview.stops.map((stop, index) => {
    const key = stopRouteSelectionKey(stop, index);
    const hasAlternative = Boolean(stop?.alternativeRoute);
    const useAlternative = hasAlternative && selections[key] === 'alternative';
    const selectedRoute = useAlternative ? stop.alternativeRoute : (stop.selectedRoute || stop.incomingRoute);
    const baselineRoute = stop.selectedRoute || stop.incomingRoute;
    const baselineDuration = routeDurationMinutes(baselineRoute);
    const selectedDuration = routeDurationMinutes(selectedRoute);
    const baselineDistance = routeDistanceMeters(baselineRoute);
    const selectedDistance = routeDistanceMeters(selectedRoute);
    if (useAlternative) {
      scheduleRecalculated = true;
      selectionSignature.push(`${key}:alternative`);
    }
    if (baselineDuration !== null && selectedDuration !== null) {
      totalTravelDurationDelta += selectedDuration - baselineDuration;
      hasTravelDurationDelta = true;
    }
    if (baselineDistance !== null && selectedDistance !== null) {
      cumulativeDistanceDelta += selectedDistance - baselineDistance;
      hasDistanceDelta = true;
    }
    const baselineArrival = timelineMinutes(stop.scheduledArrival, previousBaselineDeparture);
    const baselineDeparture = timelineMinutes(stop.scheduledDeparture, baselineArrival);
    const canRecalculateSchedule = baselineDuration !== null
      && selectedDuration !== null
      && baselineArrival !== null
      && baselineDeparture !== null
      && baselineDeparture >= baselineArrival
      && previousAdjustedDeparture !== null;
    const adjustedArrival = canRecalculateSchedule
      ? Math.max(baselineArrival, previousAdjustedDeparture + selectedDuration)
      : baselineArrival;
    const adjustedDeparture = canRecalculateSchedule
      ? adjustedArrival + (baselineDeparture - baselineArrival)
      : baselineDeparture;
    if (baselineDeparture !== null) {
      previousBaselineDeparture = baselineDeparture;
      lastBaselineDeparture = baselineDeparture;
    } else {
      previousBaselineDeparture = null;
    }
    previousAdjustedDeparture = adjustedDeparture;
    lastScheduleShift = canRecalculateSchedule ? adjustedDeparture - baselineDeparture : null;
    return {
      ...stop,
      selectedMode: selectedRoute?.mode || stop.selectedMode || null,
      selectedRoute,
      // Keep the legacy field as an alias so older consumers keep rendering the selected route.
      incomingRoute: selectedRoute,
      travelMinutesFromPrevious: selectedDuration === null ? stop.travelMinutesFromPrevious : selectedDuration,
      travelDistanceMeters: selectedDistance === null ? stop.travelDistanceMeters : selectedDistance,
      scheduledArrival: canRecalculateSchedule ? formatTimelineTime(adjustedArrival) : stop.scheduledArrival,
      scheduledDeparture: canRecalculateSchedule ? formatTimelineTime(adjustedDeparture) : stop.scheduledDeparture,
    };
  });
  if (!scheduleRecalculated) return preview;
  const travelDurationDelta = hasTravelDurationDelta ? totalTravelDurationDelta : 0;
  const distanceDelta = hasDistanceDelta ? cumulativeDistanceDelta : 0;
  const baselineScheduledEnd = timelineMinutes(preview.scheduledEnd, lastBaselineDeparture);
  const canRecalculateEnd = baselineScheduledEnd !== null && lastScheduleShift !== null;
  const timelineDurationDelta = canRecalculateEnd ? lastScheduleShift : 0;
  return {
    ...preview,
    stops,
    routeLegs: flattenRouteLegs(stops),
    totalTravelMinutes: offsetMetric(preview.totalTravelMinutes, travelDurationDelta),
    totalDurationMinutes: offsetMetric(preview.totalDurationMinutes, timelineDurationDelta),
    totalDistanceMeters: offsetMetric(preview.totalDistanceMeters, distanceDelta),
    scheduledEnd: canRecalculateEnd ? formatTimelineTime(baselineScheduledEnd + timelineDurationDelta) : preview.scheduledEnd,
    scheduleRecalculated,
    routeFitKey: `${preview.routeFitKey || 'preview'}|legs:${selectionSignature.join(',') || 'selected'}`,
  };
}

function normalizeStop(stop) {
  const selectedRoute = normalizeRoute(stop?.selectedRoute) || normalizeRoute(stop?.incomingRoute);
  return {
    ...stop,
    sequenceNo: finiteNumber(stop?.sequenceNo),
    basketItemId: finiteNumber(stop?.basketItemId),
    latitude: finiteNumber(stop?.latitude),
    longitude: finiteNumber(stop?.longitude),
    defaultDwellMinutes: finiteNumber(stop?.defaultDwellMinutes),
    dwellMinutes: finiteNumber(stop?.dwellMinutes),
    arrivalBufferMinutes: finiteNumber(stop?.arrivalBufferMinutes),
    travelMinutesFromPrevious: finiteNumber(stop?.travelMinutesFromPrevious),
    travelDistanceMeters: finiteNumber(stop?.travelDistanceMeters),
    ascentMeters: finiteNumber(stop?.ascentMeters),
    congestionScore: congestionNumber(stop?.congestionScore),
    scheduledArrival: normalizeTime(stop?.scheduledArrival),
    scheduledDeparture: normalizeTime(stop?.scheduledDeparture),
    arrivalDeadline: normalizeTime(stop?.arrivalDeadline),
    openTime: normalizeTime(stop?.openTime),
    closeTime: normalizeTime(stop?.closeTime),
    eventEndTime: normalizeTime(stop?.eventEndTime),
    selectedMode: stop?.selectedMode || selectedRoute?.mode || null,
    selectedRoute,
    alternativeRoute: normalizeRoute(stop?.alternativeRoute),
    // selectedRoute is the canonical field; incomingRoute remains its legacy alias.
    incomingRoute: selectedRoute,
  };
}

function normalizeOption(response, option) {
  if (!option || !Array.isArray(option.stops) || option.stops.length === 0) return null;
  const stops = option.stops
    .map(normalizeStop)
    .sort((left, right) => (left.sequenceNo ?? Number.MAX_SAFE_INTEGER) - (right.sequenceNo ?? Number.MAX_SAFE_INTEGER));
  const elevationComparisons = Array.isArray(option.elevationComparisons)
    ? option.elevationComparisons.map((item) => ({
      ...item,
      sequenceNo: finiteNumber(item?.sequenceNo),
      originalAscentMeters: finiteNumber(item?.originalAscentMeters),
      easyAscentMeters: finiteNumber(item?.easyAscentMeters),
      originalSteepUphillDistanceMeters: finiteNumber(item?.originalSteepUphillDistanceMeters),
      easySteepUphillDistanceMeters: finiteNumber(item?.easySteepUphillDistanceMeters),
      originalCoveragePercent: finiteNumber(item?.originalCoveragePercent),
      easyCoveragePercent: finiteNumber(item?.easyCoveragePercent),
    })) : [];

  return {
    ...option,
    generatedAt: response.generatedAt || null,
    stopCount: finiteNumber(option.stopCount),
    totalDurationMinutes: finiteNumber(option.totalDurationMinutes),
    totalTravelMinutes: finiteNumber(option.totalTravelMinutes),
    totalDistanceMeters: finiteNumber(option.totalDistanceMeters),
    totalAscentMeters: finiteNumber(option.totalAscentMeters),
    averageCongestionScore: congestionNumber(option.averageCongestionScore),
    elevationComparisons,
    serviceDate: response.serviceDate || null,
    desiredStartTime: normalizeTime(response.desiredStartTime),
    scheduledStart: normalizeTime(option.scheduledStart),
    scheduledEnd: normalizeTime(option.scheduledEnd),
    stops,
    routeLegs: flattenRouteLegs(stops),
    routeFitKey: [
      response.generatedAt || 'preview',
      option.strategy,
      ...stops.map((stop) => `${stop.basketItemId}:${stop.sequenceNo}:${stop.scheduledArrival}`),
    ].join('|'),
  };
}

export function normalizeCoursePreview(response) {
  const options = Array.isArray(response?.options)
    ? response.options
      .filter((option) => option?.strategy === 'FAST' || option?.strategy === 'EASY' || option?.strategy === 'QUIET')
      .map((option) => normalizeOption(response, option))
      .filter(Boolean)
    : [];
  const fast = options.find((option) => option.strategy === 'FAST');
  if (!fast) return null;
  return { ...fast, options };
}
