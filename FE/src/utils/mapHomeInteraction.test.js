import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialMapHomeInteraction,
  initialMapHomeInteraction,
  mapHomeInteractionReducer,
  shouldCollapseMapSheet,
  subscribeToMapHomeViewport,
} from './mapHomeInteraction.js';

test('starts with the nearby sheet collapsed on short phone viewports', () => {
  assert.deepEqual(createInitialMapHomeInteraction(568), {
    isMapFocused: false,
    isSheetCollapsed: true,
  });
  assert.deepEqual(createInitialMapHomeInteraction(844), initialMapHomeInteraction);
});

test('entering a short viewport collapses the nearby sheet without reopening it later', () => {
  const collapsed = mapHomeInteractionReducer(
    { isMapFocused: true, isSheetCollapsed: false },
    { type: 'VIEWPORT_RESIZED', viewportHeight: 568 },
  );
  const grown = mapHomeInteractionReducer(
    collapsed,
    { type: 'VIEWPORT_RESIZED', viewportHeight: 844 },
  );

  assert.deepEqual(collapsed, { isMapFocused: true, isSheetCollapsed: true });
  assert.equal(grown, collapsed);
});

test('viewport subscription dispatches resize actions and removes every listener', () => {
  const listeners = new Map();
  const removed = [];
  const target = {
    innerHeight: 568,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      removed.push([type, listener]);
    },
  };
  const actions = [];

  const unsubscribe = subscribeToMapHomeViewport(target, (action) => actions.push(action));
  listeners.get('resize')();
  target.innerHeight = 600;
  listeners.get('orientationchange')();
  unsubscribe();

  assert.deepEqual(actions, [
    { type: 'VIEWPORT_RESIZED', viewportHeight: 568 },
    { type: 'VIEWPORT_RESIZED', viewportHeight: 600 },
  ]);
  assert.deepEqual(removed, [
    ['resize', listeners.get('resize')],
    ['orientationchange', listeners.get('orientationchange')],
  ]);
});

test('map focus hides the full search UI and restore reveals it', () => {
  const focused = mapHomeInteractionReducer(initialMapHomeInteraction, { type: 'MAP_FOCUSED' });
  const restored = mapHomeInteractionReducer(focused, { type: 'SEARCH_RESTORED' });

  assert.deepEqual(focused, { isMapFocused: true, isSheetCollapsed: false });
  assert.deepEqual(restored, { isMapFocused: false, isSheetCollapsed: true });
});

test('selecting crowding focuses the map while keeping the nearby sheet out of the detail', () => {
  const state = mapHomeInteractionReducer(
    { isMapFocused: false, isSheetCollapsed: false },
    { type: 'CROWDING_SELECTED' },
  );

  assert.deepEqual(state, { isMapFocused: true, isSheetCollapsed: true });
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
