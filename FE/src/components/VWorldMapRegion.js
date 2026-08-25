import { createElement } from 'react';

export function NavigationLocationButton({ following, onClick, disabled = false }) {
  return createElement('button', {
    className: `vworld-navigation-location${following ? ' is-following' : ' is-paused'}`,
    type: 'button',
    onClick,
    disabled,
    'aria-label': following ? '현재 위치 자동 추적 중' : '현재 위치로 돌아가서 자동 추적 시작',
    'aria-pressed': following,
  }, createElement('span', { 'aria-hidden': 'true' }, '⌖'));
}

export default function VWorldMapRegion({
  ariaLabel,
  children,
  className = '',
  interactive,
  onKeyDown,
  showCongestionAreas,
  style,
}) {
  const supportsKeyboardGridSelection = Boolean(interactive && showCongestionAreas);

  return createElement('div', {
    className: `vworld-map${className ? ` ${className}` : ''}`,
    style,
    role: 'region',
    'aria-label': ariaLabel,
    'aria-description': supportsKeyboardGridSelection
      ? 'Enter 키로 지도 중심의 혼잡도를 확인할 수 있습니다.'
      : undefined,
    'aria-keyshortcuts': supportsKeyboardGridSelection ? 'Enter Space' : undefined,
    tabIndex: supportsKeyboardGridSelection ? 0 : undefined,
    onKeyDown: supportsKeyboardGridSelection ? onKeyDown : undefined,
  }, children);
}
