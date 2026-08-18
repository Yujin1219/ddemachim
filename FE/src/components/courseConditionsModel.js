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

export function formatCourseDateLabel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return '선택 필요';
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return '선택 필요';
  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return `${Number(month)}월 ${Number(day)}일 ${weekdays[date.getDay()]}`;
}

export function formatCourseTimeLabel(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return '선택 필요';
  const hour = Number(match[1]);
  const minute = match[2];
  if (hour > 23 || Number(minute) > 59) return '선택 필요';
  const period = hour < 12 ? '오전' : '오후';
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${minute}`;
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
