import assert from 'node:assert/strict';
import test from 'node:test';

import { configureApiProxy } from '../../vite.config.js';

test('the development API proxy removes the browser Origin before forwarding POST requests', () => {
  const listeners = new Map();
  configureApiProxy({
    on(eventName, listener) {
      listeners.set(eventName, listener);
    },
  });

  const removedHeaders = [];
  listeners.get('proxyReq')({
    removeHeader(headerName) {
      removedHeaders.push(headerName);
    },
  });

  assert.deepEqual(removedHeaders, ['origin']);
});
