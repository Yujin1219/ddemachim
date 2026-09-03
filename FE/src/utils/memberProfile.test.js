import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMemberProfile, profileInitial } from './memberProfile.js';

test('member profile normalization trims identity fields and keeps server metadata', () => {
  assert.deepEqual(normalizeMemberProfile({
    memberId: 7,
    nickname: '  유진  ',
    email: ' user@example.com ',
    role: 'ROLE_USER',
  }), {
    memberId: 7,
    nickname: '유진',
    email: 'user@example.com',
    role: 'ROLE_USER',
  });
});

test('member profile normalization rejects unusable values', () => {
  assert.equal(normalizeMemberProfile(null), null);
  assert.equal(normalizeMemberProfile({ nickname: ' ', email: ' ' }), null);
});

test('profile initial supports Korean and empty nicknames', () => {
  assert.equal(profileInitial(' 유진'), '유');
  assert.equal(profileInitial(''), '?');
});
