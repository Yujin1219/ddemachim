import React, { useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, Move, RotateCcw } from 'lucide-react';

const h = React.createElement;

export function AutoFocusHeading({ as = 'h1', children, ...props }) {
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return h(as, { ...props, ref: headingRef, tabIndex: -1 }, children);
}

export function SceneDetailHeading(props) {
  return h(AutoFocusHeading, props);
}

export function BlockingAlert({ title, message, children, className = '' }) {
  return h('div', { className, role: 'alert', 'aria-live': 'assertive' },
    h(AutoFocusHeading, { as: 'h2' }, title),
    message ? h('p', null, message) : null,
    children);
}

export function SceneReferenceGate({ status, error, onStart, onRetry, buttonRef }) {
  if (status === 'ready') return h('button', { ref: buttonRef, type: 'button', className: 'ui-button primary scene-camera-entry', onClick: onStart }, '구도 맞추기');
  if (status === 'checking') return h('div', { className: 'scene-reference-gate', role: 'status', 'aria-live': 'polite' },
    h('p', null, '참고 장면을 안전하게 확인하고 있어요.'),
    h('button', { type: 'button', className: 'ui-button primary', disabled: true }, '확인 중'));
  return h('div', { className: 'scene-reference-gate is-error', role: 'alert', 'aria-live': 'assertive' },
    h(AutoFocusHeading, { as: 'h2' }, '사용할 수 있는 참고 장면이 아직 없어요'),
    h('p', null, error || '권리와 내보내기 안전성이 확인된 이미지가 준비되어야 카메라를 사용할 수 있어요.'),
    h('button', { type: 'button', className: 'ui-button secondary', onClick: onRetry }, '다시 확인'));
}

export function OverlayControls({ overlay, onPatch, onReset }) {
  const step = 0.025;
  const scalePercent = Math.round(overlay.scale * 100);
  const opacityPercent = Math.round(overlay.opacity * 100);
  const positionButton = (label, patch, Icon) => h('button', { type: 'button', 'aria-label': label, onClick: () => onPatch(patch) }, h(Icon, { 'aria-hidden': true, size: 19, strokeWidth: 2 }));
  return h('section', { className: 'scene-overlay-controls', 'aria-label': '참고 장면 조절' },
    h('div', { className: 'scene-overlay-control-heading' },
      h('span', null, h(Move, { 'aria-hidden': true, size: 18, strokeWidth: 2 }), '참고 장면 조절'),
      h('div', { className: 'scene-overlay-actions' },
        h('button', { type: 'button', 'aria-label': '참고 장면 표시', 'aria-pressed': overlay.visible, onClick: () => onPatch({ visible: !overlay.visible }) }, h(overlay.visible ? Eye : EyeOff, { 'aria-hidden': true, size: 18, strokeWidth: 2 }), h('span', null, '참고 장면')),
        h('button', { type: 'button', 'aria-label': '참고 장면 위치와 크기 초기화', onClick: onReset }, h(RotateCcw, { 'aria-hidden': true, size: 18, strokeWidth: 2 }), h('span', null, '초기화')))),
    h('div', { className: 'scene-overlay-direction', role: 'group', 'aria-label': '참고 장면 위치 조절' },
      positionButton('참고 장면 왼쪽으로', { x: overlay.x - step }, ChevronLeft),
      positionButton('참고 장면 위로', { y: overlay.y - step }, ChevronUp),
      positionButton('참고 장면 아래로', { y: overlay.y + step }, ChevronDown),
      positionButton('참고 장면 오른쪽으로', { x: overlay.x + step }, ChevronRight)),
    h('div', { className: 'scene-overlay-ranges' },
      h('label', null, h('span', { className: 'scene-overlay-range-label' }, h('span', null, '크기'), h('output', null, `${scalePercent}%`)), h('input', { type: 'range', min: 0.5, max: 2, step: 0.05, value: overlay.scale, 'aria-label': '참고 장면 크기', 'aria-valuetext': `${scalePercent}%`, onChange: (event) => onPatch({ scale: Number(event.target.value) }) })),
      h('label', null, h('span', { className: 'scene-overlay-range-label' }, h('span', null, '겹침'), h('output', null, `${opacityPercent}%`)), h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: overlay.opacity, 'aria-label': '참고 장면 불투명도', 'aria-valuetext': `${opacityPercent}%`, onChange: (event) => onPatch({ opacity: Number(event.target.value) }) }))),
  );
}

export function BeforeAfterComparison({ referenceUrl, referenceAlt = '참고 장면', captureUrl, value, onChange }) {
  const numeric = Number(value);
  return h('section', { className: 'scene-comparison', style: { '--scene-comparison': `${numeric}%` }, 'aria-label': '참고 장면과 촬영 결과 비교' },
    h('div', { className: 'scene-comparison-stage' },
      h('img', { className: 'scene-comparison-capture', src: captureUrl, alt: '촬영 결과' }),
      h('div', { className: 'scene-comparison-reference' }, h('img', { src: referenceUrl, alt: referenceAlt })),
      h('span', { className: 'scene-comparison-divider', 'aria-hidden': 'true' })),
    h('label', { className: 'scene-comparison-range' },
      h('span', null, '비교 위치'),
      h('input', { type: 'range', min: 0, max: 100, step: 1, value: numeric, 'aria-label': '참고 장면과 촬영 결과 비교 위치', 'aria-valuetext': `참고 장면 ${numeric}%, 촬영 결과 ${100 - numeric}%`, onChange: (event) => onChange(Number(event.target.value)) })));
}
