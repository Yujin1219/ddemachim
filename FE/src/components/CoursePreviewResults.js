import React, { useState } from 'react';

import {
  formatCongestionLevel,
  formatPreviewDistance,
  formatPreviewDuration,
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

function StopCard({ stop, showAscent, showCongestion }) {
  const sourceLabel = stop.hoursSourceType === 'REAL' ? '실제 운영시간' : '데모 기본 운영시간';
  const hours = stop.openTime && stop.closeTime ? `${stop.openTime}-${stop.closeTime}` : '정보 없음';
  return h(
    'li',
    { className: 'course-preview-stop' },
    h(IncomingRoute, { route: stop.incomingRoute }),
    h(
      'article',
      null,
      h('header', null, h('b', null, stop.sequenceNo), h('div', null, h('h2', null, stop.placeName || '장소 정보 없음'), h('p', null, stop.address || '주소 정보 없음'))),
      h('p', { className: 'course-preview-stop-time' }, `${stop.scheduledArrival || '정보 없음'} 도착 · ${stop.scheduledDeparture || '정보 없음'} 출발`),
      h('p', { className: 'course-preview-stop-hours' }, `${sourceLabel} · ${hours}`),
      h('div', { className: 'course-preview-stop-meta' },
        h('span', null, `체류 ${formatPreviewDuration(stop.dwellMinutes)}`),
        stop.arrivalDeadline && h('span', null, `도착 제한 ${stop.arrivalDeadline}${stop.arrivalBufferMinutes ? ` · ${stop.arrivalBufferMinutes}분 여유` : ''}`),
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
  const [selection, setSelection] = useState({ preview: null, strategy: 'FAST' });
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
  const availableStrategyOptions = STRATEGY_OPTIONS.filter((item) => (
    options.some((option) => option?.strategy === item.strategy)
  ));
  const selectedStrategyOption = STRATEGY_OPTIONS.find((item) => item.strategy === selectedPreview.strategy)
    || STRATEGY_OPTIONS[0];
  const isEasy = selectedPreview.strategy === 'EASY';
  const isQuiet = selectedPreview.strategy === 'QUIET';
  const strategyName = selectedStrategyOption.name;
  const averageCongestionLevel = isQuiet
    ? formatCongestionLevel(selectedPreview.averageCongestionScore)
    : null;
  const hasDrawableRoute = Array.isArray(selectedPreview.routeLegs) && selectedPreview.routeLegs.some((leg) => (
    leg?.geometry?.type === 'LineString'
    && Array.isArray(leg.geometry.coordinates)
    && leg.geometry.coordinates.length >= 2
  ));
  const firstStop = selectedPreview.stops[0];
  const fallbackCenter = Number.isFinite(firstStop?.longitude) && Number.isFinite(firstStop?.latitude)
    ? [firstStop.longitude, firstStop.latitude]
    : undefined;
  return h(
    'section',
    { className: 'phone standard-screen course-preview-screen', 'aria-busy': false },
    h(
      'main',
      { className: 'page-scroll course-preview-scroll' },
      h('header', { className: 'course-preview-header' }, h('button', { type: 'button', onClick: onBack, 'aria-label': '이전' }, '‹'), h('div', null, h('span', null, `${selectedPreview.strategy} · 추천 결과`), h('h1', null, `${strategyName} 코스`))),
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
            checked: selectedPreview.strategy === item.strategy,
            onChange: (event) => setSelection({ preview, strategy: event.target.value }),
          }),
          h('span', null, h('strong', null, item.label), h('small', null, item.description)),
        )),
      ),
      h('p', { className: 'course-preview-schedule' }, `${selectedPreview.scheduledStart || '정보 없음'}-${selectedPreview.scheduledEnd || '정보 없음'} · ${selectedPreview.stopCount ?? selectedPreview.stops.length}곳`),
      averageCongestionLevel && h(CongestionBadge, { prefix: '평균 혼잡도', score: selectedPreview.averageCongestionScore }),
      MapComponent && h('div', { className: 'course-preview-map' }, h(MapComponent, {
        ariaLabel: `${strategyName} 코스 추천 경로 지도`,
        interactive: false,
        center: hasDrawableRoute ? undefined : fallbackCenter,
        routeLegs: selectedPreview.routeLegs,
        routeMode: 'TRANSIT',
        routeFitKey: selectedPreview.routeFitKey,
        style: { width: '100%', height: '100%' },
      })),
      h('dl', { className: 'course-preview-totals' },
        h('div', null, h('dt', null, '전체'), h('dd', null, formatPreviewDuration(selectedPreview.totalDurationMinutes))),
        h('div', null, h('dt', null, '이동 '), h('dd', null, formatPreviewDuration(selectedPreview.totalTravelMinutes))),
        isEasy
          ? h('div', null, h('dt', null, '상승 고도'), h('dd', null, formatPreviewAscent(selectedPreview.totalAscentMeters)))
          : h('div', null, h('dt', null, '거리'), h('dd', null, formatPreviewDistance(selectedPreview.totalDistanceMeters))),
      ),
      h('section', { className: 'course-preview-itinerary', 'aria-labelledby': 'course-preview-itinerary-title' },
        h('header', null, h('h2', { id: 'course-preview-itinerary-title' }, '방문 순서'), h('span', null, '예상 도착·출발')),
        h('ol', null, selectedPreview.stops.map((stop) => h(StopCard, {
          stop,
          showAscent: isEasy,
          showCongestion: isQuiet,
          key: `${stop.sequenceNo}-${stop.placeName}`,
        }))),
      ),
    ),
    h('div', { className: 'sticky-actions course-preview-actions' },
      h('button', { className: 'ui-button secondary', type: 'button', onClick: onEditConditions }, '출발 조건 수정'),
      h('button', { className: 'ui-button secondary', type: 'button', onClick: onEditStops }, '장소별 시간 수정'),
    ),
  );
}
