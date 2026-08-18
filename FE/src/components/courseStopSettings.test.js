import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCoursePreviewPlaces,
  createCourseStopSettings,
  updateCourseStopSetting,
} from './courseStopSettings.js';

test('basket places become editable stops with a safe default dwell time', () => {
  const settings = createCourseStopSettings([
    { id: 11, placeName: '서울공예박물관', defaultDwellMinutes: 90 },
    { id: 12, placeName: '검색 장소' },
  ]);

  assert.deepEqual(settings, [
    { basketItemId: 11, defaultDwellMinutes: 90, dwellMinutes: 90, hasArrivalDeadline: false, arrivalDeadline: '' },
    { basketItemId: 12, defaultDwellMinutes: 60, dwellMinutes: 60, hasArrivalDeadline: false, arrivalDeadline: '' },
  ]);
});

test('dwell time updates stay within the preview request limits', () => {
  const initial = createCourseStopSettings([{ id: 11, defaultDwellMinutes: 60 }]);

  assert.equal(updateCourseStopSetting(initial, 11, { dwellMinutes: 0 })[0].dwellMinutes, 10);
  assert.equal(updateCourseStopSetting(initial, 11, { dwellMinutes: 2000 })[0].dwellMinutes, 1440);
  assert.equal(updateCourseStopSetting(initial, 11, { dwellMinutes: 75 })[0].dwellMinutes, 75);
});

test('preview places include a deadline only when fixed arrival is enabled', () => {
  const settings = [
    { basketItemId: 11, defaultDwellMinutes: 60, dwellMinutes: 45, hasArrivalDeadline: true, arrivalDeadline: '15:00' },
    { basketItemId: 12, defaultDwellMinutes: 60, dwellMinutes: 60, hasArrivalDeadline: false, arrivalDeadline: '18:00' },
  ];

  assert.deepEqual(buildCoursePreviewPlaces(settings), [
    { basketItemId: 11, dwellMinutes: 45, arrivalDeadline: '15:00' },
    { basketItemId: 12, dwellMinutes: 60, arrivalDeadline: null },
  ]);
});
