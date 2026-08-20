import assert from 'node:assert/strict';
import test from 'node:test';

import * as mapHomeFilters from './mapHomeFilters.js';

const {
  MAP_HOME_FILTERS,
  eventToMapMarker,
  mapEventsForFilter,
  mapFilterApiParams,
  resolveCongestionPreference,
} = mapHomeFilters;

test('exposes the approved six map categories in service order', () => {
  assert.deepEqual(MAP_HOME_FILTERS.map(({ key, label }) => [key, label]), [
    ['ALL', '전체'],
    ['FILMING', '촬영지'],
    ['HOT', 'HOT'],
    ['EVENT', '전시·행사'],
    ['RESTAURANT', '음식점'],
    ['CAFE_DESSERT', '카페·디저트'],
  ]);
});

test('maps place-backed categories to the existing map API contract', () => {
  const byKey = Object.fromEntries(MAP_HOME_FILTERS.map((filter) => [filter.key, filter]));

  assert.deepEqual(mapFilterApiParams(byKey.ALL), {});
  assert.deepEqual(mapFilterApiParams(byKey.FILMING), { tag: 'FILMING_LOCATION' });
  assert.deepEqual(mapFilterApiParams(byKey.HOT), {});
  assert.deepEqual(mapFilterApiParams(byKey.EVENT), { category: 'EXHIBITION' });
  assert.deepEqual(mapFilterApiParams(byKey.RESTAURANT), { category: 'RESTAURANT' });
  assert.deepEqual(mapFilterApiParams(byKey.CAFE_DESSERT), { category: 'CAFE,DESSERT' });
});

test('starts with no marker categories and toggles multiple categories in service order', () => {
  let selected = [];

  selected = mapHomeFilters.toggleMapFilterSelection(selected, 'RESTAURANT');
  selected = mapHomeFilters.toggleMapFilterSelection(selected, 'FILMING');
  assert.deepEqual(selected, ['FILMING', 'RESTAURANT']);

  selected = mapHomeFilters.toggleMapFilterSelection(selected, 'RESTAURANT');
  assert.deepEqual(selected, ['FILMING']);
});

test('uses the all chip to select or clear every marker category', () => {
  const allSelected = mapHomeFilters.toggleMapFilterSelection([], 'ALL');

  assert.deepEqual(allSelected, [
    'FILMING',
    'HOT',
    'EVENT',
    'RESTAURANT',
    'CAFE_DESSERT',
  ]);
  assert.equal(mapHomeFilters.areAllMapFiltersSelected(allSelected), true);
  assert.deepEqual(mapHomeFilters.toggleMapFilterSelection(allSelected, 'ALL'), []);
});

test('tags map items with their selected category while preserving an existing tag', () => {
  const untagged = [{ id: 1, name: '식당' }];
  const alreadyTagged = [{ id: 2, name: '팝업', mapCategoryKey: 'POPUP' }];

  assert.deepEqual(mapHomeFilters.tagMapItemsForFilter(untagged, 'RESTAURANT'), [
    { id: 1, name: '식당', mapCategoryKey: 'RESTAURANT' },
  ]);
  assert.deepEqual(mapHomeFilters.tagMapItemsForFilter(alreadyTagged, 'EVENT'), alreadyTagged);
});

test('uses the selected filter category as the marker color source', () => {
  assert.equal(mapHomeFilters.resolveMapMarkerTone({
    id: 1,
    categoryCode: 'RESTAURANT',
    mapCategoryKey: 'HOT',
  }), 'hot');
  assert.equal(mapHomeFilters.resolveMapMarkerTone({
    id: 2,
    categoryCode: 'EXHIBITION',
    mapCategoryKey: 'EVENT',
  }), 'event');
  assert.equal(mapHomeFilters.resolveMapMarkerTone({
    id: 'kakao:3',
    externalSource: 'KAKAO',
  }), 'search');
});

test('keeps one category color for uniform clusters and marks mixed clusters separately', () => {
  assert.equal(mapHomeFilters.resolveMapClusterTone([
    { mapCategoryKey: 'POPUP' },
    { mapCategoryKey: 'POPUP' },
  ]), 'popup');
  assert.equal(mapHomeFilters.resolveMapClusterTone([
    { mapCategoryKey: 'POPUP' },
    { mapCategoryKey: 'EVENT' },
  ]), 'mixed');
});

test('keeps congestion off on first visit and restores only an explicit on preference', () => {
  assert.equal(resolveCongestionPreference(null), false);
  assert.equal(resolveCongestionPreference('off'), false);
  assert.equal(resolveCongestionPreference('on'), true);
});

test('separates popup events from the broader exhibition and event filter', () => {
  const events = [
    { id: 1, title: '서촌 팝업', eventType: 'POPUP', latitude: 37.57, longitude: 126.98 },
    { id: 2, title: '여름 기획전', eventType: '전시/미술', latitude: 37.58, longitude: 126.99 },
    { id: 3, title: '좌표 없는 행사', eventType: '연극', latitude: null, longitude: null },
  ];

  assert.deepEqual(mapEventsForFilter(events, 'POPUP').map((event) => event.id), [1]);
  assert.deepEqual(mapEventsForFilter(events, 'EVENT').map((event) => event.id), [2]);
});

test('converts an event to a namespaced map marker with detail navigation metadata', () => {
  assert.deepEqual(eventToMapMarker({
    id: 7,
    title: '[전시] 여름의 색',
    eventType: '전시/미술',
    venueName: '서울공예박물관',
    latitude: 37.576,
    longitude: 126.983,
    mainImage: 'https://example.com/event.jpg',
  }), {
    id: 'event:7',
    eventId: 7,
    externalSource: 'EVENT',
    name: '여름의 색',
    categoryCode: 'EXHIBITION',
    categoryLabel: '전시·행사',
    roadAddress: '서울공예박물관',
    latitude: 37.576,
    longitude: 126.983,
    imageUrl: 'https://example.com/event.jpg',
    tags: [],
  });
});
