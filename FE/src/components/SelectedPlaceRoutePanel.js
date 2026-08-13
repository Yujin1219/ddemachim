import React, { Fragment, useEffect } from 'react';

import {
  buildKakaoTaxiHref,
  distanceBetweenMeters,
  formatRouteDistance,
  formatRouteDuration,
  formatRouteFare,
  normalizeRouteCoordinate,
  normalizeRouteNumber,
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

export function visibleRouteModes(routeStatus, routeData) {
  if (routeStatus !== 'ready') return ROUTE_MODES;
  const transit = routeOption(routeData, 'TRANSIT');
  return transit?.status === 'AVAILABLE'
    ? ROUTE_MODES
    : ROUTE_MODES.filter((mode) => mode !== 'TRANSIT');
}

export function resolveAvailableRouteMode(activeMode, modes) {
  return modes.includes(activeMode) ? activeMode : modes[0] || 'WALK';
}

function routeMetric(option) {
  const duration = formatRouteDuration(option?.durationSeconds);
  const distance = formatRouteDistance(option?.distanceMeters);
  return [duration, distance].filter(Boolean);
}

function routeTabStatus(routeStatus, routeData, mode) {
  if (routeStatus === 'loading') return '계산 중';
  if (routeStatus !== 'ready') return '\u00a0';

  const option = routeOption(routeData, mode);
  if (option?.status === 'AVAILABLE') return formatRouteDuration(option.durationSeconds) || '이용 불가';
  if (option?.unavailableReason === 'NO_ROUTE') return '경로 없음';
  if (option?.unavailableReason === 'TIMEOUT' || option?.unavailableReason === 'PROVIDER_UNAVAILABLE') {
    return '일시 오류';
  }
  return '이용 불가';
}

function locationErrorCopy(errorCode) {
  if (errorCode === 'DENIED') {
    return '위치 권한이 꺼져 있어요. 브라우저 설정에서 허용한 뒤 다시 시도해주세요.';
  }
  if (errorCode === 'UNSUPPORTED') return '이 브라우저에서는 현재 위치를 사용할 수 없어요.';
  if (errorCode === 'TIMEOUT') return '현재 위치 확인이 지연되고 있어요. 다시 시도해주세요.';
  return '현재 위치를 확인하지 못했어요. 다시 시도해주세요.';
}

function unavailableCopy(mode, reason) {
  if (reason === 'NO_ROUTE') return `${ROUTE_MODE_LABELS[mode]} 경로를 찾지 못했어요.`;
  if (reason === 'TIMEOUT' || reason === 'PROVIDER_UNAVAILABLE') {
    return `${ROUTE_MODE_LABELS[mode]} 정보를 잠시 불러오지 못했어요.`;
  }
  if (reason === 'NOT_CONFIGURED') return `${ROUTE_MODE_LABELS[mode]}는 지금 이용할 수 없어요.`;
  return `${ROUTE_MODE_LABELS[mode]} 경로를 찾지 못했어요.`;
}

function resolveDestination(place) {
  if (!place) return null;
  return normalizeRouteCoordinate({ latitude: place.latitude, longitude: place.longitude });
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

  if (!destination) {
    message = '이 장소는 경로를 계산할 수 없어요';
  } else if (locationStatus === 'locating') {
    message = '현재 위치 확인 중…';
  } else if (locationStatus === 'error') {
    message = locationErrorCopy(locationErrorCode);
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
    if (option?.status === 'UNAVAILABLE') {
      message = unavailableCopy(activeMode, option.unavailableReason);
      if (option.unavailableReason === 'TIMEOUT' || option.unavailableReason === 'PROVIDER_UNAVAILABLE') {
        action = h('button', { type: 'button', className: 'route-status-retry', onClick: onRetryRoute }, '다시 시도');
      }
    }
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
  const transferCount = normalizeRouteNumber(option.transferCount);
  if (mode === 'TRANSIT' && transferCount !== null) {
    detailItems.push(`환승 ${transferCount}회`);
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
  const visibleModes = visibleRouteModes(routeStatus, routeData);
  const resolvedMode = resolveAvailableRouteMode(activeMode, visibleModes);
  const activeOption = routeOption(routeData, resolvedMode);
  const destination = resolveDestination(selectedPlace);
  const resolvedTaxiHref = taxiHref || (resolvedMode === 'TAXI' ? buildKakaoTaxiHref(destination) : null);

  useEffect(() => {
    if (activeMode !== resolvedMode) onModeChange?.(resolvedMode);
  }, [activeMode, onModeChange, resolvedMode]);

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
      visibleModes.map((mode) => h(
        'button',
        {
          key: mode,
          type: 'button',
          className: `route-mode-tab${resolvedMode === mode ? ' is-active' : ''}`,
          'aria-pressed': resolvedMode === mode,
          onClick: () => onModeChange?.(mode),
        },
        h('span', { className: 'route-mode-label' }, ROUTE_MODE_LABELS[mode]),
        h('span', { className: 'route-mode-status' }, routeTabStatus(routeStatus, routeData, mode)),
      )),
    ),
    h(RouteStatusMessage, {
      location,
      selectedPlace,
      locationStatus,
      locationErrorCode,
      routeStatus,
      routeData,
      activeMode: resolvedMode,
      onRetryLocation,
      onRetryRoute,
    }),
    routeStatus === 'loading' && h('div', { className: 'route-detail-skeleton', 'aria-hidden': 'true' }, h('span'), h('span')),
    routeStatus !== 'loading' && h(
      'div',
      { className: 'selected-route-details' },
      activeOption?.status === 'AVAILABLE'
        ? h(RouteDetails, { option: activeOption, mode: resolvedMode, taxiHref: resolvedTaxiHref })
        : null,
    ),
  );
}

export { routeList, routeOption };
