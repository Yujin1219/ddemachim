import assert from 'node:assert/strict';
import test from 'node:test';
import { indexCongestionAreasByCode } from './congestionAreaIndex.js';

test('indexes live congestion areas with the native Map collection', () => {
  const areasByCode = indexCongestionAreasByCode([
    { areaCode: ' poi088 ', congestionLevel: '보통' },
  ]);

  assert.ok(areasByCode instanceof globalThis.Map);
  assert.equal(areasByCode.size, 1);
  assert.equal(areasByCode.get('POI088')?.congestionLevel, '보통');
});
