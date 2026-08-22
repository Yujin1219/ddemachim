import assert from 'node:assert/strict';
import test from 'node:test';
import { getBottomNavActiveIndex, getBottomNavNotchCenter } from './bottomNavModel.js';

test('현재 route의 탭 위치를 bubble indicator 위치로 변환한다', () => {
  assert.equal(getBottomNavActiveIndex('map'), 0);
  assert.equal(getBottomNavActiveIndex('course'), 3);
  assert.equal(getBottomNavActiveIndex('my'), 4);
});

test('알 수 없는 route는 지도 탭 위치로 안전하게 표시한다', () => {
  assert.equal(getBottomNavActiveIndex('missing-route'), 0);
});

test('활성 탭 중심에 맞춰 navigation notch 위치를 계산한다', () => {
  assert.equal(getBottomNavNotchCenter(0), 100);
  assert.equal(getBottomNavNotchCenter(3), 700);
  assert.equal(getBottomNavNotchCenter(4), 900);
});
