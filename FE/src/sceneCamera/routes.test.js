import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSceneHash,
  guardSceneRouteHash,
  normalizeFilmingLocationId,
  parseSceneHash,
} from './routes.js';

test('normalizes only positive integer filming-location IDs', () => {
  assert.equal(normalizeFilmingLocationId(42), '42');
  assert.equal(normalizeFilmingLocationId('0042'), '42');
  for (const invalid of [null, undefined, '', '0', 0, -1, '4.2', 'abc', '1/2']) {
    assert.equal(normalizeFilmingLocationId(invalid), null);
  }
});

test('malformed or extra-segment camera hashes deterministically replace to map', () => {
  assert.deepEqual(guardSceneRouteHash('#/camera/not-an-id'), { screen: 'map', id: null, replaceHash: '#/map' });
  assert.deepEqual(guardSceneRouteHash('#/camera/42/extra'), { screen: 'map', id: null, replaceHash: '#/map' });
  assert.deepEqual(guardSceneRouteHash('#/camera/42'), { screen: 'camera', id: '42', replaceHash: null });
  assert.equal(guardSceneRouteHash('#/explore'), null);
});

test('builds and parses canonical scene hashes without changing the ID', () => {
  assert.equal(buildSceneHash('scene-detail', 42), '#/scene-detail/42');
  assert.equal(buildSceneHash('camera', '42'), '#/camera/42');
  assert.equal(buildSceneHash('shot-result', '42'), '#/shot-result/42');
  assert.deepEqual(parseSceneHash('#/camera/42'), { screen: 'camera', id: '42' });
  assert.equal(buildSceneHash(['camera', 'permission'].join('-'), 42), null);
  assert.deepEqual(parseSceneHash('#/shot-result/nope'), { screen: null, id: null });
});
