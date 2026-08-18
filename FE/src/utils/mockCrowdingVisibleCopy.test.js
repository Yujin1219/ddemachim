import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CROWDING_UI_FILES = [
  '../components/CongestionInfo.jsx',
  '../components/VWorldMap.jsx',
  '../components/VWorldMapRegion.js',
  '../pages/ProductFlow.jsx',
  './mockCrowdingMap.js',
  './mockCrowdingPresentation.js',
];

test('crowding UI copy omits example and simulation qualifiers', () => {
  for (const file of CROWDING_UI_FILES) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /혼잡도 예시|시뮬레이션/, `${file} contains forbidden crowding copy`);
  }
});
