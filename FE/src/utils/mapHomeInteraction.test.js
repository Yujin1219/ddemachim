import assert from 'node:assert/strict';
import test from 'node:test';

import * as mapHomeInteraction from './mapHomeInteraction.js';

import {
  createInitialMapHomeInteraction,
  initialMapHomeInteraction,
  mapHomeInteractionReducer,
  shouldCollapseMapSheet,
  subscribeToMapHomeViewport,
} from './mapHomeInteraction.js';

test('keeps route endpoints above the route sheet on regular and short phone viewports', () => {
  assert.equal(typeof mapHomeInteraction.mapHomeRouteFitPadding, 'function');
  const { mapHomeRouteFitPadding } = mapHomeInteraction;
  assert.deepEqual(mapHomeRouteFitPadding(844), [120, 28, 448, 28]);
  assert.deepEqual(mapHomeRouteFitPadding(568), [120, 28, 338, 28]);
});

test('refits the map when route loading finishes or the selected mode changes', () => {
  assert.equal(typeof mapHomeInteraction.mapHomeRouteFitKey, 'function');
  const { mapHomeRouteFitKey } = mapHomeInteraction;
  assert.equal(mapHomeRouteFitKey({ routeSelectionKey: '', routeRequested: false }), '');
  assert.equal(
    mapHomeRouteFitKey({
      routeSelectionKey: 'INTERNAL:17',
      routeRequested: true,
      routeStatus: 'loading',
      routeMode: 'WALK',
    }),
    'INTERNAL:17|route:WALK|loading',
  );
  assert.equal(
    mapHomeRouteFitKey({
      routeSelectionKey: 'INTERNAL:17',
      routeRequested: true,
      routeStatus: 'ready',
      routeMode: 'TRANSIT',
    }),
    'INTERNAL:17|route:TRANSIT|ready',
  );
});

test('gives the route camera sole ownership while route comparison is open', () => {
  assert.equal(typeof mapHomeInteraction.mapHomePlaceCameraState, 'function');
  const { mapHomePlaceCameraState } = mapHomeInteraction;

  assert.deepEqual(
    mapHomePlaceCameraState({ routeRequested: true, selectedPlaceKey: 'INTERNAL:17' }),
    { fitPlaceMarkers: false, focusedPlaceKey: '', followUserLocation: false },
  );
  assert.deepEqual(
    mapHomePlaceCameraState({ routeRequested: false, selectedPlaceKey: 'INTERNAL:17' }),
    { fitPlaceMarkers: true, focusedPlaceKey: 'INTERNAL:17', followUserLocation: true },
  );
});

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
