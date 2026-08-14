import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initialMapHomeInteraction,
  mapHomeInteractionReducer,
  shouldCollapseMapSheet,
} from './mapHomeInteraction.js';

test('map focus hides the full search UI and restore reveals it', () => {
  const focused = mapHomeInteractionReducer(initialMapHomeInteraction, { type: 'MAP_FOCUSED' });
  const restored = mapHomeInteractionReducer(focused, { type: 'SEARCH_RESTORED' });

  assert.deepEqual(focused, { isMapFocused: true, isSheetCollapsed: false });
  assert.deepEqual(restored, { isMapFocused: false, isSheetCollapsed: false });
});

test('selecting a place focuses the map and expands the sheet', () => {
  const state = mapHomeInteractionReducer(
    { isMapFocused: false, isSheetCollapsed: true },
    { type: 'PLACE_SELECTED' },
  );

  assert.deepEqual(state, { isMapFocused: true, isSheetCollapsed: false });
});

test('handle taps toggle the sheet while directional drags snap predictably', () => {
  const collapsed = mapHomeInteractionReducer(initialMapHomeInteraction, { type: 'SHEET_TOGGLED' });
  const expanded = mapHomeInteractionReducer(collapsed, { type: 'SHEET_TOGGLED' });
  const draggedDown = mapHomeInteractionReducer(expanded, {
    type: 'SHEET_DRAG_ENDED',
    offsetY: 28,
    velocityY: 0,
  });
  const draggedUp = mapHomeInteractionReducer(draggedDown, {
    type: 'SHEET_DRAG_ENDED',
    offsetY: -28,
    velocityY: 0,
  });

  assert.equal(collapsed.isSheetCollapsed, true);
  assert.equal(expanded.isSheetCollapsed, false);
  assert.equal(draggedDown.isSheetCollapsed, true);
  assert.equal(draggedUp.isSheetCollapsed, false);
});

test('small slow sheet movements preserve state but quick flicks use velocity', () => {
  assert.equal(shouldCollapseMapSheet(false, { offsetY: 12, velocityY: 120 }), false);
  assert.equal(shouldCollapseMapSheet(true, { offsetY: -12, velocityY: -120 }), true);
  assert.equal(shouldCollapseMapSheet(false, { offsetY: 4, velocityY: 281 }), true);
  assert.equal(shouldCollapseMapSheet(true, { offsetY: -4, velocityY: -281 }), false);
});
