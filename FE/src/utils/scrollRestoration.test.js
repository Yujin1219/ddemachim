import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeferredScrollRestoration } from './scrollRestoration.js';

test('keeps the original target while async content temporarily clamps restoration', () => {
  let maximumScrollTop = 281;
  const scroll = {
    _scrollTop: 0,
    get scrollTop() {
      return this._scrollTop;
    },
    set scrollTop(value) {
      this._scrollTop = Math.min(value, maximumScrollTop);
    },
  };
  const restoration = createDeferredScrollRestoration(509);

  assert.equal(restoration.restore(scroll), false);
  assert.equal(scroll.scrollTop, 281);
  assert.equal(restoration.capture(scroll.scrollTop), null);

  maximumScrollTop = 600;

  assert.equal(restoration.restore(scroll), true);
  assert.equal(scroll.scrollTop, 509);
  assert.equal(restoration.capture(530), 530);
});

test('normalizes invalid saved positions and captures ordinary scrolling immediately', () => {
  const restoration = createDeferredScrollRestoration(Number.NaN);
  const scroll = { scrollTop: 40 };

  assert.equal(restoration.restore(scroll), true);
  assert.equal(scroll.scrollTop, 0);
  assert.equal(restoration.capture(40), 40);
});
