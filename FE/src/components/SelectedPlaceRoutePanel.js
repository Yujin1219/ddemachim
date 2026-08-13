import React, { Fragment } from 'react';

import {
  buildKakaoTaxiHref,
  distanceBetweenMeters,
  formatRouteDistance,
  formatRouteDuration,
  formatRouteFare,
  routeOptionByMode,
  ROUTE_MODES,
} from '../utils/routeComparison.js';

export const ROUTE_MODE_LABELS = {
  WALK: '도보',
  TRANSIT: '대중교통',
  TAXI: '택시',
};

function h(type, props, ...children) {
  return React.createElement(type, props, ...children);
}

function routeList(data) {
  if (Array.isArray(data?.routes)) return data.routes;
  if (Array.isArray(data?.result?.routes)) return data.result.routes;
  return [];
}

function routeOption(data, mode) {
  const normalized = { routes: routeList(data) };
  return routeOptionByMode(normalized, mode);
}

function routeMetric(option) {
  const duration = formatRouteDuration(option?.durationSeconds);
  const distance = formatRouteDistance(option?.distanceMeters);
  return [duration, distance].filter(Boolean);
}

function unavailableCopy(mode, reason) {
  if (mode === 'TRANSIT' || reason === 'NO_ROUTE') return `${ROUTE_MODE_LABELS[mode]} 경로 없음`;
  return `${ROUTE_MODE_LABELS[mode]} 경로를 계산하지 못했어요`;
}

function resolveDestination(place) {
  if (!place) return null;
  return { latitude: place.latitude, longitude: place.longitude };
}

function RouteStatusMessage({
  location,
  selectedPlace,
  locationStatus,
  locationErrorCode,
  routeStatus,
  routeData,
  activeMode,
  onRetryLocation,
  onRetryRoute,
}) {
  const destination = resolveDestination(selectedPlace);
  const nearDestination = location && destination && distanceBetweenMeters(location, destination) < 30;
  let message = '';
  let action = null;

  if (locationStatus === 'locating') {
    message = '현재 위치 확인 중…';
  } else if (locationStatus === 'error') {
    message = '현재 위치를 확인하지 못했어요';
    action = h('button', { type: 'button', className: 'route-status-retry', onClick: onRetryLocation }, '다시 시도');
  } else if (nearDestination) {
    message = '이미 목적지 근처예요';
  } else if (routeStatus === 'loading') {
    message = '경로 계산 중…';
  } else if (routeStatus === 'error') {
    message = '경로를 불러오지 못했어요';
    action = h('button', { type: 'button', className: 'route-status-retry', onClick: onRetryRoute }, '다시 시도');
  } else if (routeStatus === 'ready') {
    const option = routeOption(routeData, activeMode);
    if (option?.status === 'UNAVAILABLE') message = unavailableCopy(activeMode, option.unavailableReason);
  } else if (locationStatus !== 'ready') {
    message = '현재 위치를 확인하면 경로를 보여드려요';
  }

  return h(
    'div',
    {
      className: `route-status-message${message ? '' : ' is-empty'}`,
      role: 'status',
      'aria-live': 'polite',
      'aria-busy': locationStatus === 'locating' || routeStatus === 'loading' || undefined,
    },
    message && h('span', null, message),
    action,
  );
}

function RouteDetails({ option, mode, taxiHref }) {
  if (!option || option.status === 'UNAVAILABLE') return null;
  const metrics = routeMetric(option);
  const fare = formatRouteFare(option.fareWon);
  const detailItems = [];
  if (mode === 'TRANSIT' && Number.isFinite(Number(option.transferCount))) {
    detailItems.push(`환승 ${Number(option.transferCount)}회`);
  }
  if (mode === 'TRANSIT' && formatRouteDistance(option.walkDistanceMeters)) {
    detailItems.push(`도보 ${formatRouteDistance(option.walkDistanceMeters)}`);
  }

  return h(
    Fragment,
    null,
    h(
      'div',
      { className: 'route-detail-summary' },
      metrics[0] && h('strong', null, metrics[0]),
      metrics[1] && h('span', null, metrics[1]),
      mode === 'TAXI' && fare && h('span', null, `예상 ${fare}`),
    ),
    detailItems.length > 0 && h('p', { className: 'route-detail-meta' }, detailItems.join(' · ')),
    mode === 'TAXI' && h('p', { className: 'route-taxi-note' }, '앱에서 출발지와 목적지를 확인한 뒤 호출을 완료해주세요.'),
    mode === 'TAXI' && taxiHref && h(
      'a',
      {
        className: 'route-taxi-cta',
        href: taxiHref,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      '카카오 T로 호출',
    ),
  );
}

export default function SelectedPlaceRoutePanel({
  selectedPlace,
  location = null,
  locationStatus = 'idle',
  locationErrorCode = null,
  routeStatus = 'idle',
  routeData = null,
  activeMode = 'WALK',
  onModeChange,
  onRetryLocation,
  onRetryRoute,
  taxiHref = null,
}) {
  const safeMode = ROUTE_MODES.includes(activeMode) ? activeMode : 'WALK';
  const activeOption = routeOption(routeData, safeMode);
  const destination = resolveDestination(selectedPlace);
  const resolvedTaxiHref = taxiHref || (safeMode === 'TAXI' ? buildKakaoTaxiHref(destination) : null);

  return h(
    'section',
    {
      className: 'selected-place-route-panel',
      'aria-labelledby': 'selected-place-route-title',
    },
    h('div', { className: 'selected-route-origin' }, '현재 위치에서'),
    h('h2', { id: 'selected-place-route-title' }, selectedPlace?.name || '선택한 장소'),
    h(
      'div',
      { className: 'route-mode-tabs', role: 'group', 'aria-label': '이동 수단 선택' },
      ROUTE_MODES.map((mode) => h(
        'button',
        {
          key: mode,
          type: 'button',
          className: `route-mode-tab${safeMode === mode ? ' is-active' : ''}`,
          'aria-pressed': safeMode === mode,
          onClick: () => onModeChange?.(mode),
        },
        ROUTE_MODE_LABELS[mode],
      )),
    ),
    h(RouteStatusMessage, {
      location,
      selectedPlace,
      locationStatus,
      locationErrorCode,
      routeStatus,
      routeData,
      activeMode: safeMode,
      onRetryLocation,
      onRetryRoute,
    }),
    routeStatus === 'loading' && h('div', { className: 'route-detail-skeleton', 'aria-hidden': 'true' }, h('span'), h('span')),
    routeStatus !== 'loading' && h(
      'div',
      { className: 'selected-route-details' },
      activeOption?.status === 'AVAILABLE'
        ? h(RouteDetails, { option: activeOption, mode: safeMode, taxiHref: resolvedTaxiHref })
        : null,
    ),
  );
}

export { routeList, routeOption };
