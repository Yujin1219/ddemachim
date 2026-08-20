import React from 'react';

const h = React.createElement;

export const VISIBLE_TREND_STATUSES = ['TRENDING', 'WATCH'];

export const TREND_STATUS_LABELS = {
  TRENDING: '요즘 많이 언급돼요',
  WATCH: '관심이 이어져요',
};

export function isVisiblePlaceTrend(trend) {
  return Boolean(trend && VISIBLE_TREND_STATUSES.includes(trend.status));
}

export function getVisiblePlaceTrends(places) {
  return (Array.isArray(places) ? places : []).filter((place) => isVisiblePlaceTrend(place?.trend));
}

export function getTrendStatusLabel(status) {
  return TREND_STATUS_LABELS[status] || null;
}

export function getTrendChangeLabel(interestChangePercent) {
  if (typeof interestChangePercent !== 'number' || !Number.isFinite(interestChangePercent)) return null;
  if (interestChangePercent === 0) return null;

  const percent = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 })
    .format(Math.abs(interestChangePercent));
  const direction = interestChangePercent > 0 ? '늘었어요' : '줄었어요';
  return `이전 기간보다 검색 관심도가 ${percent}% ${direction}`;
}

export function getPlaceTrendSearchText(place) {
  const toSearchText = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return String(value).trim();
  };
  return [
    place?.name,
    place?.categoryLabel,
    place?.district,
    getTrendStatusLabel(place?.trend?.status),
  ].map(toSearchText).filter(Boolean).join(' ');
}

export function getPlaceTrendCardProps(place, fallbackImage) {
  const placeId = place?.placeId ?? place?.id;
  return {
    id: placeId,
    name: place?.name,
    meta: [place?.district, place?.categoryLabel].filter(Boolean).join(' · '),
    image: place?.imageUrl || fallbackImage,
    badge: getTrendStatusLabel(place?.trend?.status),
    latitude: place?.latitude,
    longitude: place?.longitude,
  };
}

function trendDateLabel(updatedAt) {
  const rawDate = typeof updatedAt === 'string' || typeof updatedAt === 'number'
    ? String(updatedAt).trim()
    : '';
  const match = rawDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return rawDate || '정보 없음';
  return `${match[1]}.${match[2].padStart(2, '0')}.${match[3].padStart(2, '0')}`;
}

function TrendStatus({ status }) {
  const label = getTrendStatusLabel(status);
  if (!label) return null;
  return h('span', { className: `place-trend-status is-${status.toLowerCase()}` }, label);
}

export function PlaceTrendSection({
  trends = [],
  isLoading = false,
  error = false,
  onRetry,
  onPlaceSelect,
  onViewAll,
  renderCards,
  renderSection,
}) {
  const visiblePlaces = getVisiblePlaceTrends(trends);
  const content = typeof renderCards === 'function'
    ? renderCards({ places: visiblePlaces, isLoading, error, onRetry, onPlaceSelect })
    : h('p', { className: 'explore-inline-state' }, '트렌드 장소 목록을 표시할 수 없어요.');
  const sectionProps = {
    title: '요즘 이곳에서는',
    subtitle: '상태가 확인된 장소를 모아봤어요.',
    action: typeof onViewAll === 'function' ? '전체보기' : undefined,
    onAction: onViewAll,
    children: content,
  };

  if (typeof renderSection === 'function') return renderSection(sectionProps);

  return h(
    'section',
    { className: 'content-section', 'aria-label': '요즘 이곳에서는' },
    h('div', { className: 'section-title-row' }, h('h2', null, sectionProps.title)),
    h('p', { className: 'section-subtitle' }, sectionProps.subtitle),
    content,
  );
}

export function PlaceTrendReason({ trend }) {
  if (!isVisiblePlaceTrend(trend)) return null;
  const changeLabel = getTrendChangeLabel(trend.interestChangePercent);

  return h(
    'section',
    { className: 'content-section place-trend-reason', 'aria-labelledby': 'place-trend-reason-title' },
    h(
      'div',
      { className: 'section-title-row' },
      h('h2', { id: 'place-trend-reason-title' }, '트렌드 상태'),
      h(TrendStatus, { status: trend.status }),
    ),
    h(
      'div',
      { className: 'why-card place-trend-reason-card' },
      changeLabel ? h('strong', { className: 'place-trend-change' }, changeLabel) : null,
      h('p', null, h('time', { dateTime: trend.updatedAt || undefined }, `관찰일 ${trendDateLabel(trend.updatedAt)}`)),
    ),
  );
}

export default PlaceTrendSection;
