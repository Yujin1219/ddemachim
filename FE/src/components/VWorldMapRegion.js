import { createElement } from 'react';

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
