const TIME_STEP_MINUTES = 10;
const DEFAULT_DURATION_MINUTES = 5 * 60;

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMinutes(totalMinutes) {
  const boundedMinutes = Math.max(0, Math.min(totalMinutes, (24 * 60) - 1));
  return `${pad(Math.floor(boundedMinutes / 60))}:${pad(boundedMinutes % 60)}`;
}

export function createCourseConditionDefaults(now = new Date()) {
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  const roundedStartMinutes = Math.ceil(currentMinutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return {
    serviceDate: formatDate(now),
    desiredStartTime: formatMinutes(roundedStartMinutes),
    desiredEndTime: formatMinutes(roundedStartMinutes + DEFAULT_DURATION_MINUTES),
  };
}

export function isCourseTimeRangeValid(startTime, endTime) {
  return Boolean(startTime && endTime && endTime > startTime);
}

export function normalizeCourseStartPlace(place) {
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  if (!place?.name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    type: 'SEARCHED_PLACE',
    name: place.name,
    address: place.roadAddress || place.lotAddress || '주소 정보 없음',
    latitude,
    longitude,
  };
}
