import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAiCourseDraft,
  buildAiCourseSaveInput,
  getAiCoursePreviewPlaceIds,
  isAiCourseConfirmation,
} from './aiGuideCourse.js';

test('pending course accepts clear affirmative replies but not unrelated chat', () => {
  ['응', '그래', '좋아', '이대로 생성해줘', '네 만들어줘'].forEach((message) => {
    assert.equal(isAiCourseConfirmation(message), true, message);
  });
  ['아니', '장소를 바꿔줘', '카페 더 보여줘'].forEach((message) => {
    assert.equal(isAiCourseConfirmation(message), false, message);
  });
});

test('AI proposal becomes the origin metadata used by course preview', () => {
  assert.deepEqual(buildAiCourseDraft({
    date: '2026-08-24',
    startTime: '11:00',
    startLocation: { latitude: 37.5759, longitude: 126.9768, name: '경복궁역' },
  }), {
    serviceDate: '2026-08-24',
    desiredStartTime: '11:00',
    startTiming: 'SCHEDULED',
    start: {
      type: 'CURRENT_LOCATION',
      latitude: 37.5759,
      longitude: 126.9768,
      name: '경복궁역',
    },
  });
});

test('AI preview selection becomes basket-backed course creation input', () => {
  const preview = {
    strategy: 'FAST',
    stops: [{ sequenceNo: 1, placeId: 10, dwellMinutes: 30 }],
    options: [
      { strategy: 'FAST', stops: [{ sequenceNo: 1, placeId: 10, dwellMinutes: 30 }] },
      {
        strategy: 'EASY',
        stops: [
          { sequenceNo: 1, placeId: 20, dwellMinutes: 45 },
          { sequenceNo: 2, placeId: 10, dwellMinutes: 30 },
        ],
      },
    ],
  };

  assert.deepEqual(getAiCoursePreviewPlaceIds(preview, 'EASY'), [20, 10]);
  assert.deepEqual(buildAiCourseSaveInput(preview, 'EASY', [
    { id: 102, placeId: 10 },
    { id: 101, placeId: 20 },
  ], { 1: 'ALTERNATIVE', 2: 'ORIGINAL' }), {
    places: [
      { basketItemId: 101, dwellMinutes: 45, arrivalDeadline: null },
      { basketItemId: 102, dwellMinutes: 30, arrivalDeadline: null },
    ],
    routeSelections: {
      101: 'ALTERNATIVE',
      102: 'ORIGINAL',
    },
  });
});
