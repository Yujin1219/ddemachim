import { useJongnoCongestionAtPoint } from '../utils/jongnoCongestion';

export function CongestionBadge({ congestion, className = '' }) {
  if (!congestion) return null;

  const freshnessLabel = congestion.stale ? '최근' : '지금';
  const label = `${freshnessLabel} ${congestion.congestionLevel}`;

  return (
    <span
      className={['congestion-badge', className].filter(Boolean).join(' ')}
      data-level={congestion.congestionLevel}
      aria-label={`혼잡도 ${label}`}
    >
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function CongestionPointBadge({ longitude, latitude, className = 'congestion-detail-badge' }) {
  const congestion = useJongnoCongestionAtPoint(longitude, latitude);
  if (!congestion) return null;

  return <CongestionBadge congestion={congestion} className={className} />;
}
