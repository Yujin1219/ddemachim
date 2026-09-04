import { motion } from 'motion/react';
import {
  ChevronLeft,
  CircleHelp,
  Heart,
  MoreHorizontal,
  Search,
  X,
} from 'lucide-react';

import VWorldMap from './VWorldMap.jsx';

export function SearchIcon() {
  return <Search aria-hidden="true" size={20} strokeWidth={2} />;
}

export function ActionButton({ children, onClick, tone = 'primary', disabled = false, className = '', type = 'button', ...buttonProps }) {
  return <button className={`ui-button ${tone} ${className}`} disabled={disabled} onClick={onClick} type={type} {...buttonProps}>{children}</button>;
}

export function IconButton({ label, children, onClick, className = '' }) {
  const icons = { 이전: ChevronLeft, 더보기: MoreHorizontal, 저장: Heart, 저장됨: Heart, '장소 저장': Heart, '장소 저장 취소': Heart, 닫기: X, 도움말: CircleHelp };
  const Icon = icons[label];
  const isSaved = label === '저장됨' || label === '장소 저장 취소';
  return <button className={`icon-button ${className}`} onClick={onClick} type="button" aria-label={label} title={label}>{Icon ? <Icon aria-hidden="true" size={20} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} /> : children}</button>;
}

export function BackHeader({ title, onBack, action, actionLabel = '더보기' }) {
  return <header className="screen-header">
    <IconButton label="이전" onClick={onBack}>‹</IconButton>
    <h1>{title}</h1>
    {action ? <IconButton label={actionLabel} onClick={action}>•••</IconButton> : <span className="header-space" />}
  </header>;
}

export function SearchField({ value, onChange, onSubmit, onClear, clearLabel = '검색어 지우기', placeholder, autoFocus = false, inputRef, onKeyDown }) {
  return (
    <form className="search-field" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <button className="search-field-icon" type="submit" aria-label="검색"><SearchIcon /></button>
      <input aria-label={placeholder} autoFocus={autoFocus} ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} />
      {value && <button type="button" className="clear-search" aria-label={clearLabel} onClick={() => onClear ? onClear() : onChange('')}><X aria-hidden="true" size={14} strokeWidth={2.4} /></button>}
    </form>
  );
}

export function Chip({ children, active = false, onClick, tone = '', current = false }) {
  const className = `ui-chip ${active ? 'is-active' : ''} ${tone}`;
  return onClick ? <button type="button" className={className} onClick={onClick} aria-pressed={active} aria-current={current ? 'true' : undefined}>{children}</button> : <span className={className}>{children}</span>;
}

export function StatusBanner({ tone = 'blue', title, copy, action, onAction }) {
  return <section className={`status-banner ${tone}`}>
    <div><strong>{title}</strong>{copy && <p>{copy}</p>}</div>
    {action && (onAction ? <button onClick={onAction} type="button">{action}</button> : <span className="status-banner-note">{action}</span>)}
  </section>;
}

export function ScreenSection({ title, subtitle, action, onAction, children }) {
  return <section className="content-section">
    <div className="section-title-row"><h2>{title}</h2>{action && (onAction ? <button type="button" onClick={onAction}>{action}</button> : <span className="section-action-note">{action}</span>)}</div>
    {subtitle && <p className="section-subtitle">{subtitle}</p>}
    {children}
  </section>;
}

export function MapStage({ children, variant = 'home', mapProps = {} }) {
  const mapLabel = variant === 'navigation' ? '경로 안내 지도' : variant === 'complete' ? '완료한 코스 지도' : '서울과 주변 지도';
  return <div className={`map-stage ${variant}`}><VWorldMap ariaLabel={mapLabel} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} {...mapProps} />{children}</div>;
}

export function BottomSheet({ children, className = '', animated = false }) {
  const sheetClassName = `bottom-sheet ${className} ${animated ? 'motion-depth-sheet' : ''}`;
  const sheetMotion = {
    initial: { opacity: 0, transform: 'perspective(1000px) translateY(42px) rotateX(-6deg) translateZ(-24px) scale(.985)' },
    animate: { opacity: 1, transform: 'perspective(1000px) translateY(0px) rotateX(0deg) translateZ(0px) scale(1)' },
    transition: { duration: 0.28, delay: 0.08, ease: [0.23, 1, 0.32, 1] },
  };

  if (animated) {
    return <motion.section className={sheetClassName} {...sheetMotion}><span className="sheet-handle" />{children}</motion.section>;
  }

  return <section className={sheetClassName}><span className="sheet-handle" />{children}</section>;
}

export function DetailContentSheet({ children, className = '' }) {
  const sheetClassName = ['detail-content-sheet', className].filter(Boolean).join(' ');
  return <div className={sheetClassName}>{children}</div>;
}
