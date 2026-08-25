import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.map((value) => String(value)).join(' ');
  if (!message.includes('react-test-renderer is deprecated')) originalConsoleError(...args);
};

test.after(() => {
  console.error = originalConsoleError;
  if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test('shows a transient notice and restarts its dismissal window when triggered again', async () => {
  const noticeModule = await import('./useTransientNotice.js').catch(() => ({}));
  assert.equal(typeof noticeModule.useTransientNotice, 'function', 'transient notice hook must exist');

  let latestNotice;
  function Harness() {
    latestNotice = noticeModule.useTransientNotice(30);
    return createElement('output', null, latestNotice.isVisible ? `visible-${latestNotice.noticeKey}` : 'hidden');
  }

  let renderer;
  await act(async () => { renderer = create(createElement(Harness)); });
  assert.equal(renderer.toJSON().children[0], 'hidden');

  await act(async () => { latestNotice.show(); });
  assert.equal(renderer.toJSON().children[0], 'visible-1');

  await new Promise((resolve) => setTimeout(resolve, 20));
  await act(async () => { latestNotice.show(); });
  assert.equal(renderer.toJSON().children[0], 'visible-2');

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(renderer.toJSON().children[0], 'visible-2');

  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  assert.equal(renderer.toJSON().children[0], 'hidden');
  await act(async () => renderer.unmount());
});
