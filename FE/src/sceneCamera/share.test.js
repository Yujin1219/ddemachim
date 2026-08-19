import assert from 'node:assert/strict';
import test from 'node:test';

import { attemptFileShare, startFileDownload } from './share.js';

const blob = { type: 'image/png' };
const fileFactory = (parts, name, options) => ({ parts, name, type: options.type });

test('shares only when the exact file payload passes canShare', async () => {
  let sharedPayload;
  const navigator = { canShare: (payload) => payload.files[0].name.endsWith('.png'), share: async (payload) => { sharedPayload = payload; } };
  const result = await attemptFileShare(blob, { navigator, fileFactory, filename: 'scene.png' });
  assert.equal(result.status, 'shared');
  assert.equal(sharedPayload.files[0], result.file);
});

test('treats AbortError as cancellation while preserving the export file', async () => {
  const navigator = { canShare: () => true, share: async () => { throw Object.assign(new Error('cancel'), { name: 'AbortError' }); } };
  const result = await attemptFileShare(blob, { navigator, fileFactory });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.error, undefined);
  assert.ok(result.file);
});

test('returns an explicit download fallback for unsupported or failed share', async () => {
  const unsupported = await attemptFileShare(blob, { navigator: { canShare: () => false }, fileFactory });
  assert.equal(unsupported.status, 'download-available');
  const failed = await attemptFileShare(blob, { navigator: { canShare: () => true, share: async () => { throw new Error('sheet failed'); } }, fileFactory });
  assert.equal(failed.status, 'download-available');
  assert.match(failed.error.message, /sheet failed/);
});

test('starts download only on explicit invocation and revokes its URL after click consumption', () => {
  const events = [];
  const result = startFileDownload({ name: 'scene.png' }, {
    createObjectURL: () => 'blob:download',
    revokeObjectURL: (url) => events.push(['revoke', url]),
    createAnchor: () => ({ click: () => events.push(['click']), remove: () => events.push(['remove']) }),
    schedule: (fn) => { events.push(['scheduled']); fn(); },
  });
  assert.equal(result.status, 'download-started');
  assert.deepEqual(events, [['click'], ['remove'], ['scheduled'], ['revoke', 'blob:download']]);
});
