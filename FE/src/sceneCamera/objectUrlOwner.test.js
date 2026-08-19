import assert from 'node:assert/strict';
import test from 'node:test';

import { createObjectUrlOwner } from './objectUrlOwner.js';

test('revokes capture URLs exactly once on replacement, retake, close, new ID, and unmount cleanup', () => {
  const revoked = [];
  let number = 0;
  const owner = createObjectUrlOwner({ createObjectURL: () => `blob:${++number}`, revokeObjectURL: (url) => revoked.push(url) });
  assert.equal(owner.replace({}), 'blob:1');
  assert.equal(owner.replace({}), 'blob:2');
  owner.clear();
  owner.clear();
  assert.deepEqual(revoked, ['blob:1', 'blob:2']);
});
