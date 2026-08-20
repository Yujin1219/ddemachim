import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import CoursePreviewLoader from './CoursePreviewLoader.js';
import CourseNavigationGuidance from './CourseNavigationGuidance.js';
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

const COURSE_PREVIEW_ROUTE_FIT_PADDING = [84, 22, 26, 22];

function routeShape(option) {
  return JSON.stringify((option?.routeLegs || []).map((leg) => leg?.geometry?.coordinates || null));
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function easyInsight(fast, easy) {
  const before = finiteNumber(fast?.totalAscentMeters);
  const after = finiteNumber(easy?.totalAscentMeters);
  const extra = finiteNumber(easy?.totalTravelMinutes) !== null && finiteNumber(fast?.totalTravelMinutes) !== null
    ? Math.round(easy.totalTravelMinutes - fast.totalTravelMinutes)
    : null;
  if (before === null || after === null || before <= after || extra === null || extra < 0) return null;
  return `급경사 ${Math.round(before)}m → ${Math.round(after)}m · 빠른 길보다 +${extra}분`;
}

function quietInsight(fast, quiet) {
  const before = finiteNumber(fast?.averageCongestionScore);
  const after = finiteNumber(quiet?.averageCongestionScore);
  const moved = (quiet?.stops || []).filter((stop, index) => (
    (fast?.stops || []).findIndex((item) => item?.basketItemId === stop?.basketItemId) !== index
  )).length;
  if (before === null || after === null || before <= after || moved <= 0) return null;
  return `예상 혼잡 ${Math.round(before)}% → ${Math.round(after)}% · 방문 순서 ${moved}곳 조정`;
}

const FAILURE_GROUPS = {
  conditions: { label: '출발 조건', action: 'conditions' },
  stops: { label: '장소별 시간', action: 'stops' },
  route: { label: '이동 경로', action: 'route' },
};

const FAILURE_RECOMMENDATIONS = {
  ADJUST_VISIT_DURATION: '장소별 체류시간을 줄이거나 방문 순서를 앞쪽으로 조정해 보세요.',
  CHANGE_SERVICE_DATE: '운영하는 날짜로 바꿔서 다시 계산해 보세요.',
  RELAX_ARRIVAL_DEADLINE: '도착 희망 시간을 조금 늦춰서 다시 계산해 보세요.',
  ADJUST_START_TIME: '출발 시간을 조정해서 장소별 조건을 다시 맞춰 보세요.',
  CHECK_ROUTE_AVAILABILITY: '이동 경로를 확인하거나 다른 이동 수단으로 다시 계산해 보세요.',
};

function isStructuredFailure(failure) {
  if (!failure || typeof failure !== 'object' || !Array.isArray(failure.groups)) return false;
  if (failure.groups.length < 1 || failure.groups.length > 3) return false;
  const order = ['conditions', 'stops', 'route'];
  let lastIndex = -1;
  return failure.groups.every((group) => {
    const expected = FAILURE_GROUPS[group?.id];
    const index = order.indexOf(group?.id);
    if (!expected || index <= lastIndex) return false;
    lastIndex = index;
    return group.label === expected.label
      && group.action === expected.action
      && Array.isArray(group.messages)
      && group.messages.length > 0
      && group.messages.every((item) => typeof item === 'string' && item.trim().length > 0);
  });
}

function isOperatingHoursFailureGroup(group) {
  return group?.id === 'stops'
    && Array.isArray(group.items)
    && group.items.length > 0
    && group.items.every((item) => (
      item?.reason === 'OPERATING_HOURS_EXCEEDED'
      && item?.adjustmentProposal === 'ADJUST_VISIT_DURATION'
      && typeof item.placeName === 'string'
      && item.placeName.trim().length > 0
    ));
}

function OperatingHoursGroup({ group }) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? group.items : group.items.slice(0, 3);
  const hiddenCount = Math.max(0, group.items.length - 3);
  return h(
    'section',
    { className: 'course-preview-diagnostic-group course-preview-operating-hours-group' },
    h('header', { className: 'course-preview-diagnostic-group-header' },
      h('div', null,
        h('span', { className: 'course-preview-diagnostic-group-icon', 'aria-hidden': 'true' }, '◷'),
        h('div', null,
          h('h2', null, '운영시간 조정이 필요해요'),
          h('p', null, `${group.items.length}개 장소에서 시간이 맞지 않아요`),
        ),
      ),
    ),
    h('ul', { className: 'course-preview-conflict-list' }, visibleItems.map((item) => h(
      'li',
      { key: item.basketItemId },
      h('strong', null, item.placeName),
      h('span', null, '운영시간 확인 필요'),
    ))),
    hiddenCount > 0 && h('button', {
      className: 'course-preview-conflict-toggle',
      type: 'button',
      onClick: () => setExpanded((current) => !current),
      'aria-expanded': expanded,
    }, expanded ? '접기 ↑' : `문제가 있는 장소 ${hiddenCount}곳 더 보기 ↓`),
  );
}

function FailureRecommendation({ group, onEditConditions, onEditStops, onRetry }) {
  const proposal = group.items?.[0]?.adjustmentProposal;
  const guidance = FAILURE_RECOMMENDATIONS[proposal];
  if (!guidance) return null;
  const action = group.action === 'conditions'
    ? { callback: onEditConditions, label: '출발 조건 수정' }
    : group.action === 'route'
      ? { callback: onRetry, label: '다시 계산하기' }
      : { callback: onEditStops, label: '시간 조정하기' };
  return h('section', { className: 'course-preview-recommendation', 'aria-labelledby': 'course-preview-recommendation-title' },
    h('h2', { id: 'course-preview-recommendation-title' }, '추천 조정안'),
    h('p', null, guidance),
    h('div', { className: 'course-preview-recommendation-actions' },
      action.callback && h('button', { className: 'ui-button primary', type: 'button', onClick: action.callback }, action.label),
      action.callback !== onRetry && onRetry && h('button', { className: 'ui-button secondary', type: 'button', onClick: onRetry }, '다시 계산하기'),
    ),
  );
}

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function CourseNavigationArrival({ stop, onContinue }) {
  const placeName = stop?.placeName || '다음 장소';
  return h('section', { className: 'course-navigation-arrival', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'course-navigation-arrival-title' },
    h('span', null, '도착했어요'),
    h('h1', { id: 'course-navigation-arrival-title' }, placeName),
    h('p', null, '현재 위치가 장소 근처에 있어요. 잠시 둘러본 뒤 다음 장소로 이동해보세요.'),
    h('button', { className: 'ui-button primary', type: 'button', onClick: onContinue }, '계속 안내 보기'),
  );
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
  const [expanded, setExpanded] = useState(false);
  if (!route || route.status !== 'AVAILABLE') {
    return h('div', { className: 'course-preview-route-unavailable', role: 'status' }, h('span', null, '이전 지점에서 이동'), h('strong', null, '경로 정보 없음'));
  }
  const extra = [];
  if (route.transferCount !== null && route.transferCount !== undefined) extra.push(`환승 ${route.transferCount}회`);
  if (route.walkDistanceMeters !== null && route.walkDistanceMeters !== undefined) extra.push(`도보 ${formatPreviewDistance(route.walkDistanceMeters)}`);
  return h(
    'section',
    { className: 'course-preview-route', 'aria-label': '이전 지점에서 오는 경로' },
    h('header', null,
      h('span', null, `${MODE_LABELS[route.mode] || route.mode || '이동'} ${routeMetric(route)}`),
      h('button', { type: 'button', className: 'course-preview-route-toggle', 'aria-expanded': expanded, 'aria-controls': `course-route-detail-${route.routeId || route.mode || 'route'}`, onClick: () => setExpanded((value) => !value) }, expanded ? '상세 접기' : '상세 보기'),
    ),
    extra.length > 0 && h('p', null, extra.join(' · ')),
    expanded && route.legs?.length > 0 && h('ol', { id: `course-route-detail-${route.routeId || route.mode || 'route'}`, className: 'course-preview-legs' }, route.legs.map((leg, index) => h(RouteLeg, { leg, index, key: `${leg.mode || 'LEG'}-${index}` }))),
  );
}

function CoursePreviewOrigin({ origin, startTime }) {
  const name = typeof origin?.name === 'string' && origin.name.trim() ? origin.name.trim() : null;
  const address = typeof origin?.address === 'string' && origin.address.trim() ? origin.address.trim() : null;
  return h(
    'li',
    { className: 'course-preview-origin' },
    h('span', { className: 'course-preview-origin-marker', 'aria-hidden': 'true' }, '출'),
    h('div', null,
      h('strong', null, name || '출발'),
      address && h('small', null, address),
    ),
    startTime && h('time', null, `${startTime} 출발`),
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

function StopCard({ stop, showAscent, showCongestion, routeSelection, onRouteSelectionChange, selected, onSelect, stopRef, readOnly = false }) {
  return h(
    'li',
    { className: `course-preview-stop${selected ? ' is-selected' : ''}`, ref: stopRef },
    !readOnly && h(RouteSelector, { stop, selection: routeSelection, onChange: onRouteSelectionChange }),
    h(IncomingRoute, { route: stop.incomingRoute }),
    h(
      'button',
      { type: 'button', className: 'course-preview-stop-button', onClick: onSelect, 'aria-pressed': selected },
      h('header', null, h('b', null, stop.sequenceNo), h('div', null, h('h2', null, stop.placeName || '장소 정보 없음'), h('p', null, stop.address || '주소 정보 없음'))),
      h('div', { className: 'course-preview-stop-meta' },
        stop.arrivalDeadline && h('span', null, `예약 ${stop.arrivalDeadline}${stop.arrivalBufferMinutes ? ` · ${stop.arrivalBufferMinutes}분 전 도착` : ''}`),
        showAscent && h('span', null, `상승 고도 ${formatPreviewAscent(stop.ascentMeters)}`),
        showCongestion && h(CongestionBadge, { prefix: '예상 혼잡도', score: stop.congestionScore }),
      ),
    ),
  );
}

export default function CoursePreviewResults({
  preview,
  origin = null,
  failure,
  status = 'idle',
  message,
  MapComponent,
  onBack,
  onRetry,
  onEditConditions,
  onEditStops,
  onStart = null,
  onConfirm = null,
  confirmLabel = '이 코스로 시작하기',
  confirmBusy = false,
  confirmError = null,
  readOnly = false,
  navigationMode = false,
}) {
  const [selection, setSelection] = useState({ preview: null, strategy: 'FAST', routeSelections: {} });
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [routeDrawn, setRouteDrawn] = useState(false);
  const [arrivalStop, setArrivalStop] = useState(null);
  const [sheetOffset, setSheetOffset] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetFrameRef = useRef(null);
  const sheetRef = useRef(null);
  const sheetOffsetRef = useRef(0);
  const sheetSnapPointsRef = useRef([0, 0, 0]);
  const sheetSnapIndexRef = useRef(1);
  const sheetDragRef = useRef(null);
  const sheetRafRef = useRef(null);
  const stopRefs = useRef(new Map());

  const updateSheetSnapPoints = () => {
    const frame = sheetFrameRef.current;
    if (!frame || frame.clientHeight <= 0) return;
    const height = frame.clientHeight;
    const collapsedReveal = Math.min(132, Math.max(92, height * 0.28));
    const mediumReveal = Math.min(Math.max(0, height - 26), Math.max(240, height * 0.62));
    const points = [
      0,
      Math.max(0, height - mediumReveal),
      Math.max(0, height - collapsedReveal),
    ];
    sheetSnapPointsRef.current = points;
    const nextOffset = points[sheetSnapIndexRef.current] ?? 0;
    sheetOffsetRef.current = nextOffset;
    setSheetOffset(nextOffset);
  };

  useLayoutEffect(() => {
    sheetSnapIndexRef.current = 1;
    sheetOffsetRef.current = 0;
    setSheetOffset(0);
    updateSheetSnapPoints();
    const frame = sheetFrameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateSheetSnapPoints);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [preview]);

  useEffect(() => () => {
    if (sheetRafRef.current !== null) globalThis.cancelAnimationFrame?.(sheetRafRef.current);
  }, []);

  const presentSheetOffset = (nextOffset) => {
    const points = sheetSnapPointsRef.current;
    const maxOffset = points[points.length - 1] || 0;
    const bounded = Math.max(0, Math.min(maxOffset, nextOffset));
    sheetOffsetRef.current = bounded;
    if (sheetRafRef.current !== null) return;
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      setSheetOffset(bounded);
      return;
    }
    sheetRafRef.current = globalThis.requestAnimationFrame(() => {
      sheetRafRef.current = null;
      setSheetOffset(sheetOffsetRef.current);
    });
  };

  const readPresentedSheetOffset = () => {
    const sheet = sheetRef.current;
    const points = sheetSnapPointsRef.current;
    const maxOffset = points[points.length - 1] || 0;
    const fallback = Math.max(0, Math.min(maxOffset, sheetOffsetRef.current));
    if (!sheet || typeof globalThis.getComputedStyle !== 'function') return fallback;
    const transform = globalThis.getComputedStyle(sheet).transform;
    if (!transform || transform === 'none') return fallback;
    const matrixMatch = /^matrix(3d)?\(([^)]+)\)$/.exec(transform);
    if (matrixMatch) {
      const values = matrixMatch[2].split(',').map(Number);
      const translateY = matrixMatch[1] ? values[13] : values[5];
      if (Number.isFinite(translateY)) return Math.max(0, Math.min(maxOffset, translateY));
    }
    const translateMatch = /translateY\(\s*(-?[\d.]+)px\s*\)/.exec(transform);
    if (translateMatch && Number.isFinite(Number(translateMatch[1]))) {
      return Math.max(0, Math.min(maxOffset, Number(translateMatch[1])));
    }
    return fallback;
  };

  const snapSheetTo = (index) => {
    updateSheetSnapPoints();
    const boundedIndex = Math.max(0, Math.min(2, index));
    sheetSnapIndexRef.current = boundedIndex;
    const nextOffset = sheetSnapPointsRef.current[boundedIndex] || 0;
    sheetOffsetRef.current = nextOffset;
    setSheetOffset(nextOffset);
  };

  const scrollStopIntoView = (stopId) => {
    snapSheetTo(0);
    const target = stopRefs.current.get(String(stopId));
    if (!target?.scrollIntoView) return;
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  };

  const finishSheetDrag = (event) => {
    const drag = sheetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const projected = sheetOffsetRef.current + (drag.velocity * 180);
    const points = sheetSnapPointsRef.current;
    const nextIndex = points.reduce((closest, point, index) => (
      Math.abs(point - projected) < Math.abs(points[closest] - projected) ? index : closest
    ), 0);
    sheetDragRef.current = null;
    setSheetDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    snapSheetTo(nextIndex);
  };

  const handleSheetPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    updateSheetSnapPoints();
    const presentedOffset = readPresentedSheetOffset();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sheetOffsetRef.current = presentedOffset;
    setSheetOffset(presentedOffset);
    sheetDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: presentedOffset,
      lastY: event.clientY,
      lastTime: performance.now(),
      velocity: 0,
    };
    setSheetDragging(true);
  };

  const handleSheetPointerMove = (event) => {
    const drag = sheetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastTime);
    drag.velocity = ((event.clientY - drag.lastY) / elapsed) * 0.65 + (drag.velocity * 0.35);
    drag.lastY = event.clientY;
    drag.lastTime = now;
    presentSheetOffset(drag.startOffset + (event.clientY - drag.startY));
  };

  const handleSheetKeyDown = (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      snapSheetTo(sheetSnapIndexRef.current - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      snapSheetTo(sheetSnapIndexRef.current + 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      snapSheetTo(sheetSnapIndexRef.current === 0 ? 2 : 0);
    }
  };
  useEffect(() => {
    setSelectedStopId(null);
    setRouteDrawn(false);
    setArrivalStop(null);
  }, [preview]);
  if (status === 'loading') {
    return h(
      'section',
      { className: 'phone standard-screen course-preview-screen course-preview-loading', 'aria-busy': true },
      h('main', { className: 'page-scroll course-preview-state' },
        h(CoursePreviewLoader),
      ),
    );
  }
  if (status === 'error' && isStructuredFailure(failure)) {
    const actions = {
      conditions: onEditConditions ? { callback: onEditConditions, label: '출발 조건 수정' } : null,
      stops: onEditStops ? { callback: onEditStops, label: '장소별 시간 수정' } : null,
      route: onRetry ? { callback: onRetry, label: '다시 계산하기' } : null,
    };
    const firstActionableGroup = failure.groups.find((group) => actions[group.action])?.id;
    const operatingHoursGroup = failure.groups.find(isOperatingHoursFailureGroup);
    const recommendationGroup = operatingHoursGroup
      || failure.groups.find((group) => group.items?.some((item) => FAILURE_RECOMMENDATIONS[item.adjustmentProposal]));
    return h(
      'section',
      { className: 'phone standard-screen course-preview-screen course-preview-error course-preview-diagnostic-error', 'aria-busy': false },
      h('main', { className: 'page-scroll course-preview-state course-preview-diagnostic-state' },
        onBack && h('button', { className: 'course-preview-state-back', type: 'button', onClick: onBack, 'aria-label': '이전' }, '‹'),
          h('div', { className: 'course-preview-diagnostic-content' },
            h('div', { className: 'course-preview-diagnostic-summary', role: 'alert' },
            operatingHoursGroup
              ? h('h1', null, h('span', null, '지금 조건으로는'), h('span', null, '코스 생성이 어려워요'))
              : h('h1', null, '입력한 조건으로는 코스를 만들기 어려워요'),
            operatingHoursGroup
              ? h('p', null, '운영시간이 맞지 않는 장소가 있어요. 시간이나 방문 순서를 조정하면 코스를 만들 수 있어요.')
              : h('p', null, '확인된 이유와 바꿔볼 수 있는 조건을 정리했어요.'),
          ),
          h('div', { className: 'course-preview-diagnostic-groups' }, failure.groups.map((group) => {
            if (isOperatingHoursFailureGroup(group)) return h(OperatingHoursGroup, { group, key: group.id });
            const action = recommendationGroup?.id === group.id ? null : actions[group.action];
            return h('section', { className: 'course-preview-diagnostic-group', key: group.id },
              h('h2', null, group.label),
              h('ul', null, group.messages.map((item, index) => h('li', { key: `${group.id}-${index}` }, item))),
              action && h('button', {
                className: `ui-button ${group.id === firstActionableGroup ? 'primary' : 'secondary'}`,
                type: 'button',
                onClick: action.callback,
              }, action.label),
            );
          })),
          recommendationGroup
            ? h(FailureRecommendation, { group: recommendationGroup, onEditConditions, onEditStops, onRetry })
            : null,
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
  const ghostRouteLegs = (isEasy || isQuiet) && routeShape(fastPreview) !== routeShape(effectivePreview)
    ? (fastPreview.routeLegs || [])
    : [];
  const easyChip = isEasy ? easyInsight(fastPreview, effectivePreview) : null;
  const quietChip = isQuiet ? quietInsight(fastPreview, effectivePreview) : null;
  const insightChip = easyChip || quietChip;
  const hasDrawableRoute = Array.isArray(effectivePreview.routeLegs) && effectivePreview.routeLegs.some((leg) => (
    leg?.geometry?.type === 'LineString'
    && Array.isArray(leg.geometry.coordinates)
    && leg.geometry.coordinates.length >= 2
  ));
  const firstStop = effectivePreview.stops[0];
  const navigationStop = effectivePreview.stops.find((stop) => stop?.placeName) || firstStop;
  const navigationRoute = navigationStop?.selectedRoute || navigationStop?.incomingRoute;
  const navigationTravel = navigationRoute?.durationMinutes
    ? formatPreviewDuration(navigationRoute.durationMinutes)
    : formatPreviewDuration(effectivePreview.totalTravelMinutes);
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
  const selectedPlaceKey = selectedStopId ? `INTERNAL:${selectedStopId}` : '';
  const handleMapPlaceClick = (place) => {
    const id = place?.id ?? null;
    if (id === null || id === undefined) return;
    if (selectedStopId === id) {
      setSelectedStopId(null);
      return;
    }
    setSelectedStopId(id);
    scrollStopIntoView(id);
  };
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
    { className: `phone standard-screen course-preview-screen course-preview-result${navigationMode ? ' course-preview-navigation' : ''}`, 'aria-busy': false },
    navigationMode
      ? h('header', { className: 'navigation-top-card course-navigation-top-card' },
        h('button', { className: 'icon-button', type: 'button', onClick: onBack, 'aria-label': '이전' }, '‹'),
        h('div', null,
          h('strong', null, '코스 진행 중'),
          h('span', null, navigationStop?.placeName ? `${navigationStop.placeName}로 이동 중` : '다음 장소로 이동 중'),
        ),
        h('b', null, `${effectivePreview.stops.length}곳`),
      )
      : h('header', { className: 'course-preview-header course-preview-map-header' },
      h('button', { type: 'button', onClick: onBack, 'aria-label': '이전' }, '‹'),
      !readOnly && availableStrategyOptions.length > 1 && h(
        'div',
        { className: 'course-preview-tabs', role: 'tablist', 'aria-label': '경로 기준' },
        availableStrategyOptions.map((item) => h(
          'button',
          { key: item.strategy, type: 'button', className: 'course-preview-tab', role: 'tab', 'aria-selected': effectivePreview.strategy === item.strategy, onClick: () => setSelection((current) => ({
              preview,
              strategy: item.strategy,
              routeSelections: current.preview === preview ? current.routeSelections : {},
            })) }, item.label,
        )),
      ),
      h('span', { className: 'course-preview-tab-description' }, selectedStrategyOption.description),
    ),
    !navigationMode && h('section', { className: 'course-place-overview course-preview-place-overview', 'aria-label': `코스에 포함된 장소 ${effectivePreview.stops.length}곳` },
      h('header', null, h('strong', null, '선택한 장소'), h('span', null, `${effectivePreview.stops.length}곳`)),
      h('ol', null, effectivePreview.stops.map((stop, index) => h('li', { key: `${stop.basketItemId ?? stop.sequenceNo ?? index}-${stop.placeName}` }, h('b', null, index + 1), h('span', null, stop.placeName || '장소 정보 없음')))),
    ),
    h('div', { className: `course-preview-stage${routeDrawn ? ' is-drawn' : ''}` },
      !navigationMode && h('div', { className: 'course-preview-floating', 'aria-hidden': 'true' },
        h('span', null, `${formatPreviewDuration(effectivePreview.totalDurationMinutes)} · ${formatPreviewDistance(effectivePreview.totalDistanceMeters)}`),
        insightChip && h('span', null, insightChip),
      ),
      navigationMode && h(CourseNavigationGuidance, { preview: effectivePreview, destination: navigationStop, onArrival: setArrivalStop }),
      MapComponent && h(MapComponent, {
        ariaLabel: `${strategyName} 코스 추천 경로 지도`,
        interactive: true,
        center: hasDrawableRoute ? undefined : fallbackCenter,
        loadPlacesInBounds: loadMapStops,
        placeMarkerLabel: (place) => place.sequenceNo,
        placeMarkerEntrance: isQuiet ? 'renumber' : 'pop',
        selectedPlaceKey,
        focusedPlaceKey: selectedPlaceKey,
        onPlaceClick: handleMapPlaceClick,
        clusterPlaces: false,
        fitPlaceMarkers: !hasDrawableRoute,
        placeRequestKey: effectivePreview.routeFitKey,
        showCongestionAreas: false,
        routeLegs: effectivePreview.routeLegs,
        ghostRouteLegs,
        ghostHighlightLegs: [],
        routeMode: 'TRANSIT',
        routeFitKey: effectivePreview.routeFitKey,
        routeDrawKey: effectivePreview.routeFitKey,
        routeDrawDelay: isQuiet ? 560 : 260,
        routeFitPadding: COURSE_PREVIEW_ROUTE_FIT_PADDING,
        style: { width: '100%', height: '100%' },
        onRouteDrawEnd: () => {
          setRouteDrawn(true);
          globalThis.setTimeout(() => setRouteDrawn(false), 2000);
        },
      }),
      !navigationMode && routeDrawn && h('div', { className: 'course-preview-done', role: 'status' }, '오늘의 코스 완성 ✦'),
      navigationMode && !arrivalStop && h('section', { className: 'course-navigation-destination', 'aria-label': '다음 장소 정보' },
        h('span', null, '다음 장소'),
        h('strong', null, navigationStop?.placeName || '다음 장소를 확인하고 있어요'),
        h('p', null,
          navigationTravel && `이동 ${navigationTravel}`,
          navigationRoute?.distanceMeters ? ` · ${formatPreviewDistance(navigationRoute.distanceMeters)}` : '',
        ),
      ),
      navigationMode && arrivalStop && h(CourseNavigationArrival, { stop: arrivalStop, onContinue: () => setArrivalStop(null) }),
      !navigationMode && h('div', { className: 'course-preview-sheet-frame', ref: sheetFrameRef },
        h('section', {
        className: `course-preview-sheet${sheetDragging ? ' is-dragging' : ''}`,
        ref: sheetRef,
        id: 'course-preview-sheet-content',
        style: { transform: `translateY(${sheetOffset}px)` },
      },
        h('button', {
        className: 'course-preview-sheet-grip',
        type: 'button',
        onPointerDown: handleSheetPointerDown,
        onPointerMove: handleSheetPointerMove,
        onPointerUp: finishSheetDrag,
        onPointerCancel: finishSheetDrag,
        onKeyDown: handleSheetKeyDown,
        'aria-label': '코스 상세 패널 높이 조절',
        'aria-controls': 'course-preview-sheet-content',
        'aria-expanded': sheetSnapIndexRef.current === 0,
        }, h('span', { 'aria-hidden': 'true' }, '▁▁')),
        h('div', { className: 'course-preview-sheet-summary' }, `${effectivePreview.scheduledStart || '정보 없음'} → ${effectivePreview.scheduledEnd || '정보 없음'} · ${effectivePreview.stopCount ?? effectivePreview.stops.length}곳`, h('span', null, `이동 ${formatPreviewDuration(effectivePreview.totalTravelMinutes)}`)),
        h('section', { className: 'course-preview-itinerary', 'aria-labelledby': 'course-preview-itinerary-title' },
        h('ol', { className: 'course-preview-timeline' }, [
          h(CoursePreviewOrigin, { origin, startTime: effectivePreview.scheduledStart, key: 'course-preview-origin' }),
          ...effectivePreview.stops.map((stop, index) => h(StopCard, {
            stop,
            showAscent: isEasy && isTerrainEligibleRoute(stop.incomingRoute),
            showCongestion: isQuiet,
            key: `${stop.sequenceNo}-${stop.placeName}`,
            selected: selectedStopId === (stop.basketItemId ?? `${stop.sequenceNo ?? index}-${stop.placeName ?? 'place'}`),
            stopRef: (element) => {
              const id = String(stop.basketItemId ?? `${stop.sequenceNo ?? index}-${stop.placeName ?? 'place'}`);
              if (element) stopRefs.current.set(id, element);
              else stopRefs.current.delete(id);
            },
            onSelect: () => {
              const id = stop.basketItemId ?? `${stop.sequenceNo ?? index}-${stop.placeName ?? 'place'}`;
              setSelectedStopId((current) => (current === id ? null : id));
            },
            routeSelection: routeSelections[stopRouteSelectionKey(stop, index)],
            onRouteSelectionChange: (value) => updateRouteSelection(stop, index, value),
            readOnly,
          })),
        ]),
      ),
        ),
      ),
    ),
    !navigationMode && h('div', { className: `sticky-actions course-preview-actions${readOnly ? ' is-read-only' : ''}` },
      onConfirm && h('button', {
        'aria-busy': confirmBusy || undefined,
        className: 'ui-button primary',
        disabled: confirmBusy,
        type: 'button',
        onClick: () => onConfirm({ strategy: effectivePreview.strategy, routeSelections }),
      }, confirmBusy ? '처리 중' : confirmLabel),
      onStart && !onConfirm && h('button', { className: 'ui-button primary', type: 'button', onClick: onStart }, '이 코스로 시작하기'),
      !readOnly && onEditConditions && h('button', { className: 'ui-button secondary', type: 'button', onClick: onEditConditions }, '출발 조건 수정'),
      !readOnly && onEditStops && h('button', { className: 'ui-button secondary', type: 'button', onClick: onEditStops }, '장소별 시간 수정'),
      confirmError && h('p', { className: 'course-preview-confirm-error', role: 'alert' }, confirmError),
    ),
  );
}
