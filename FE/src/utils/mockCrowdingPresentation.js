export function getMockCongestionAccessibleLabel(congestion) {
  if (!congestion || congestion.status === 'idle') return null;
  if (congestion.status === 'loading') return '혼잡도 확인 중';
  if (congestion.status === 'uncovered') return '혼잡도 없음';
  if (congestion.status === 'error') return '혼잡도 없음';
  if (
    congestion.status === 'ready'
    && congestion.covered === true
    && congestion.mock === true
    && congestion.congestionLevel
  ) {
    return `혼잡도 ${congestion.congestionLevel}`;
  }
  return null;
}

export function getMockCongestionBadgeLabel(congestion) {
  if (!congestion || congestion.status === 'idle') return null;
  if (congestion.status === 'ready' && congestion.congestionLevel) {
    return `혼잡도 ${congestion.congestionLevel}`;
  }
  if (congestion.status === 'loading') return '혼잡도 확인 중';
  return '혼잡도 없음';
}
