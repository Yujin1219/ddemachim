import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BusFront, CarFront, Footprints, TrainFront } from 'lucide-react';

import CoursePreviewLoader from './CoursePreviewLoader.js';
import CourseNavigationGuidance from './CourseNavigationGuidance.js';
import CourseActionButton from './CourseActionButton.js';
import {
  applyRouteSelections,
  formatCongestionLevel,
  formatPreviewDistance,
  formatPreviewDuration,
  flattenRouteLegs,
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

const COURSE_PREVIEW_COMPLETION_DURATION = 250;

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function mapCoordinate(value) {
  const longitude = finiteNumber(value?.longitude);
  const latitude = finiteNumber(value?.latitude);
  return longitude === null || latitude === null ? null : [longitude, latitude];
}

function sameMapCoordinate(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && Math.abs(left[0] - right[0]) < .00002
    && Math.abs(left[1] - right[1]) < .00002;
}

function routePointAtProgress(coordinates, progress) {
  if (coordinates.length < 2) return coordinates[0] || null;
  const segments = coordinates.slice(1).map((coordinate, index) => {
    const start = coordinates[index];
    return Math.hypot(coordinate[0] - start[0], coordinate[1] - start[1]);
  });
  const totalLength = segments.reduce((total, length) => total + length, 0);
  if (totalLength <= 0) return coordinates[0];

  let remaining = totalLength * progress;
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] <= 0) continue;
    if (remaining > segments[index]) {
      remaining -= segments[index];
      continue;
    }
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const ratio = remaining / segments[index];
    return [start[0] + ((end[0] - start[0]) * ratio), start[1] + ((end[1] - start[1]) * ratio)];
  }
  return coordinates.at(-1);
}

export function routeSimulationProgress(elapsedMilliseconds, durationMilliseconds) {
  const elapsed = Number(elapsedMilliseconds);
  const duration = Number(durationMilliseconds);
  if (!Number.isFinite(elapsed) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(1, elapsed / duration));
}

export function shouldStartRouteSimulation(navigationMode, development, routeReady) {
  return Boolean(navigationMode && development && routeReady);
}

function useRoutePositionSimulation(coordinates, enabled) {
  const routeKey = coordinates.map(([longitude, latitude]) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`).join('|');
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!enabled || coordinates.length < 2) {
      setPosition(null);
      return undefined;
    }
    const startedAt = Date.now();
    const duration = 36000;
    let timer = null;
    const update = () => {
      const progress = routeSimulationProgress(Date.now() - startedAt, duration);
      setPosition(routePointAtProgress(coordinates, progress));
      if (progress >= 1 && timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    update();
    timer = window.setInterval(update, 320);
    return () => {
      if (timer !== null) window.clearInterval(timer);
    };
  }, [enabled, routeKey]);

  return position;
}

function navigationRouteCoordinatesForPreview(preview, selection, selectedStopId, origin) {
  if (!preview || typeof preview !== 'object') return [];
  const options = Array.isArray(preview.options) && preview.options.length > 0 ? preview.options : [preview];
  const fastPreview = options.find((option) => option?.strategy === 'FAST') || preview;
  const selectedStrategy = selection.preview === preview ? selection.strategy : 'FAST';
  const selectedPreview = options.find((option) => option?.strategy === selectedStrategy) || fastPreview;
  if (!selectedPreview) return [];
  const routeSelections = selection.preview === preview
    ? selection.routeSelections?.[selectedPreview.strategy] || {}
    : {};
  const effectivePreview = applyRouteSelections(selectedPreview, routeSelections);
  const stops = effectivePreview?.stops || [];
  const selectedStopIndex = Math.max(0, stops.findIndex((stop, index) => (
    String(stop.basketItemId ?? `${stop.sequenceNo ?? index}-${stop.placeName ?? 'place'}`) === String(selectedStopId)
  )));
  const activeStop = stops[selectedStopIndex] || stops[0];
  const previousStop = stops[selectedStopIndex - 1] || null;
  const sourceCoordinate = mapCoordinate(previousStop || origin);
  const destinationCoordinate = mapCoordinate(activeStop);
  const routeLegs = flattenRouteLegs([activeStop]);
  const firstRouteCoordinate = routeLegs[0]?.geometry?.coordinates?.[0] || null;
  const lastRouteCoordinate = routeLegs.at(-1)?.geometry?.coordinates?.at(-1) || null;
  const selectedRouteLegs = [
    sourceCoordinate && firstRouteCoordinate && !sameMapCoordinate(sourceCoordinate, firstRouteCoordinate) && {
      geometry: { type: 'LineString', coordinates: [sourceCoordinate, firstRouteCoordinate] },
    },
    ...routeLegs,
    destinationCoordinate && lastRouteCoordinate && !sameMapCoordinate(lastRouteCoordinate, destinationCoordinate) && {
      geometry: { type: 'LineString', coordinates: [lastRouteCoordinate, destinationCoordinate] },
    },
  ].filter(Boolean);
  if (selectedRouteLegs.length === 0) {
    const route = activeStop?.selectedRoute || activeStop?.incomingRoute;
    const guidanceCoordinates = (route?.legs || [])
      .flatMap((leg) => leg?.steps || [])
      .map((step) => mapCoordinate(step))
      .filter(Boolean);
    const fallbackCoordinates = [sourceCoordinate, ...guidanceCoordinates, destinationCoordinate]
      .filter(Boolean)
      .filter((coordinate, index, coordinates) => index === 0 || !sameMapCoordinate(coordinate, coordinates[index - 1]));
    if (fallbackCoordinates.length >= 2) return fallbackCoordinates;
  }
  return selectedRouteLegs.flatMap((leg) => leg.geometry?.coordinates || [])
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .filter((coordinate, index, coordinates) => index === 0 || !sameMapCoordinate(coordinate, coordinates[index - 1]));
}

function routeStrategyFeedback(fast, candidate) {
  if (!fast || !candidate || candidate.strategy === 'FAST') return null;
  const extraMinutes = finiteNumber(candidate.totalTravelMinutes) !== null && finiteNumber(fast.totalTravelMinutes) !== null
    ? Math.round(candidate.totalTravelMinutes - fast.totalTravelMinutes)
    : null;

  if (candidate.strategy === 'EASY') {
    const comparisons = Array.isArray(candidate.elevationComparisons)
      ? candidate.elevationComparisons.map((comparison) => ({
        before: finiteNumber(comparison?.originalAscentMeters),
        after: finiteNumber(comparison?.easyAscentMeters),
      }))
      : [];
    const measuredComparisons = comparisons.filter((comparison) => (
      comparison.before !== null && comparison.after !== null
    ));
    const hasMeasuredComparison = measuredComparisons.length > 0;
    const before = hasMeasuredComparison
      ? measuredComparisons.reduce((total, comparison) => total + comparison.before, 0)
      : finiteNumber(fast.totalAscentMeters);
    const after = hasMeasuredComparison
      ? measuredComparisons.reduce((total, comparison) => total + comparison.after, 0)
      : finiteNumber(candidate.totalAscentMeters);
    if (before === null || after === null || before <= 0 || before <= after) return null;
    const reduction = Math.round(((before - after) / before) * 100);
    if (reduction < 1) return null;
    return {
      kind: 'easy',
      title: '더 편한 길을 찾았어요',
      label: measuredComparisons.length < comparisons.length ? '측정된 오르막' : '오르막 누적',
      before: `${Math.round(before)}m`,
      after: `${Math.round(after)}m`,
      reduction,
      extraMinutes,
      chip: `오르막 ${reduction}% ↓`,
    };
  }

  if (candidate.strategy === 'QUIET') {
    const before = finiteNumber(fast.averageCongestionScore);
    const after = finiteNumber(candidate.averageCongestionScore);
    if (before === null || after === null || before <= 0 || before <= after) return null;
    const reduction = Math.round(((before - after) / before) * 100);
    if (reduction < 1) return null;
    return {
      kind: 'quiet',
      title: '조금 더 한적하게 갈 수 있어요',
      label: '예상 혼잡도',
      before: `${Math.round(before)}%`,
      after: `${Math.round(after)}%`,
      reduction,
      extraMinutes,
      chip: `예상 혼잡 ${reduction}% ↓`,
    };
  }

  return null;
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
      action.callback && h(CourseActionButton, { onClick: action.callback }, action.label),
      action.callback !== onRetry && onRetry && h('button', { className: 'ui-button secondary', type: 'button', onClick: onRetry }, '다시 계산하기'),
    ),
  );
}

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function CourseNavigationArrival({ stop, arrivedAt, onContinue, onDwellChanged, onViewPlace, onCompleteCourse, completeBusy = false, completeError = null, replanBusy = false, replanError = null }) {
  const placeName = stop?.placeName || '다음 장소';
  const configuredDwellMinutes = Math.max(0, Math.round(Number(stop?.dwellMinutes ?? stop?.defaultDwellMinutes) || 0));
  const [dwellMinutes, setDwellMinutes] = useState(configuredDwellMinutes);
  const [editingDwell, setEditingDwell] = useState(false);
  const [, setClock] = useState(0);

  useEffect(() => {
    setDwellMinutes(configuredDwellMinutes);
    setEditingDwell(false);
  }, [stop?.basketItemId, stop?.placeId, configuredDwellMinutes]);

  useEffect(() => {
    if (!arrivedAt || dwellMinutes <= 0) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [arrivedAt, dwellMinutes]);

  const elapsedMinutes = arrivedAt ? Math.max(0, Math.floor((Date.now() - arrivedAt) / 60_000)) : 0;
  const remainingMinutes = Math.max(0, dwellMinutes - elapsedMinutes);
  const stayComplete = dwellMinutes === 0 || remainingMinutes === 0;
  const isLastStop = !onContinue;

  return h('section', { className: 'course-navigation-arrival', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'course-navigation-arrival-title' },
    h('span', null, stayComplete ? '체류 시간이 끝났어요' : '도착했어요'),
    h('h1', { id: 'course-navigation-arrival-title' }, placeName),
    stayComplete
      ? h('p', null, onContinue ? '이제 다음 장소로 이동할 차례예요.' : '오늘 코스의 마지막 장소예요.')
      : h('p', null, `${dwellMinutes}분 체류 중이에요. ${remainingMinutes}분 뒤 다음 장소로 이동할 수 있어요.`),
    !stayComplete && h('button', {
      className: 'course-navigation-stay-edit-toggle',
      type: 'button',
      onClick: () => setEditingDwell((current) => !current),
      'aria-expanded': editingDwell,
    }, editingDwell ? '수정 닫기' : '체류시간 수정하기'),
    editingDwell && h('div', { className: 'course-navigation-stay-editor' },
      h('button', { type: 'button', onClick: () => setDwellMinutes((current) => Math.max(0, current - 10)), 'aria-label': '체류시간 10분 줄이기' }, '−'),
      h('strong', null, `${dwellMinutes}분`),
      h('button', { type: 'button', onClick: () => setDwellMinutes((current) => Math.min(1440, current + 10)), 'aria-label': '체류시간 10분 늘리기' }, '+'),
    ),
    editingDwell && onDwellChanged && h(CourseActionButton, {
      onClick: () => onDwellChanged(stop, dwellMinutes, (arrivedAt || Date.now()) + (dwellMinutes * 60_000)),
      disabled: replanBusy,
    }, replanBusy ? '남은 코스 계산 중…' : '남은 코스 다시 계산하기'),
    replanError && h('p', { className: 'course-navigation-replan-error', role: 'status' }, replanError),
    stayComplete && onContinue && h(CourseActionButton, { onClick: onContinue }, '다음 장소로 이동하기'),
    isLastStop && onCompleteCourse && h('section', { className: 'course-navigation-complete-confirm', 'aria-label': '오늘 코스 종료 확인' },
      h('strong', null, '오늘 코스를 종료할까요?'),
      h('p', null, '종료하면 완료 탭에 오늘의 코스가 저장돼요.'),
      h(CourseActionButton, { onClick: onCompleteCourse, disabled: completeBusy, 'aria-busy': completeBusy || undefined }, completeBusy ? '종료하는 중…' : '코스 종료'),
      completeError && h('p', { className: 'course-navigation-complete-error', role: 'alert' }, completeError),
    ),
    h('button', { className: 'course-navigation-place-link', type: 'button', onClick: onViewPlace }, '장소 상세 보기'),
  );
}

function CourseFilmingArrival({ place, onViewFilming }) {
  const placeName = place?.name || place?.placeName || '촬영지';
  return h('section', { className: 'course-navigation-arrival course-filming-arrival', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'course-filming-arrival-title' },
    h('span', null, '촬영지 근처에 도착했어요'),
    h('h1', { id: 'course-filming-arrival-title' }, placeName),
    h('p', null, '이곳에서 촬영된 장면을 확인하고 같은 구도로 촬영해보세요.'),
    h(CourseActionButton, { onClick: onViewFilming }, '촬영 장면 보기'),
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
  if (!route || route.status !== 'AVAILABLE') {
    return h('div', { className: 'course-preview-route-unavailable', role: 'status' }, h('span', null, '이전 지점에서 이동'), h('strong', null, '경로 정보 없음'));
  }
  const transitLegs = (route.legs || []).filter((leg) => leg?.mode && leg.mode !== 'WALK');
  const routeNames = [...new Set(transitLegs.map((leg) => leg.routeName).filter(Boolean))];
  const mainRoute = routeNames[0] || MODE_LABELS[route.mode] || route.mode || '이동';
  const details = [routeMetric(route)];
  if (route.transferCount !== null && route.transferCount !== undefined && route.transferCount > 0) details.push(`환승 ${route.transferCount}회`);
  return h(
    'div',
    { className: 'course-preview-route course-preview-route-brief', 'aria-label': '이전 지점에서 오는 경로' },
    h('strong', null, mainRoute),
    h('span', null, details.join(' · ')),
  );
}

function CoursePreviewLegHeader({ stop, route, startTime }) {
  const durationMinutes = finiteNumber(route?.durationSeconds) === null
    ? finiteNumber(stop?.travelMinutesFromPrevious)
    : route.durationSeconds / 60;
  const distanceMeters = finiteNumber(route?.distanceMeters) === null
    ? finiteNumber(stop?.travelDistanceMeters)
    : route.distanceMeters;
  const transferCount = finiteNumber(route?.transferCount);
  const mode = MODE_LABELS[route?.mode || stop?.selectedMode] || '이동';
  const arrivalTime = stop?.scheduledArrival || null;
  return h(
    'li',
    { className: 'course-preview-leg-header' },
    h('div', { className: 'course-preview-leg-metrics' },
      h('b', null, Number.isFinite(durationMinutes) ? formatPreviewDuration(durationMinutes) : '이동 시간 확인 중'),
      h('span', null, [mode, Number.isFinite(distanceMeters) && formatPreviewDistance(distanceMeters), transferCount !== null && transferCount > 0 && `환승 ${transferCount}회`].filter(Boolean).join(' · ')),
    ),
    (startTime || arrivalTime) && h('small', null, [startTime && `${startTime} 출발`, arrivalTime && `${arrivalTime} 도착 예정`].filter(Boolean).join(' → ')),
  );
}

function NavigationRoutePlan({ route }) {
  const legs = (route?.legs || []).filter((leg) => leg?.mode);
  if (route?.status !== 'AVAILABLE' || legs.length === 0) return null;
  return h('ol', { className: 'course-navigation-route-plan course-preview-route-timeline', 'aria-label': '다음 장소까지 전체 이동 동선' }, legs.map((leg, index) => {
    const duration = leg.durationSeconds === null || leg.durationSeconds === undefined
      ? null
      : formatPreviewDuration(leg.durationSeconds / 60);
    const distance = finiteNumber(leg.distanceMeters) === null ? null : formatPreviewDistance(leg.distanceMeters);
    const firstWalkStep = leg.mode === 'WALK'
      ? leg.steps?.find((step) => typeof step?.description === 'string' && step.description.trim())
      : null;
    const isTransferWalk = leg.mode === 'WALK'
      && legs[index - 1]?.mode && legs[index - 1].mode !== 'WALK'
      && legs[index + 1]?.mode && legs[index + 1].mode !== 'WALK';
    const label = leg.mode === 'WALK'
      ? isTransferWalk ? '환승 이동' : firstWalkStep?.description || '도보 이동'
      : leg.routeName || '대중교통 이용';
    const mode = leg.mode === 'WALK' ? '도보' : leg.mode === 'TAXI' ? '택시' : '대중교통';
    const ModeIcon = leg.mode === 'WALK'
      ? Footprints
      : leg.mode === 'TAXI'
        ? CarFront
        : /버스|bus/i.test(leg.routeName || '') ? BusFront : TrainFront;
    return h('li', { key: `${leg.mode}-${leg.routeName || 'route'}-${index}`, className: `is-${leg.mode.toLowerCase()}${isTransferWalk ? ' is-transfer' : ''}` },
      h('i', { 'aria-hidden': 'true' }, h(ModeIcon, { size: 15, strokeWidth: 1.8 })),
      h('div', null,
        h('strong', null, label),
        h('span', null, [mode, duration, distance].filter(Boolean).join(' · ')),
      ),
    );
  }));
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

function CoursePreviewSegmentStart({ origin, previousStop, startTime }) {
  if (!previousStop) return h(CoursePreviewOrigin, { origin, startTime });
  return h(
    'li',
    { className: 'course-preview-origin' },
    h('span', { className: 'course-preview-origin-marker', 'aria-hidden': 'true' }, previousStop.sequenceNo || '•'),
    h('div', null,
      h('strong', null, previousStop.placeName || '이전 장소'),
      previousStop.address && h('small', null, previousStop.address),
    ),
    previousStop.scheduledDeparture && h('time', null, `${previousStop.scheduledDeparture} 출발`),
  );
}

function RouteSelector({ stop, selection, onChange }) {
  if (!stop?.alternativeRoute) return null;
  const routeKey = stopRouteSelectionKey(stop);
  const selectedRoute = stop.selectedRoute || stop.incomingRoute;
  return h(
    'fieldset',
    { className: 'course-preview-route-selector' },
    h('legend', null, '이동 방법'),
    h('label', null,
      h('input', {
        type: 'radio',
        name: `course-route-${routeKey}`,
        value: 'selected',
        checked: selection !== 'alternative',
        onChange: () => onChange('selected'),
      }),
      h('span', null,
        h('em', null, '추천'),
        h('strong', null, MODE_LABELS[selectedRoute?.mode] || selectedRoute?.mode || '이동'),
        h('b', null, routeDurationLabel(selectedRoute)),
        selectedRoute?.transferCount > 0 && h('small', null, `환승 ${selectedRoute.transferCount}회`),
      ),
    ),
    h('label', null,
      h('input', {
        type: 'radio',
        name: `course-route-${routeKey}`,
        value: 'alternative',
        checked: selection === 'alternative',
        onChange: () => onChange('alternative'),
      }),
      h('span', null,
        h('strong', null, MODE_LABELS[stop.alternativeRoute.mode] || stop.alternativeRoute.mode || '이동'),
        h('b', null, routeDurationLabel(stop.alternativeRoute)),
        finiteNumber(stop.alternativeRoute.distanceMeters) !== null && h('small', null, formatPreviewDistance(stop.alternativeRoute.distanceMeters)),
      ),
    ),
  );
}

function CoursePlaceOrbitSlider({ stops, selectedIndex, onSelect }) {
  const [position, setPosition] = useState(Number.isInteger(selectedIndex) ? selectedIndex : 0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const count = stops.length;

  useEffect(() => setPosition(Number.isInteger(selectedIndex) ? selectedIndex : 0), [selectedIndex]);

  const updatePosition = (clientX) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = Math.max(0, Math.min(count - 1, drag.startPosition - ((clientX - drag.startX) / 76)));
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastTime);
    drag.velocity = ((next - drag.position) / elapsed) * .68 + (drag.velocity * .32);
    drag.position = next;
    drag.lastTime = now;
    setPosition(next);
    const nearest = Math.round(next);
    if (nearest !== drag.lastIndex) {
      drag.lastIndex = nearest;
      onSelect(nearest);
    }
  };
  const finishDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragging(false);
    const projected = Math.max(0, Math.min(count - 1, drag.position + (drag.velocity * 92)));
    const nearest = Math.round(projected);
    setPosition(nearest);
    onSelect(nearest);
  };

  return h('section', {
    className: `course-place-orbit${dragging ? ' is-dragging' : ''}`,
    'aria-label': '코스 장소 선택',
    onPointerDown: (event) => {
      const item = event.target.closest?.('[data-course-orbit-index]');
      if (item) {
        const index = Number(item.dataset.courseOrbitIndex);
        if (Number.isInteger(index) && index >= 0 && index < count) {
          setPosition(index);
          onSelect(index);
        }
        return;
      }
      dragRef.current = {
        startX: event.clientX,
        startPosition: position,
        position,
        velocity: 0,
        lastTime: performance.now(),
        lastIndex: Math.round(position),
      };
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event) => updatePosition(event.clientX),
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
  }, stops.map((stop, index) => {
    const distance = index - position;
    const absoluteDistance = Math.abs(distance);
    if (absoluteDistance > 2.7) return null;
    const isSelected = Number.isInteger(selectedIndex) && absoluteDistance < .45;
    const imageUrl = typeof stop.imageUrl === 'string' ? stop.imageUrl.trim() : '';
    return h('button', {
      key: `${stop.basketItemId ?? index}-${stop.placeName}`,
      type: 'button',
      'data-course-orbit-index': index,
      className: `course-place-orbit-item${isSelected ? ' is-selected' : ''}`,
      onClick: () => { setPosition(index); onSelect(index); },
      style: {
        '--orbit-x': `${distance * 76}px`,
        '--orbit-y': `${absoluteDistance * 10}px`,
        '--orbit-scale': String(Math.max(.68, 1 - absoluteDistance * .13)),
        '--orbit-opacity': String(Math.max(.32, 1 - absoluteDistance * .26)),
      },
      'aria-pressed': isSelected,
    },
    h('span', { className: 'course-place-orbit-media' }, imageUrl ? h('img', { src: imageUrl, alt: '', draggable: false }) : h('b', null, index + 1)),
    h('i', null, index + 1),
    h('small', null, stop.placeName || '장소'));
  }));
}

function CourseOverviewOrder({ stops, onSelect, timelineRef }) {
  return h('ol', {
    className: 'course-preview-overview-order',
    'aria-label': '전체 코스 방문 순서',
    ref: timelineRef,
  },
    stops.map((stop, index) => {
      const nextStop = stops[index + 1] || null;
      const nextRoute = nextStop?.selectedRoute || nextStop?.incomingRoute || null;
      const routeCopy = nextRoute?.status === 'AVAILABLE'
        ? `${MODE_LABELS[nextRoute.mode] || nextRoute.mode || '이동'} ${routeDurationLabel(nextRoute)}`
        : '다음 장소로 이동';
      return h('li', { key: stop.basketItemId ?? `${stop.sequenceNo ?? index}-${stop.placeName ?? 'place'}` },
        h('button', {
          'aria-label': `${index + 1}번 ${stop.placeName || '장소'} 구간 상세 보기`,
          className: 'course-preview-overview-stop',
          onClick: () => onSelect(index),
          type: 'button',
        },
        h('span', { 'aria-hidden': true }, index + 1),
        h('div', null,
          h('strong', null, stop.placeName || '장소 정보 없음'),
          stop.scheduledArrival && h('small', null, `${stop.scheduledArrival} 도착`),
        ),
        h('b', { 'aria-hidden': true }, '›')),
        nextStop && h('p', { className: 'course-preview-overview-leg' },
          h('i', { 'aria-hidden': true }),
          h('small', null, routeCopy)),
      );
    }));
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

function StopCard({ stop, showAscent, showCongestion, routeSelection, onRouteSelectionChange, selected, onSelect, stopRef, readOnly = false, compact = false, showIncomingRoute = true, destination = false }) {
  return h(
    'li',
    { className: `course-preview-stop${selected ? ' is-selected' : ''}`, ref: stopRef },
    !readOnly && !compact && h(RouteSelector, { stop, selection: routeSelection, onChange: onRouteSelectionChange }),
    showIncomingRoute && h(IncomingRoute, { route: stop.incomingRoute }),
    h(
      'button',
      { type: 'button', className: 'course-preview-stop-button', onClick: onSelect, 'aria-pressed': selected },
      h('header', null,
        h('b', null, destination ? '도' : stop.sequenceNo),
        h('div', null, h('h2', null, stop.placeName || '장소 정보 없음'), h('p', null, stop.address || '주소 정보 없음')),
        destination && stop.scheduledArrival && h('time', null, `${stop.scheduledArrival} 도착`),
      ),
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
  onArrivalPlace = null,
  filmingNotice = null,
  onViewFilming = null,
  onNavigationLocationChange = null,
  onDwellChanged = null,
  replanBusy = false,
  replanError = null,
  onCompleteCourse = null,
  completeBusy = false,
  completeError = null,
  onStart = null,
  onConfirm = null,
  confirmLabel = '이 코스로 시작하기',
  editLabel = '조건 수정',
  confirmBusy = false,
  confirmError = null,
  readOnly = false,
  navigationMode = false,
}) {
  const [selection, setSelection] = useState({ preview: null, strategy: 'FAST', routeSelections: {} });
  const [strategyFeedback, setStrategyFeedback] = useState(null);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [routeDrawn, setRouteDrawn] = useState(false);
  const [arrivalStop, setArrivalStop] = useState(null);
  const [arrivalStartedAt, setArrivalStartedAt] = useState(null);
  const [navigationInstruction, setNavigationInstruction] = useState('');
  const [navigationPanelExpanded, setNavigationPanelExpanded] = useState(false);
  const [navigationObservation, setNavigationObservation] = useState(null);
  const [readyNavigationRouteKey, setReadyNavigationRouteKey] = useState('');
  const [showPreviewLoader, setShowPreviewLoader] = useState(status === 'loading');
  const [sheetOffset, setSheetOffset] = useState(0);
  const [sheetSnapIndex, setSheetSnapIndex] = useState(1);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetFrameRef = useRef(null);
  const sheetRef = useRef(null);
  const sheetOffsetRef = useRef(0);
  const sheetSnapPointsRef = useRef([0, 0]);
  const sheetSnapIndexRef = useRef(1);
  const sheetDragRef = useRef(null);
  const sheetRafRef = useRef(null);
  const sheetTimelineRef = useRef(null);
  const stopRefs = useRef(new Map());
  const pendingScrollStopIdRef = useRef(null);

  const updateSheetSnapPoints = () => {
    const frame = sheetFrameRef.current;
    if (!frame || frame.clientHeight <= 0) return;
    const height = frame.clientHeight;
    const orbitClearance = Math.min(108, Math.max(0, height - 220));
    const collapsedReveal = Math.min(132, Math.max(92, height * 0.28));
    const timeline = sheetTimelineRef.current;
    const timelineChildren = timeline?.children ? Array.from(timeline.children) : [];
    const timelineContentHeight = timelineChildren.reduce(
      (total, child) => total + (Number(child?.getBoundingClientRect?.().height) || 0),
      0,
    );
    const detailReveal = Math.min(
      height - orbitClearance,
      Math.max(collapsedReveal, 36 + 58 + timelineContentHeight + 18),
    );
    const points = [
      Math.max(orbitClearance, height - detailReveal),
      Math.max(0, height - collapsedReveal),
    ];
    sheetSnapPointsRef.current = points;
    const nextOffset = points[sheetSnapIndexRef.current] ?? 0;
    sheetOffsetRef.current = nextOffset;
    setSheetOffset(nextOffset);
  };

  useLayoutEffect(() => {
    sheetSnapIndexRef.current = 1;
    setSheetSnapIndex(1);
    sheetOffsetRef.current = 0;
    setSheetOffset(0);
    updateSheetSnapPoints();
    const frame = sheetFrameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateSheetSnapPoints);
    observer.observe(frame);
    if (sheetTimelineRef.current) observer.observe(sheetTimelineRef.current);
    return () => observer.disconnect();
  }, [preview, showPreviewLoader]);

  useEffect(() => () => {
    if (sheetRafRef.current !== null) globalThis.cancelAnimationFrame?.(sheetRafRef.current);
  }, []);

  useEffect(() => {
    if (!strategyFeedback) return undefined;
    const timeoutId = globalThis.setTimeout(() => setStrategyFeedback(null), 1800);
    return () => globalThis.clearTimeout(timeoutId);
  }, [strategyFeedback]);

  const presentSheetOffset = (nextOffset) => {
    const points = sheetSnapPointsRef.current;
    const minOffset = points[0] || 0;
    const maxOffset = points[points.length - 1] || 0;
    const bounded = Math.max(minOffset, Math.min(maxOffset, nextOffset));
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
    const minOffset = points[0] || 0;
    const maxOffset = points[points.length - 1] || 0;
    const fallback = Math.max(minOffset, Math.min(maxOffset, sheetOffsetRef.current));
    if (!sheet || typeof globalThis.getComputedStyle !== 'function') return fallback;
    const transform = globalThis.getComputedStyle(sheet).transform;
    if (!transform || transform === 'none') return fallback;
    const matrixMatch = /^matrix(3d)?\(([^)]+)\)$/.exec(transform);
    if (matrixMatch) {
      const values = matrixMatch[2].split(',').map(Number);
      const translateY = matrixMatch[1] ? values[13] : values[5];
      if (Number.isFinite(translateY)) return Math.max(minOffset, Math.min(maxOffset, translateY));
    }
    const translateMatch = /translateY\(\s*(-?[\d.]+)px\s*\)/.exec(transform);
    if (translateMatch && Number.isFinite(Number(translateMatch[1]))) {
      return Math.max(minOffset, Math.min(maxOffset, Number(translateMatch[1])));
    }
    return fallback;
  };

  const snapSheetTo = (index) => {
    updateSheetSnapPoints();
    const boundedIndex = Math.max(0, Math.min(1, index));
    sheetSnapIndexRef.current = boundedIndex;
    setSheetSnapIndex(boundedIndex);
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

  useLayoutEffect(() => {
    const pendingStopId = pendingScrollStopIdRef.current;
    if (pendingStopId === null || String(selectedStopId) !== pendingStopId) return;
    pendingScrollStopIdRef.current = null;
    scrollStopIntoView(pendingStopId);
  }, [selectedStopId]);

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
      snapSheetTo(sheetSnapIndexRef.current === 0 ? 1 : 0);
    }
  };
  useEffect(() => {
    setSelectedStopId(null);
    setRouteDrawn(false);
    setArrivalStop(null);
    setNavigationPanelExpanded(false);
  }, [preview]);
  const simulatedRouteCoordinates = navigationMode
    ? navigationRouteCoordinatesForPreview(preview, selection, selectedStopId, origin)
    : [];
  const navigationRouteKey = simulatedRouteCoordinates
    .map(([longitude, latitude]) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`)
    .join('|');
  const navigationRouteReady = Boolean(
    navigationRouteKey && readyNavigationRouteKey === navigationRouteKey,
  );
  const simulatedUserLocation = useRoutePositionSimulation(
    simulatedRouteCoordinates,
    shouldStartRouteSimulation(navigationMode, Boolean(import.meta.env?.DEV), navigationRouteReady),
  );

  const publishNavigationLocation = (observation) => {
    if (!Array.isArray(observation?.coordinate)) return;
    setNavigationObservation(observation);
    onNavigationLocationChange?.(observation.coordinate);
  };

  useEffect(() => {
    if (!navigationMode || !simulatedUserLocation) return;
    publishNavigationLocation({
      coordinate: simulatedUserLocation,
      heading: null,
      speed: null,
      accuracy: null,
      timestamp: Date.now(),
    });
  }, [navigationMode, onNavigationLocationChange, simulatedUserLocation?.[0], simulatedUserLocation?.[1]]);

  useEffect(() => {
    if (!navigationMode) setNavigationObservation(null);
  }, [navigationMode]);

  useEffect(() => {
    if (status === 'loading') {
      setShowPreviewLoader(true);
      return undefined;
    }
    if (status === 'success' && showPreviewLoader) {
      const timer = globalThis.setTimeout(
        () => setShowPreviewLoader(false),
        COURSE_PREVIEW_COMPLETION_DURATION,
      );
      return () => globalThis.clearTimeout(timer);
    }
    setShowPreviewLoader(false);
    return undefined;
  }, [status, showPreviewLoader]);

  const previewLoaderCompleting = status === 'success' && showPreviewLoader;
  if (status === 'loading' || previewLoaderCompleting) {
    return h(
      'section',
      { className: 'phone standard-screen course-preview-screen course-preview-loading', 'aria-busy': !previewLoaderCompleting },
      h('main', { className: 'page-scroll course-preview-state' },
        h(CoursePreviewLoader, { complete: previewLoaderCompleting }),
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
          onRetry && h(CourseActionButton, { onClick: onRetry }, '다시 계산하기'),
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
  const overviewMode = !navigationMode && selectedStopId === null;
  const availableStrategyOptions = STRATEGY_OPTIONS.filter((item) => (
    options.some((option) => option?.strategy === item.strategy)
  ));
  const selectedStrategyOption = STRATEGY_OPTIONS.find((item) => item.strategy === effectivePreview.strategy)
    || STRATEGY_OPTIONS[0];
  const isEasy = effectivePreview.strategy === 'EASY';
  const isQuiet = effectivePreview.strategy === 'QUIET';
  const strategyName = selectedStrategyOption.name;
  const insight = isEasy || isQuiet ? routeStrategyFeedback(fastPreview, effectivePreview) : null;
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
      imageUrl: stop.imageUrl || stop.thumbnailUrl || stop.image || '',
    }))
    .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
  const loadMapStops = () => Promise.resolve(mapStops);
  const selectedStopIndex = Math.max(0, effectivePreview.stops.findIndex((stop, index) => (
    String(stop.basketItemId ?? `${stop.sequenceNo ?? index}-${stop.placeName ?? 'place'}`) === String(selectedStopId)
  )));
  const activeStop = effectivePreview.stops[selectedStopIndex] || firstStop;
  const previousStop = effectivePreview.stops[selectedStopIndex - 1] || null;
  const nextStop = effectivePreview.stops[selectedStopIndex + 1] || null;
  const navigationStop = activeStop || effectivePreview.stops.find((stop) => stop?.placeName) || firstStop;
  const navigationRoute = navigationStop?.selectedRoute || navigationStop?.incomingRoute;
  const navigationTravel = navigationRoute?.durationMinutes
    ? formatPreviewDuration(navigationRoute.durationMinutes)
    : formatPreviewDuration(effectivePreview.totalTravelMinutes);
  const activeRoute = activeStop?.selectedRoute || activeStop?.incomingRoute;
  const sourceCoordinate = mapCoordinate(previousStop || origin);
  const destinationCoordinate = mapCoordinate(activeStop);
  const routeLegsForSelection = flattenRouteLegs([activeStop]);
  const firstRouteCoordinate = routeLegsForSelection[0]?.geometry?.coordinates?.[0] || null;
  const lastRouteCoordinates = routeLegsForSelection.at(-1)?.geometry?.coordinates || [];
  const lastRouteCoordinate = lastRouteCoordinates.at(-1) || null;
  const selectedRouteLegs = [
    sourceCoordinate && firstRouteCoordinate && !sameMapCoordinate(sourceCoordinate, firstRouteCoordinate) && {
      mode: 'WALK',
      routeName: '출발지 연결',
      geometry: { type: 'LineString', coordinates: [sourceCoordinate, firstRouteCoordinate] },
    },
    ...routeLegsForSelection,
    destinationCoordinate && lastRouteCoordinate && !sameMapCoordinate(lastRouteCoordinate, destinationCoordinate) && {
      mode: 'WALK',
      routeName: '도착지 연결',
      geometry: { type: 'LineString', coordinates: [lastRouteCoordinate, destinationCoordinate] },
    },
  ].filter(Boolean);
  if (selectedRouteLegs.length === 0) {
    const guidanceCoordinates = (activeRoute?.legs || [])
      .flatMap((leg) => leg?.steps || [])
      .map((step) => mapCoordinate(step))
      .filter(Boolean);
    const fallbackCoordinates = [sourceCoordinate, ...guidanceCoordinates, destinationCoordinate]
      .filter(Boolean)
      .filter((coordinate, index, coordinates) => index === 0 || !sameMapCoordinate(coordinate, coordinates[index - 1]));
    if (fallbackCoordinates.length >= 2) selectedRouteLegs.push({
      mode: activeRoute?.mode || 'WALK',
      routeName: '현재 이동 경로',
      geometry: { type: 'LineString', coordinates: fallbackCoordinates },
    });
  }
  const wholeCourseRouteLegs = flattenRouteLegs(effectivePreview.stops).filter((leg) => (
    leg?.geometry?.type === 'LineString'
    && Array.isArray(leg.geometry.coordinates)
    && leg.geometry.coordinates.length >= 2
  ));
  const displayedRouteLegs = overviewMode ? wholeCourseRouteLegs : selectedRouteLegs;
  const hasDrawableRoute = displayedRouteLegs.some((leg) => (
    leg?.geometry?.type === 'LineString'
    && Array.isArray(leg.geometry.coordinates)
    && leg.geometry.coordinates.length >= 2
  ));
  const wholeCourseFitCoordinates = [
    mapCoordinate(origin),
    ...wholeCourseRouteLegs.flatMap((leg) => leg.geometry.coordinates),
    ...mapStops.map((stop) => mapCoordinate(stop)),
  ].filter(Boolean);
  const activeRouteSummary = activeRoute?.status === 'AVAILABLE'
    ? `${MODE_LABELS[activeRoute.mode] || activeRoute.mode || '이동'} ${routeDurationLabel(activeRoute)} · ${formatPreviewDistance(activeRoute.distanceMeters)}`
    : [previousStop?.placeName, nextStop?.placeName].filter(Boolean).join(' → ') || '코스 장소 정보';
  const selectedPlaceKey = !overviewMode && activeStop
    ? `INTERNAL:${activeStop.basketItemId ?? `${activeStop.sequenceNo ?? selectedStopIndex}-${activeStop.placeName ?? 'place'}`}`
    : '';
  const selectStopAtIndex = (index, shouldRevealSheet = false) => {
    const stop = effectivePreview.stops[index];
    if (!stop) return;
    const id = stop.basketItemId ?? `${stop.sequenceNo ?? index}-${stop.placeName ?? 'place'}`;
    if (shouldRevealSheet) pendingScrollStopIdRef.current = String(id);
    setSelectedStopId(id);
  };
  const handleMapPlaceClick = (place) => {
    const id = place?.id ?? null;
    if (id === null || id === undefined) return;
    const index = effectivePreview.stops.findIndex((stop, stopIndex) => (
      String(stop.basketItemId ?? `${stop.sequenceNo ?? stopIndex}-${stop.placeName ?? 'place'}`) === String(id)
    ));
    if (index >= 0) selectStopAtIndex(index, true);
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
    { className: `phone standard-screen course-preview-screen course-preview-result${sheetSnapIndex === 0 ? ' is-sheet-expanded' : ''}${readOnly ? ' is-read-only' : ''}${navigationMode ? ' course-preview-navigation' : ''}`, 'aria-busy': false },
    navigationMode
      ? h('header', { className: 'navigation-top-card course-navigation-top-card' },
        h('button', { className: 'icon-button', type: 'button', onClick: onBack, 'aria-label': '이전' }, '‹'),
        h('div', null,
          h('strong', null, '코스 진행 중'),
          h('span', null, navigationInstruction || (navigationStop?.placeName ? `${navigationStop.placeName}로 이동 중` : '다음 장소로 이동 중')),
        ),
        onCompleteCourse && h('button', {
          className: 'course-navigation-finish-button',
          type: 'button',
          onClick: onCompleteCourse,
          disabled: completeBusy,
          'aria-busy': completeBusy || undefined,
        }, completeBusy ? '종료 중…' : '종료'),
        h('b', null, `${effectivePreview.stops.length}곳`),
      )
      : h('header', { className: 'course-preview-header course-preview-map-header' },
      h('button', { type: 'button', onClick: onBack, 'aria-label': '이전' }, '‹'),
      !readOnly && availableStrategyOptions.length > 1 && h(
        'div',
        { className: 'course-preview-tabs', role: 'tablist', 'aria-label': '경로 기준' },
        availableStrategyOptions.map((item) => h(
          'button',
          { key: item.strategy, type: 'button', className: 'course-preview-tab', role: 'tab', 'aria-selected': effectivePreview.strategy === item.strategy, onClick: () => {
            setSelection((current) => ({
              preview,
              strategy: item.strategy,
              routeSelections: current.preview === preview ? current.routeSelections : {},
            }));
            setSelectedStopId(null);
            const nextPreview = options.find((option) => option?.strategy === item.strategy) || fastPreview;
            setStrategyFeedback(routeStrategyFeedback(fastPreview, nextPreview));
          } }, item.label,
        )),
      ),
    ),
    h('div', { className: `course-preview-stage${routeDrawn ? ' is-drawn' : ''}` },
      !navigationMode && h('div', { className: 'course-preview-floating', style: { top: '116px' }, 'aria-hidden': 'true' },
        h('span', null, `${formatPreviewDuration(effectivePreview.totalDurationMinutes)} · ${formatPreviewDistance(effectivePreview.totalDistanceMeters)}`),
        insight && h('span', { className: `course-preview-insight-chip is-${insight.kind}` }, insight.chip),
      ),
      !navigationMode && strategyFeedback && h('aside', { className: `course-preview-strategy-feedback is-${strategyFeedback.kind}`, role: 'status' },
        h('strong', null, strategyFeedback.title),
        h('span', null, strategyFeedback.label),
        h('div', null,
          h('b', null, `${strategyFeedback.before} → ${strategyFeedback.after}`),
          h('em', null, `${strategyFeedback.reduction}% ↓`),
        ),
        strategyFeedback.extraMinutes !== null && h('small', null, strategyFeedback.extraMinutes > 0
          ? `빠른 길보다 +${strategyFeedback.extraMinutes}분`
          : strategyFeedback.extraMinutes < 0
            ? `빠른 길보다 ${Math.abs(strategyFeedback.extraMinutes)}분 빨라요`
            : '빠른 길과 같은 시간이에요'),
      ),
      navigationMode && completeError && h('p', { className: 'course-navigation-finish-error', role: 'alert' }, completeError),
      navigationMode && h(CourseNavigationGuidance, { preview: effectivePreview, route: activeRoute, destination: navigationStop, currentLocation: simulatedUserLocation, onLocationChange: publishNavigationLocation, onArrival: (stop) => {
        setArrivalStop(stop);
        setArrivalStartedAt(Date.now());
      }, onGuidanceChange: setNavigationInstruction }),
      !navigationMode && effectivePreview.stops.length > 1 && h('button', {
        'aria-pressed': overviewMode,
        className: `course-preview-overview-button${overviewMode ? ' is-active' : ''}`,
        onClick: () => setSelectedStopId(null),
        type: 'button',
      }, overviewMode ? '전체 코스' : '전체 코스 보기'),
      MapComponent && h(MapComponent, {
        ariaLabel: `${strategyName} 코스 추천 경로 지도`,
        interactive: true,
        center: navigationMode && !navigationRouteReady
          ? sourceCoordinate || fallbackCenter
          : hasDrawableRoute ? undefined : fallbackCenter,
        loadPlacesInBounds: loadMapStops,
        placeMarkerLabel: (place) => place.sequenceNo,
        placeMarkerEntrance: isQuiet ? 'renumber' : 'pop',
        placeMarkerOffset: false,
        selectedPlaceKey,
        focusedPlaceKey: '',
        onPlaceClick: handleMapPlaceClick,
        clusterPlaces: false,
        fitPlaceMarkers: !hasDrawableRoute,
        placeRequestKey: effectivePreview.routeFitKey,
        showCongestionAreas: false,
        mapDimmed: Boolean(navigationMode && filmingNotice),
        routeLegs: displayedRouteLegs,
        ghostRouteLegs: overviewMode || navigationMode ? [] : wholeCourseRouteLegs,
        ghostHighlightLegs: [],
        routeHighlightLegs: navigationMode ? selectedRouteLegs : [],
        routeMode: 'TRANSIT',
        routeAppearance: 'focus',
        navigationMode,
        routeFitKey: navigationMode ? '' : overviewMode
          ? `${effectivePreview.routeFitKey}|overview`
          : `${effectivePreview.routeFitKey}|stop:${selectedStopIndex}`,
        routeDrawKey: navigationMode
          ? ''
          : overviewMode
            ? `${effectivePreview.routeFitKey}|overview`
            : `${effectivePreview.routeFitKey}|stop:${selectedStopIndex}`,
        routeDrawDelay: isQuiet ? 560 : 260,
        routeFitCoordinates: overviewMode
          ? wholeCourseFitCoordinates
          : [sourceCoordinate, destinationCoordinate].filter(Boolean),
        routeFitPadding: [156, 32, 176, 32],
        style: { width: '100%', height: '100%' },
        userLocation: navigationObservation?.coordinate || simulatedUserLocation,
        userHeading: navigationObservation?.heading,
        userSpeed: navigationObservation?.speed,
        userLocationAccuracy: navigationObservation?.accuracy,
        followUserLocation: false,
        onRouteDrawEnd: () => {
          setRouteDrawn(true);
          globalThis.setTimeout(() => setRouteDrawn(false), 2000);
        },
        onRouteReady: () => setReadyNavigationRouteKey(navigationRouteKey),
      }),
      !navigationMode && h(CoursePlaceOrbitSlider, {
        stops: effectivePreview.stops,
        selectedIndex: overviewMode ? null : selectedStopIndex,
        onSelect: (index) => selectStopAtIndex(index),
      }),
      !navigationMode && routeDrawn && h('div', { className: 'course-preview-done', role: 'status' }, '오늘의 코스 완성 ✦'),
      navigationMode && !arrivalStop && !filmingNotice && h('section', { className: `course-navigation-destination-slider${navigationPanelExpanded ? ' is-expanded' : ''}`, 'aria-label': '다음 목적지' },
        h('div', { className: 'course-navigation-destination-track' }, effectivePreview.stops.slice(selectedStopIndex).map((stop, offset) => {
          const index = selectedStopIndex + offset;
          const route = stop?.selectedRoute || stop?.incomingRoute;
          const duration = route?.durationMinutes ? formatPreviewDuration(route.durationMinutes) : null;
          const distance = route?.distanceMeters ? formatPreviewDistance(route.distanceMeters) : null;
          return h('article', {
            key: stop.basketItemId ?? `${stop.sequenceNo ?? index}-${stop.placeName ?? 'place'}`,
            className: `course-navigation-destination${index === selectedStopIndex ? ' is-active' : ''}`,
          },
          h('button', {
            className: 'course-navigation-destination-select',
            type: 'button',
            'aria-current': index === selectedStopIndex ? 'step' : undefined,
            onClick: () => selectStopAtIndex(index),
          },
          h('span', null, index === selectedStopIndex ? '다음 장소' : `${index + 1}번째 장소`),
          h('strong', null, stop?.placeName || '장소를 확인하고 있어요'),
          h('p', null, [duration && `이동 ${duration}`, distance].filter(Boolean).join(' · ') || '이동 정보를 확인하고 있어요'),
          ),
          h('button', {
            className: 'course-navigation-destination-toggle',
            type: 'button',
            'aria-expanded': navigationPanelExpanded && index === selectedStopIndex,
            onClick: (event) => {
              event.stopPropagation();
              if (index !== selectedStopIndex) {
                selectStopAtIndex(index);
                setNavigationPanelExpanded(true);
              } else setNavigationPanelExpanded((current) => !current);
            },
          },
          navigationPanelExpanded && index === selectedStopIndex ? '동선 접기' : '동선 보기',
          h('i', { 'aria-hidden': 'true' }, navigationPanelExpanded && index === selectedStopIndex ? '⌃' : '⌄'),
          ),
          navigationPanelExpanded && index === selectedStopIndex && h(NavigationRoutePlan, { route }),
          );
        })),
      ),
      navigationMode && arrivalStop && !filmingNotice && h(CourseNavigationArrival, {
        stop: arrivalStop,
        arrivedAt: arrivalStartedAt,
        onViewPlace: () => onArrivalPlace?.(arrivalStop),
        onContinue: effectivePreview.stops[selectedStopIndex + 1] ? () => {
          selectStopAtIndex(selectedStopIndex + 1);
          setArrivalStop(null);
          setArrivalStartedAt(null);
        } : null,
        onDwellChanged,
        replanBusy,
        replanError,
        onCompleteCourse,
        completeBusy,
        completeError,
      }),
      navigationMode && filmingNotice && h(CourseFilmingArrival, { place: filmingNotice, onViewFilming: () => onViewFilming?.(filmingNotice) }),
      !navigationMode && h('div', { className: 'course-preview-sheet-frame', ref: sheetFrameRef },
        h('section', {
        className: `course-preview-sheet${sheetDragging ? ' is-dragging' : ''}`,
        ref: sheetRef,
        id: 'course-preview-sheet-content',
        style: {
          transform: `translateY(${sheetOffset}px)`,
          height: `calc(100% - ${sheetOffset}px)`,
        },
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
        h('div', {
          className: 'course-preview-sheet-summary',
          onPointerDown: (event) => {
            if (event.target.closest?.('button, input, label')) return;
            handleSheetPointerDown(event);
          },
          onPointerMove: handleSheetPointerMove,
          onPointerUp: finishSheetDrag,
          onPointerCancel: finishSheetDrag,
          },
          h('div', null,
            h('strong', null, overviewMode
              ? '전체 코스'
              : `${selectedStopIndex + 1}. ${activeStop?.placeName || '장소 정보 없음'}`),
            h('small', null, overviewMode
              ? `${effectivePreview.stops.length}곳 · ${formatPreviewDuration(effectivePreview.totalDurationMinutes)} · ${formatPreviewDistance(effectivePreview.totalDistanceMeters)}`
              : activeRouteSummary),
          ),
          h('button', {
            type: 'button',
            'aria-expanded': sheetSnapIndex === 0,
            'aria-controls': 'course-preview-sheet-content',
            onClick: () => snapSheetTo(sheetSnapIndex === 0 ? 1 : 0),
          }, sheetSnapIndex === 0 ? '상세 닫기' : '상세 보기'),
        ),
        h('section', {
          className: 'course-preview-itinerary',
          'aria-labelledby': 'course-preview-itinerary-title',
          onPointerDown: (event) => {
            if (sheetSnapIndexRef.current === 0 || event.target.closest?.('button, input, label')) return;
            handleSheetPointerDown(event);
          },
          onPointerMove: handleSheetPointerMove,
          onPointerUp: finishSheetDrag,
          onPointerCancel: finishSheetDrag,
        },
        overviewMode
          ? h(CourseOverviewOrder, {
            stops: effectivePreview.stops,
            onSelect: selectStopAtIndex,
            timelineRef: sheetTimelineRef,
          })
          : h('ol', { className: 'course-preview-timeline', ref: sheetTimelineRef }, [
          h(CoursePreviewSegmentStart, {
            origin,
            previousStop,
            startTime: effectivePreview.scheduledStart,
            key: `course-preview-segment-start-${selectedStopIndex}`,
          }),
          h(CoursePreviewLegHeader, {
            route: activeRoute,
            stop: activeStop,
            startTime: previousStop?.scheduledDeparture || effectivePreview.scheduledStart,
            key: `course-preview-leg-header-${activeStop?.basketItemId ?? selectedStopIndex}`,
          }),
          !readOnly && activeStop?.alternativeRoute && h('li', { className: 'course-preview-segment-choice', key: `course-preview-segment-selector-${activeStop?.basketItemId ?? selectedStopIndex}` }, h(RouteSelector, {
            stop: activeStop,
            selection: routeSelections[stopRouteSelectionKey(activeStop, selectedStopIndex)],
            onChange: (value) => updateRouteSelection(activeStop, selectedStopIndex, value),
          })),
          activeRoute?.status === 'AVAILABLE' && activeRoute.legs?.some((leg) => leg?.mode) && h('li', { className: 'course-preview-segment-legs', key: `course-preview-segment-legs-${activeStop?.basketItemId ?? selectedStopIndex}` }, h(NavigationRoutePlan, {
            route: activeRoute,
          })),
          h(StopCard, {
            stop: activeStop,
            showAscent: isEasy && isTerrainEligibleRoute(activeRoute),
            showCongestion: isQuiet,
            key: `course-preview-segment-stop-${activeStop?.basketItemId ?? selectedStopIndex}`,
            selected: true,
            stopRef: (element) => {
              const id = String(activeStop?.basketItemId ?? `${activeStop?.sequenceNo ?? selectedStopIndex}-${activeStop?.placeName ?? 'place'}`);
              if (element) stopRefs.current.set(id, element);
              else stopRefs.current.delete(id);
            },
            onSelect: () => selectStopAtIndex(selectedStopIndex),
            routeSelection: routeSelections[stopRouteSelectionKey(activeStop, selectedStopIndex)],
            onRouteSelectionChange: (value) => updateRouteSelection(activeStop, selectedStopIndex, value),
            readOnly,
            compact: true,
            showIncomingRoute: false,
            destination: true,
          }),
        ]),
      ),
        ),
      ),
    ),
    !navigationMode && h('div', { className: `sticky-actions course-preview-actions${readOnly ? ' is-read-only' : ''}` },
      confirmBusy && h('div', { className: 'course-preview-save-status', role: 'status', 'aria-live': 'polite' },
        h('span', { 'aria-hidden': 'true' }),
        h('p', null,
          h('strong', null, confirmLabel.includes('저장') ? '코스를 저장하고 있어요' : '코스를 시작할 준비 중이에요'),
          h('small', null, '선택한 경로를 다시 확인하고 있어요. 최대 30초 정도 걸릴 수 있어요.'),
        ),
      ),
      onConfirm && h(CourseActionButton, {
        'aria-busy': confirmBusy || undefined,
        disabled: confirmBusy,
        onClick: () => onConfirm({ strategy: effectivePreview.strategy, routeSelections }),
      }, confirmBusy ? (confirmLabel.includes('저장') ? '저장 중…' : '준비 중…') : confirmLabel),
      onStart && !onConfirm && h(CourseActionButton, { onClick: onStart }, '이 코스로 시작하기'),
      !readOnly && onEditConditions && h('button', { className: 'ui-button secondary', type: 'button', onClick: onEditConditions }, editLabel),
      confirmError && h('p', { className: 'course-preview-confirm-error', role: 'alert' }, confirmError),
    ),
  );
}
