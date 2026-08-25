import assert from 'node:assert/strict';
import test from 'node:test';

import * as routeGeometry from './routeGeometry.js';

const { routeFitPointCoordinates, routeLegFeatureSpecs } = routeGeometry;

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

test('normalizes valid route fit endpoints and applies the projection transform', () => {
  const transformed = routeFitPointCoordinates([
    [126.9769, 37.5716],
    [127.0276, 37.4979],
    [181, 37.5],
    null,
  ], ([longitude, latitude]) => [longitude * 2, latitude * 2]);

  assert.deepEqual(transformed, [
    [253.9538, 75.1432],
    [254.0552, 74.9958],
  ]);
});

test('restores route feature sequence before drawing when the map source returns random order', () => {
  assert.equal(typeof routeGeometry.orderRouteFeaturesBySequence, 'function');
  const feature = (id, routeSequence) => ({
    id,
    get: (key) => (key === 'routeSequence' ? routeSequence : undefined),
  });

  const ordered = routeGeometry.orderRouteFeaturesBySequence([
    feature('destination-connector', 3),
    feature('transit-leg', 2),
    feature('origin-connector', 0),
    feature('walk-leg', 1),
  ]);

  assert.deepEqual(ordered.map((item) => item.id), [
    'origin-connector',
    'walk-leg',
    'transit-leg',
    'destination-connector',
  ]);
});

test('keeps an in-progress route drawing alive when the same route renders again', () => {
  assert.equal(
    typeof routeGeometry.routeDrawTransition,
    'function',
    'route redraw decisions must distinguish a repeated render from cancellation',
  );
  assert.equal(routeGeometry.routeDrawTransition('course-overview', 'course-overview', false), 'keep');
  assert.equal(routeGeometry.routeDrawTransition('course-overview', 'course-overview', true), 'replace');
  assert.equal(routeGeometry.routeDrawTransition('course-overview', '', false), 'cancel');
  assert.equal(routeGeometry.routeDrawTransition('course-overview', 'course-stop-2', false), 'start');
});
