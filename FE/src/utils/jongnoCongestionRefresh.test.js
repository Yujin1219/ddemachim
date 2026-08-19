import assert from 'node:assert/strict';
import test from 'node:test';
let congestion = {};
try {
  congestion = await import('./jongnoCongestionRefresh.js');
} catch {
  // The first TDD run intentionally reaches this branch before the policy exists.
}

test('retries an unknown-only congestion response sooner than live data', () => {
  const unknownOnly = {
    areas: [{ areaCode: 'POI088', congestionLevel: '정보없음' }],
  };
  const live = {
    areas: [{ areaCode: 'POI088', congestionLevel: '보통' }],
  };

  assert.equal(congestion.resolveJongnoCongestionRefreshMs(unknownOnly), 15_000);
  assert.equal(
    congestion.resolveJongnoCongestionRefreshMs(live),
    congestion.JONGNO_CONGESTION_REFRESH_MS,
  );
});
