import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completedCourses,
  publicCourses,
  scheduledCourses,
  visiblePublicCourses,
} from './courseHomeModel.js';

const personalFields = [
  'id',
  'title',
  'dateLabel',
  'district',
  'area',
  'placeCount',
  'duration',
  'image',
  'status',
];

test('keeps scheduled and completed courses as separate immutable states', () => {
  assert.notStrictEqual(scheduledCourses, completedCourses);
  assert.ok(scheduledCourses.length > 0);
  assert.ok(completedCourses.length > 0);
  assert.equal(new Set(scheduledCourses.map((course) => course.id)).size, scheduledCourses.length);
  assert.equal(new Set(completedCourses.map((course) => course.id)).size, completedCourses.length);
  assert.equal(
    scheduledCourses.some((scheduled) => completedCourses.some((completed) => scheduled.id === completed.id)),
    false,
  );

  for (const course of [...scheduledCourses, ...completedCourses]) {
    for (const field of personalFields) {
      assert.ok(course[field], `${field} is required for ${course.id}`);
    }
    assert.ok(Object.isFrozen(course));
  }

  assert.ok(scheduledCourses.every((course) => course.status === 'scheduled'));
  assert.ok(completedCourses.every((course) => course.status === 'completed'));
  assert.ok(Object.isFrozen(scheduledCourses));
  assert.ok(Object.isFrozen(completedCourses));
});

test('keeps complete shared-course metadata and exposes only public courses', () => {
  assert.ok(publicCourses.length > 0);
  assert.ok(Object.isFrozen(publicCourses));

  for (const course of publicCourses) {
    assert.ok(course.id);
    assert.ok(course.author);
    assert.ok(course.title);
    assert.ok(['PUBLIC', 'PRIVATE'].includes(course.visibility));
    assert.ok(Number.isInteger(course.placeCount) && course.placeCount > 0);
    assert.ok(course.duration);
    assert.equal(course.places.length, course.placeCount);
    assert.ok(course.places.every((place) => place.name && place.category));
    assert.equal(course.routeCoordinates.length, course.placeCount);
    assert.ok(Object.isFrozen(course));
  }

  assert.ok(visiblePublicCourses().length > 0);
  assert.ok(visiblePublicCourses().every((course) => course.visibility === 'PUBLIC'));
  assert.equal(visiblePublicCourses().some((course) => course.id === 'private-night-museum'), false);
});
