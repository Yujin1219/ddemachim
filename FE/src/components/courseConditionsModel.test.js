import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCourseConditionDefaults,
  formatCourseDateLabel,
  formatCourseTimeLabel,
  normalizeCourseStartPlace,
} from './courseConditionsModel.js';

test('course condition defaults round the start time', () => {
  assert.deepEqual(
    createCourseConditionDefaults(new Date(2026, 7, 18, 13, 43)),
    {
      serviceDate: '2026-08-18',
      desiredStartTime: '13:50',
    },
  );
  assert.deepEqual(
    createCourseConditionDefaults(new Date(2026, 7, 18, 22, 58)),
    {
      serviceDate: '2026-08-18',
      desiredStartTime: '23:00',
    },
  );
});

test('searched place is normalized to the preview request start contract', () => {
  assert.deepEqual(normalizeCourseStartPlace({
    name: '안국역 1번 출구',
    roadAddress: '서울 종로구 율곡로 62',
    latitude: '37.5763',
    longitude: '126.9854',
  }), {
    type: 'SEARCHED_PLACE',
    name: '안국역 1번 출구',
    address: '서울 종로구 율곡로 62',
    latitude: 37.5763,
    longitude: 126.9854,
  });
  assert.equal(normalizeCourseStartPlace({ name: '좌표 없음' }), null);
});

test('course date and time values are formatted for compact summary rows', () => {
  assert.equal(formatCourseDateLabel('2026-08-18'), '8월 18일 · 화요일');
  assert.equal(formatCourseTimeLabel('09:00'), '오전 9:00');
  assert.equal(formatCourseTimeLabel('17:30'), '오후 5:30');
  assert.equal(formatCourseTimeLabel(''), '선택 필요');
});
