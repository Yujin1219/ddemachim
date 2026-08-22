import { useMockCrowdingAtPoint } from '../utils/mockCrowdingStore.js';
import {
  getMockCongestionAccessibleLabel,
  getMockCongestionBadgeLabel,
} from '../utils/mockCrowdingPresentation.js';

export { getMockCongestionAccessibleLabel };

export function CongestionBadge({ congestion, className = '', compact = false }) {
  const accessibleLabel = getMockCongestionAccessibleLabel(congestion);
  if (!accessibleLabel) return null;

  const isReady = congestion.status === 'ready';
  const label = compact
    ? isReady ? congestion.congestionLevel : congestion.status === 'loading' ? '확인 중' : '정보 없음'
    : getMockCongestionBadgeLabel(congestion);

  return (
    <span
      className={['congestion-badge', compact ? 'is-compact' : '', className].filter(Boolean).join(' ')}
      data-level={isReady ? congestion.congestionLevel : undefined}
      data-state={congestion.status}
      aria-busy={congestion.status === 'loading' ? 'true' : undefined}
      aria-label={accessibleLabel}
    >
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function CongestionPointBadge({ longitude, latitude, className = 'congestion-detail-badge', compact = false }) {
  const congestion = useMockCrowdingAtPoint(longitude, latitude);

  return <CongestionBadge congestion={congestion} className={className} compact={compact} />;
}
