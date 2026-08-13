import assert from 'node:assert/strict';
import test from 'node:test';

import { routeLegFeatureSpecs } from './routeGeometry.js';

test('rejects invalid LineString geometry and preserves valid leg order and metadata', () => {
  const projected = (coordinate) => coordinate.map((value) => Number((value * 10).toFixed(6)));
  const specs = routeLegFeatureSpecs([
    { mode: 'TRANSIT', routeName: '종로01', geometry: { type: 'Point', coordinates: [[126.9, 37.5]] } },
    { mode: 'WALK', routeName: null, geometry: { type: 'LineString', coordinates: [[126.9, 37.5]] } },
    { mode: 'TAXI', routeName: null, geometry: { type: 'LineString', coordinates: [[126.9, 37.5], [126.91, 37.51]] } },
    { mode: 'TRANSIT', routeName: '종로02', geometry: { type: 'LineString', coordinates: [[126.91, 37.51], [126.92, 37.52]] } },
  ], projected);

  assert.deepEqual(specs, [
    {
      coordinates: [[1269, 375], [1269.1, 375.1]],
      mode: 'TAXI',
      routeName: null,
    },
    {
      coordinates: [[1269.1, 375.1], [1269.2, 375.2]],
      mode: 'TRANSIT',
      routeName: '종로02',
    },
  ]);
});

test('normalizes only finite WGS84 coordinate pairs', () => {
  assert.deepEqual(
    routeLegFeatureSpecs([
      { mode: 'WALK', geometry: { type: 'LineString', coordinates: [[126.9, 37.5], ['bad', 37.51]] } },
      { mode: 'WALK', geometry: { type: 'LineString', coordinates: [['126.9', 37.5], [126.91, 37.51]] } },
      { mode: 'WALK', geometry: { type: 'LineString', coordinates: [[181, 37.5], [126.91, 37.51]] } },
    ]),
    [],
  );
});

test('rejects empty string, null, and boolean coordinate components as malformed GeoJSON', () => {
  for (const malformedLongitude of ['', null, true]) {
    assert.deepEqual(
      routeLegFeatureSpecs([
        {
          mode: 'WALK',
          geometry: {
            type: 'LineString',
            coordinates: [[malformedLongitude, 37.5], [126.91, 37.51]],
          },
        },
      ]),
      [],
      `expected ${String(malformedLongitude)} longitude component to reject the entire leg`,
    );
  }
});
