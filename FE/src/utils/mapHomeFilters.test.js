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

test('moves selected categories to the front while keeping both groups in service order', () => {
  const ordered = mapHomeFilters.prioritizeSelectedMapFilters?.(
    MAP_HOME_FILTERS.filter((filter) => filter.key !== 'ALL'),
    ['EVENT', 'CAFE_DESSERT'],
  );

  assert.deepEqual(ordered?.map((filter) => filter.key), [
    'EVENT',
    'CAFE_DESSERT',
    'FILMING',
    'HOT',
    'RESTAURANT',
  ]);
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

test('keeps exactly the clicked cluster members visible after a viewport reload', () => {
  const clickedCluster = [
    { id: 11, name: '첫 번째 장소' },
    { id: 12, name: '두 번째 장소' },
    { id: 13, name: '세 번째 장소' },
  ];
  const reloadedViewport = [
    { id: 1, name: '새로 조회된 장소' },
    { id: 11, name: '갱신된 첫 번째 장소' },
    { id: 12, name: '갱신된 두 번째 장소' },
    { id: 13, name: '갱신된 세 번째 장소' },
    { id: 99, name: '또 다른 새 장소' },
  ];
  const resolvePlaces = mapHomeFilters.resolveExpandedClusterPlaces;

  const visible = typeof resolvePlaces === 'function'
    ? resolvePlaces(reloadedViewport, clickedCluster)
    : [];

  assert.deepEqual(visible.map(({ id, name }) => [id, name]), [
    [11, '갱신된 첫 번째 장소'],
    [12, '갱신된 두 번째 장소'],
    [13, '갱신된 세 번째 장소'],
  ]);
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
    placeId: null,
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

test('resolves an event detail course target for both linked and unlinked venues', () => {
  assert.equal(typeof mapHomeFilters.eventToCourseBasketTarget, 'function');

  assert.deepEqual(mapHomeFilters.eventToCourseBasketTarget({
    id: 7,
    title: '[전시] 여름의 색',
    placeId: 42,
    mainImage: 'https://example.com/exhibition.jpg',
    venueName: '서울공예박물관',
    latitude: 37.576,
    longitude: 126.983,
  }), {
    type: 'PLACE',
    placeId: 42,
    imageUrl: 'https://example.com/exhibition.jpg',
  });

  assert.deepEqual(mapHomeFilters.eventToCourseBasketTarget({
    id: 8,
    title: '[행사] 여름 음악회',
    placeId: null,
    venueName: '세종문화회관 대극장',
    mainImage: 'https://example.com/concert.jpg',
    latitude: 37.572,
    longitude: 126.976,
  }), {
    type: 'EXTERNAL',
    place: {
      providerPlaceId: '8',
      name: '여름 음악회',
      categoryName: '전시·행사',
      categoryGroupCode: 'EVENT',
      roadAddress: '세종문화회관 대극장',
      longitude: 126.976,
      latitude: 37.572,
      imageUrl: 'https://example.com/concert.jpg',
    },
  });
});

test('puts event review writing inside the review tab instead of the sticky action bar', () => {
  assert.equal(typeof mapHomeFilters.eventDetailActionState, 'function');
  assert.deepEqual(mapHomeFilters.eventDetailActionState('info'), {
    showInlineReviewWrite: false,
    showStickyReviewWrite: false,
  });
  assert.deepEqual(mapHomeFilters.eventDetailActionState('review'), {
    showInlineReviewWrite: true,
    showStickyReviewWrite: false,
  });
});
