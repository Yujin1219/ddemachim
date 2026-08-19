import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMockCongestionAccessibleLabel,
  getMockCongestionBadgeLabel,
} from './mockCrowdingPresentation.js';

const READY = Object.freeze({
  status: 'ready',
  covered: true,
  mock: true,
  congestionLevel: '약간 붐빔',
});

test('visible congestion badges show only the current status', () => {
  assert.equal(getMockCongestionBadgeLabel(READY), '혼잡도 약간 붐빔');
  assert.equal(getMockCongestionBadgeLabel({ status: 'loading' }), '혼잡도 확인 중');
  assert.equal(getMockCongestionBadgeLabel({ status: 'error' }), '혼잡도 없음');
  assert.equal(getMockCongestionBadgeLabel({ status: 'uncovered' }), '혼잡도 없음');
});

test('accessible labels stay aligned with status-oriented visible copy', () => {
  assert.equal(
    getMockCongestionAccessibleLabel(READY),
    '혼잡도 약간 붐빔',
  );
  assert.equal(getMockCongestionAccessibleLabel({ status: 'loading' }), '혼잡도 확인 중');
  assert.equal(getMockCongestionAccessibleLabel({ status: 'error' }), '혼잡도 없음');
  assert.equal(getMockCongestionAccessibleLabel({ status: 'uncovered' }), '혼잡도 없음');
});
