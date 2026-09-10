import test from 'node:test';
import assert from 'node:assert/strict';
import { withBasePath } from './appPath.js';

test('prefixes assets and API paths for subpath deployment', () => {
  assert.equal(withBasePath('/assets/logo.svg', '/machim/'), '/machim/assets/logo.svg');
  assert.equal(withBasePath('/api/places', '/machim/'), '/machim/api/places');
  assert.equal(withBasePath('/machim/assets/logo.svg', '/machim/'), '/machim/assets/logo.svg');
});
test('preserves local and external URLs', () => {
  assert.equal(withBasePath('/api/places', '/'), '/api/places');
  assert.equal(withBasePath('https://example.com/a.jpg', '/machim/'), 'https://example.com/a.jpg');
  assert.equal(withBasePath('data:image/png;base64,abc', '/machim/'), 'data:image/png;base64,abc');
});
