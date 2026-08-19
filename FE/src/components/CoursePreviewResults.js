import React, { useState } from 'react';

import {
  applyRouteSelections,
  formatCongestionLevel,
  formatPreviewDistance,
  formatPreviewDuration,
  isTerrainEligibleRoute,
  stopRouteSelectionKey,
} from './coursePreviewModel.js';

const MODE_LABELS = {
  WALK: '도보',
  TRANSIT: '대중교통',
  TAXI: '택시',
};

const STRATEGY_OPTIONS = [
  { strategy: 'FAST', label: '빠른 길', name: '빠른', description: '이동 시간을 줄여요' },
  { strategy: 'EASY', label: '편한 길', name: '편한', description: '오르막을 줄여요' },
  { strategy: 'QUIET', label: '한적한 길', name: '한적한', description: '혼잡도를 낮춰요' },
];

const COURSE_PREVIEW_ROUTE_FIT_PADDING = [20, 20, 20, 20];

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function routeMetric(route) {
  if (!route || route.status !== 'AVAILABLE') return '경로 정보 없음';
  const duration = route.durationSeconds === null || route.durationSeconds === undefined
    ? '정보 없음'
    : formatPreviewDuration(route.durationSeconds / 60);
  return `${duration} · ${formatPreviewDistance(route.distanceMeters)}`;
}

function routeDurationLabel(route) {
  if (!route || route.status !== 'AVAILABLE' || route.durationSeconds === null || route.durationSeconds === undefined) {
    return '정보 없음';
  }
  return formatPreviewDuration(route.durationSeconds / 60);
}

function formatPreviewAscent(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${Math.round(value)}m`
    : '정보 없음';
}

function RouteLeg({ leg, index }) {
  const duration = leg.durationSeconds === null || leg.durationSeconds === undefined
    ? '정보 없음'
    : formatPreviewDuration(leg.durationSeconds / 60);
  return h(
    'li',
    { className: 'course-preview-leg', key: `${leg.mode || 'LEG'}-${index}` },
    h(
      'div',
      null,
      h('strong', null, leg.routeName || MODE_LABELS[leg.mode] || '이동 구간'),
      h('span', null, `${MODE_LABELS[leg.mode] || leg.mode || '이동'} · ${duration} · ${formatPreviewDistance(leg.distanceMeters)}`),
    ),
    leg.mode === 'WALK' && leg.steps?.length > 0 && h(
      'ul',
      { className: 'course-preview-walk-steps', 'aria-label': '도보 상세 안내' },
      leg.steps.map((step, stepIndex) => h(
        'li',
        { key: `${step.streetName || 'step'}-${stepIndex}` },
        h('strong', null, step.description || '도보로 이동하세요'),
        h('span', null, [step.streetName, formatPreviewDistance(step.distanceMeters)].filter(Boolean).join(' · ')),
      )),
    ),
  );
}

function IncomingRoute({ route }) {
  if (!route || route.status !== 'AVAILABLE') {
    return h('div', { className: 'course-preview-route-unavailable', role: 'status' }, h('span', null, '이전 지점에서 이동'), h('strong', null, '경로 정보 없음'));
  }
  const extra = [];
  if (route.transferCount !== null && route.transferCount !== undefined) extra.push(`환승 ${route.transferCount}회`);
  if (route.walkDistanceMeters !== null && route.walkDistanceMeters !== undefined) extra.push(`도보 ${formatPreviewDistance(route.walkDistanceMeters)}`);
  return h(
    'section',
    { className: 'course-preview-route', 'aria-label': '이전 지점에서 오는 경로' },
    h('header', null, h('span', null, `${MODE_LABELS[route.mode] || route.mode || '이동'} 경로`), h('strong', null, routeMetric(route))),
    extra.length > 0 && h('p', null, extra.join(' · ')),
    route.legs?.length > 0 && h('ol', { className: 'course-preview-legs' }, route.legs.map((leg, index) => h(RouteLeg, { leg, index, key: `${leg.mode || 'LEG'}-${index}` }))),
  );
}

function RouteSelector({ stop, selection, onChange }) {
  if (!stop?.alternativeRoute) return null;
  const routeKey = stopRouteSelectionKey(stop);
  const selectedRoute = stop.selectedRoute || stop.incomingRoute;
  return h(
    'fieldset',
    { className: 'course-preview-route-selector' },
    h('legend', null, '이동 경로 선택'),
    h('label', null,
      h('input', {
        type: 'radio',
        name: `course-route-${routeKey}`,
        value: 'selected',
        checked: selection !== 'alternative',
        onChange: () => onChange('selected'),
      }),
      h('span', null, `추천 · ${MODE_LABELS[selectedRoute?.mode] || selectedRoute?.mode || '이동'} ${routeDurationLabel(selectedRoute)}`),
    ),
    h('label', null,
      h('input', {
        type: 'radio',
        name: `course-route-${routeKey}`,
        value: 'alternative',
        checked: selection === 'alternative',
        onChange: () => onChange('alternative'),
      }),
      h('span', null, `대안 · ${MODE_LABELS[stop.alternativeRoute.mode] || stop.alternativeRoute.mode || '이동'} ${routeDurationLabel(stop.alternativeRoute)}`),
    ),
  );
}

function CongestionBadge({ prefix, score }) {
  const level = formatCongestionLevel(score);
  if (!level) return null;
  return h(
    'span',
    { className: 'congestion-badge', 'data-level': level },
    h('i', { 'aria-hidden': 'true' }),
    `${prefix} ${level}`,
  );
}

function MetricBar({ label, value, max = 100, tone = 'baseline', suffix = '' }) {
  const valid = typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const width = valid && max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return h('div', { className: 'course-comparison-bar', 'data-tone': tone },
    h('div', null, h('span', null, label), h('strong', null, valid ? `${Math.round(value * 10) / 10}${suffix}` : '정보 없음')),
    h('i', { 'aria-hidden': 'true' }, h('b', { style: { width: `${width}%` } })),
  );
}

function QuietComparison({ fast, quiet }) {
  const before = fast?.averageCongestionScore;
  const after = quiet?.averageCongestionScore;
  const valid = Number.isFinite(before) && Number.isFinite(after);
  const pointDrop = valid ? Math.max(0, before - after) : null;
  const reduction = valid && before > 0 ? (pointDrop / before) * 100 : null;
  const originalPositions = new Map((fast?.stops || []).map((stop, index) => [stop.basketItemId, index]));
  const moved = (quiet?.stops || []).filter((stop, index) => originalPositions.get(stop.basketItemId) !== index);
  const order = (option) => (option?.stops || []).map((stop) => stop.placeName).join(' → ');
  return h('section', { className: 'course-comparison-card', 'aria-labelledby': 'quiet-comparison-title' },
    h('header', null, h('span', null, '혼잡도 비교'), h('h2', { id: 'quiet-comparison-title' }, valid ? `${Math.round(before)}%에서 ${Math.round(after)}%로 낮췄어요` : '혼잡도가 낮은 순서를 선택했어요')),
    valid && h('p', { className: 'course-comparison-highlight' }, `${Math.round(pointDrop)}%p · 약 ${Math.round(reduction)}% 감소`),
    h('div', { className: 'course-comparison-bars' },
      h(MetricBar, { label: '빠른 길', value: before, suffix: '%' }),
      h(MetricBar, { label: '한적한 길', value: after, suffix: '%', tone: 'selected' }),
    ),
    h('div', { className: 'course-order-comparison' },
      h('p', null, h('strong', null, '기존'), h('span', null, order(fast))),
      h('p', null, h('strong', null, '재배치'), h('span', null, order(quiet))),
    ),
    h('p', { className: 'course-comparison-reason' }, moved.length > 0
      ? `${moved.map((stop) => stop.placeName).join(', ')}의 예상 혼잡도와 도착 시각을 반영해 방문 순서를 바꿨어요.`
      : '순서를 바꾸지 않아도 가장 낮은 혼잡도를 유지할 수 있어 기존 순서를 유지했어요.'),
  );
}

function EasyComparison({ comparisons }) {
  if (comparisons.length === 0) return null;
  const maxMetric = Math.max(1, ...comparisons.flatMap((item) => [
    item.originalAscentMeters || 0,
    item.easyAscentMeters || 0,
    item.originalSteepUphillDistanceMeters || 0,
    item.easySteepUphillDistanceMeters || 0,
  ]));
  return h('section', { className: 'course-comparison-card', 'aria-labelledby': 'easy-comparison-title' },
    h('header', null, h('span', null, '도보 경사 비교'), h('h2', { id: 'easy-comparison-title' }, '구간마다 오르막 부담을 비교했어요')),
    h('p', { className: 'course-comparison-caption' }, '급경사는 경사도 8% 이상인 오르막 구간의 거리예요.'),
    h('div', { className: 'course-elevation-list' }, comparisons.map((item) => h('article', { key: `${item.sequenceNo}-${item.placeName}` },
      h('h3', null, `${item.sequenceNo}. ${item.placeName}`),
      h('div', { className: 'course-comparison-bars' },
        h(MetricBar, { label: '기존 상승고도', value: item.originalAscentMeters, max: maxMetric, suffix: 'm' }),
        h(MetricBar, { label: '편한 길 상승고도', value: item.easyAscentMeters, max: maxMetric, suffix: 'm', tone: 'selected' }),
        h(MetricBar, { label: '기존 급경사 거리', value: item.originalSteepUphillDistanceMeters, max: maxMetric, suffix: 'm' }),
        h(MetricBar, { label: '편한 길 급경사 거리', value: item.easySteepUphillDistanceMeters, max: maxMetric, suffix: 'm', tone: 'selected' }),
      ),
      Number.isFinite(item.easyCoveragePercent) && h('small', null, `고도 데이터 커버리지 ${Math.round(item.easyCoveragePercent)}%`),
    ))),
  );
}

function StopCard({ stop, showAscent, showCongestion, routeSelection, onRouteSelectionChange }) {
  const sourceLabel = stop.hoursSourceType === 'REAL' ? '실제 운영시간' : '데모 기본 운영시간';
  const hours = stop.openTime && stop.closeTime ? `${stop.openTime}-${stop.closeTime}` : '정보 없음';
  return h(
    'li',
    { className: 'course-preview-stop' },
    h(RouteSelector, { stop, selection: routeSelection, onChange: onRouteSelectionChange }),
    h(IncomingRoute, { route: stop.incomingRoute }),
    h(
      'article',
      null,
      h('header', null, h('b', null, stop.sequenceNo), h('div', null, h('h2', null, stop.placeName || '장소 정보 없음'), h('p', null, stop.address || '주소 정보 없음'))),
      h('p', { className: 'course-preview-stop-time' }, `${stop.scheduledArrival || '정보 없음'} 도착 · ${stop.scheduledDeparture || '정보 없음'} 출발`),
      h('p', { className: 'course-preview-stop-hours' }, `${sourceLabel} · ${hours}`),
      h('div', { className: 'course-preview-stop-meta' },
        h('span', null, `체류 ${formatPreviewDuration(stop.dwellMinutes)}`),
        stop.arrivalDeadline && h('span', null, `예약 ${stop.arrivalDeadline}${stop.arrivalBufferMinutes ? ` · ${stop.arrivalBufferMinutes}분 전 도착` : ''}`),
        showAscent && h('span', null, `상승 고도 ${formatPreviewAscent(stop.ascentMeters)}`),
        showCongestion && h(CongestionBadge, { prefix: '예상 혼잡도', score: stop.congestionScore }),
      ),
    ),
  );
}

export default function CoursePreviewResults({
  preview,
  status = 'idle',
  message,
  MapComponent,
  onBack,
  onRetry,
  onEditConditions,
  onEditStops,
}) {
  const [selection, setSelection] = useState({ preview: null, strategy: 'FAST', routeSelections: {} });
  if (status === 'loading') {
    return h(
      'section',
      { className: 'phone standard-screen course-preview-screen course-preview-loading', 'aria-busy': true },
      h('main', { className: 'page-scroll course-preview-state' },
        h('div', { role: 'status', 'aria-live': 'polite', 'aria-busy': true },
          h('span', { className: 'course-preview-spinner', 'aria-hidden': 'true' }),
          h('h1', null, '빠른 코스를 계산하고 있어요'),
          h('p', null, '운영시간과 장소 사이 이동 경로를 확인하는 중이에요.'),
        ),
      ),
    );
  }
  if (status === 'error' || status === 'validation') {
    return h(
      'section',
      { className: 'phone standard-screen course-preview-screen course-preview-error', 'aria-busy': false },
      h('main', { className: 'page-scroll course-preview-state' },
        onBack && h('button', { className: 'course-preview-state-back', type: 'button', onClick: onBack, 'aria-label': '이전' }, '‹'),
        h('div', { role: 'alert' },
          h('span', { className: 'course-preview-error-icon', 'aria-hidden': 'true' }, '!'),
          h('h1', null, status === 'validation' ? '코스 조건을 먼저 확인해주세요' : '코스를 계산하지 못했어요'),
          h('p', null, message || '입력한 조건을 확인하고 다시 시도해주세요.'),
          onRetry && h('button', { className: 'ui-button primary', type: 'button', onClick: onRetry }, '다시 계산하기'),
          h('button', { className: 'ui-button secondary', type: 'button', onClick: onEditConditions }, '출발 조건 수정'),
          onEditStops && h('button', { className: 'ui-button secondary', type: 'button', onClick: onEditStops }, '장소별 시간 수정'),
        ),
      ),
    );
  }
  if (status !== 'success' || !preview) return null;
  const options = Array.isArray(preview.options) && preview.options.length > 0
    ? preview.options
    : [preview];
  const fastPreview = options.find((option) => option?.strategy === 'FAST') || preview;
  const selectedStrategy = selection.preview === preview ? selection.strategy : 'FAST';
  const selectedPreview = options.find((option) => option?.strategy === selectedStrategy) || fastPreview;
  const routeSelections = selection.preview === preview
    ? selection.routeSelections[selectedPreview.strategy] || {}
    : {};
  const effectivePreview = applyRouteSelections(selectedPreview, routeSelections);
  const availableStrategyOptions = STRATEGY_OPTIONS.filter((item) => (
    options.some((option) => option?.strategy === item.strategy)
  ));
  const selectedStrategyOption = STRATEGY_OPTIONS.find((item) => item.strategy === effectivePreview.strategy)
    || STRATEGY_OPTIONS[0];
  const isEasy = effectivePreview.strategy === 'EASY';
  const isQuiet = effectivePreview.strategy === 'QUIET';
  const strategyName = selectedStrategyOption.name;
  const averageCongestionLevel = isQuiet
    ? formatCongestionLevel(effectivePreview.averageCongestionScore)
    : null;
  const hasDrawableRoute = Array.isArray(effectivePreview.routeLegs) && effectivePreview.routeLegs.some((leg) => (
    leg?.geometry?.type === 'LineString'
    && Array.isArray(leg.geometry.coordinates)
    && leg.geometry.coordinates.length >= 2
  ));
  const firstStop = effectivePreview.stops[0];
  const fallbackCenter = Number.isFinite(firstStop?.longitude) && Number.isFinite(firstStop?.latitude)
    ? [firstStop.longitude, firstStop.latitude]
    : undefined;
  const mapStops = effectivePreview.stops
    .map((stop, index) => ({
      id: stop.basketItemId ?? `${stop.sequenceNo ?? index}-${stop.placeName ?? 'place'}`,
      name: stop.placeName || '장소 정보 없음',
      latitude: stop.latitude,
      longitude: stop.longitude,
      sequenceNo: stop.sequenceNo,
    }))
    .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
  const loadMapStops = () => Promise.resolve(mapStops);
  const terrainEligibleSequenceNumbers = new Set(effectivePreview.stops
    .filter((stop) => isTerrainEligibleRoute(stop.incomingRoute))
    .map((stop) => stop.sequenceNo)
    .filter((sequenceNo) => Number.isFinite(sequenceNo)));
  const showTerrainTotal = isEasy
    && effectivePreview.stops.length > 0
    && terrainEligibleSequenceNumbers.size === effectivePreview.stops.length;
  const terrainComparisons = isEasy
    ? (effectivePreview.elevationComparisons || []).filter((item) => terrainEligibleSequenceNumbers.has(item.sequenceNo))
    : [];
  const updateRouteSelection = (stop, index, value) => {
    const key = stopRouteSelectionKey(stop, index);
    setSelection((current) => {
      const currentSelections = current.preview === preview ? current.routeSelections : {};
      return {
        preview,
        strategy: selectedPreview.strategy,
        routeSelections: {
          ...currentSelections,
          [selectedPreview.strategy]: {
            ...(currentSelections[selectedPreview.strategy] || {}),
            [key]: value,
          },
        },
      };
    });
  };
  return h(
    'section',
    { className: 'phone standard-screen course-preview-screen', 'aria-busy': false },
    h(
      'main',
      { className: 'page-scroll course-preview-scroll' },
      h('header', { className: 'course-preview-header' }, h('button', { type: 'button', onClick: onBack, 'aria-label': '이전' }, '‹'), h('div', null, h('span', null, `${effectivePreview.strategy} · 추천 결과`), h('h1', null, `${strategyName} 코스`))),
      availableStrategyOptions.length > 1 && h(
        'fieldset',
        { className: 'course-preview-strategy', 'data-option-count': availableStrategyOptions.length },
        h('legend', null, '경로 기준'),
        availableStrategyOptions.map((item) => h(
          'label',
          { key: item.strategy },
          h('input', {
            type: 'radio',
            name: 'course-route-strategy',
            value: item.strategy,
            checked: effectivePreview.strategy === item.strategy,
            onChange: (event) => setSelection((current) => ({
              preview,
              strategy: event.target.value,
              routeSelections: current.preview === preview ? current.routeSelections : {},
            })),
          }),
          h('span', null, h('strong', null, item.label), h('small', null, item.description)),
        )),
      ),
      h('p', { className: 'course-preview-schedule' }, `${effectivePreview.scheduledStart || '정보 없음'}-${effectivePreview.scheduledEnd || '정보 없음'} · ${effectivePreview.stopCount ?? effectivePreview.stops.length}곳`),
      effectivePreview.scheduleRecalculated && h('p', { className: 'course-preview-schedule-recalculated', role: 'status' }, '대체 경로를 반영해 예상 일정이 다시 계산되었어요.'),
      averageCongestionLevel && h(CongestionBadge, { prefix: '평균 혼잡도', score: effectivePreview.averageCongestionScore }),
      MapComponent && h('div', { className: 'course-preview-map' }, h(MapComponent, {
        ariaLabel: `${strategyName} 코스 추천 경로 지도`,
        interactive: true,
        center: hasDrawableRoute ? undefined : fallbackCenter,
        loadPlacesInBounds: loadMapStops,
        placeMarkerLabel: (place) => place.sequenceNo,
        clusterPlaces: false,
        fitPlaceMarkers: !hasDrawableRoute,
        placeRequestKey: effectivePreview.routeFitKey,
        showCongestionAreas: false,
        routeLegs: effectivePreview.routeLegs,
        routeMode: 'TRANSIT',
        routeFitKey: effectivePreview.routeFitKey,
        routeFitPadding: COURSE_PREVIEW_ROUTE_FIT_PADDING,
        style: { width: '100%', height: '100%' },
      })),
      h('dl', { className: 'course-preview-totals' },
        h('div', null, h('dt', null, '전체'), h('dd', null, formatPreviewDuration(effectivePreview.totalDurationMinutes))),
        h('div', null, h('dt', null, '이동 '), h('dd', null, formatPreviewDuration(effectivePreview.totalTravelMinutes))),
        showTerrainTotal
          ? h('div', null, h('dt', null, '상승 고도'), h('dd', null, formatPreviewAscent(effectivePreview.totalAscentMeters)))
          : h('div', null, h('dt', null, '거리'), h('dd', null, formatPreviewDistance(effectivePreview.totalDistanceMeters))),
      ),
      isQuiet && h(QuietComparison, { fast: fastPreview, quiet: effectivePreview }),
      terrainComparisons.length > 0 && h(EasyComparison, { comparisons: terrainComparisons }),
      h('section', { className: 'course-preview-itinerary', 'aria-labelledby': 'course-preview-itinerary-title' },
        h('header', null, h('h2', { id: 'course-preview-itinerary-title' }, '방문 순서'), h('span', null, '예상 도착·출발')),
        h('ol', null, effectivePreview.stops.map((stop, index) => h(StopCard, {
          stop,
          showAscent: isEasy && isTerrainEligibleRoute(stop.incomingRoute),
          showCongestion: isQuiet,
          key: `${stop.sequenceNo}-${stop.placeName}`,
          routeSelection: routeSelections[stopRouteSelectionKey(stop, index)],
          onRouteSelectionChange: (value) => updateRouteSelection(stop, index, value),
        }))),
      ),
    ),
    h('div', { className: 'sticky-actions course-preview-actions' },
      h('button', { className: 'ui-button secondary', type: 'button', onClick: onEditConditions }, '출발 조건 수정'),
      h('button', { className: 'ui-button secondary', type: 'button', onClick: onEditStops }, '장소별 시간 수정'),
    ),
  );
}
