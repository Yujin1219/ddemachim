import assert from 'node:assert/strict';
import test from 'node:test';

import { findNearbyFilmingPlace, uniqueFilmingWorks } from './filmingProximity.js';

test('selects the closest filming place within the arrival radius', () => {
  const place = findNearbyFilmingPlace(
    { latitude: 37.5760, longitude: 126.9830 },
    [
      { id: 1, latitude: 37.5771, longitude: 126.9830 },
      { id: 2, latitude: 37.5762, longitude: 126.9830 },
    ],
  );

  assert.equal(place?.id, 2);
});

test('lists each work filmed at the selected place once', () => {
  assert.deepEqual(uniqueFilmingWorks([
    { id: 1, mediaContent: { id: 11, title: '드라마 A' } },
    { id: 2, mediaContent: { id: 12, title: '영화 B' } },
    { id: 3, mediaContent: { id: 11, title: '드라마 A' } },
  ]), [
    { id: 11, title: '드라마 A' },
    { id: 12, title: '영화 B' },
  ]);
});
