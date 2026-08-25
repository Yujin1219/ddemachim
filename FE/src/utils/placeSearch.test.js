import assert from 'node:assert/strict';
import test from 'node:test';

import * as placeSearch from './placeSearch.js';

test('filters Explore places, works, and events by their searchable metadata', () => {
  assert.equal(typeof placeSearch.filterSearchItems, 'function');

  const items = [
    { id: 'place', name: '다락숲 안국점', searchText: '종로구 음식점 바질 크림 파스타' },
    { id: 'work', name: '왜 오수재인가', badge: '드라마 · 2022', meta: '촬영 장소 2곳' },
    { id: 'event', name: '한여름밤의 클래식', venueName: '세종문화회관 대극장', eventType: '공연' },
  ];

  assert.deepEqual(placeSearch.filterSearchItems(items, '바질 파스타').map((item) => item.id), ['place']);
  assert.deepEqual(placeSearch.filterSearchItems(items, '오수재').map((item) => item.id), ['work']);
  assert.deepEqual(placeSearch.filterSearchItems(items, '세종 문화회관').map((item) => item.id), ['event']);
  assert.deepEqual(placeSearch.filterSearchItems(items, '').map((item) => item.id), ['place', 'work', 'event']);
});

test('explore catalog search queries every server collection instead of filtering only loaded cards', async () => {
  assert.equal(typeof placeSearch.searchExploreCatalog, 'function');

  const calls = [];
  const signal = new AbortController().signal;
  const result = await placeSearch.searchExploreCatalog(' 오수재 ', {
    signal,
    fetchPlaces: async (params) => {
      calls.push(['places', params]);
      return { content: [{ id: 11, name: '오수재 촬영지' }] };
    },
    fetchFilmingWorks: async (params) => {
      calls.push(['works', params]);
      return { content: [
        { mediaId: 22, title: '왜 오수재인가' },
        { mediaId: 23, title: '관련 없는 작품' },
      ] };
    },
    fetchEvents: async (params) => {
      calls.push(['events', params]);
      return { content: [{ id: 33, title: '오수재 특별전' }] };
    },
  });

  assert.deepEqual(calls, [
    ['places', { keyword: '오수재', page: 0, size: 50, signal }],
    ['works', { keyword: '오수재', page: 0, size: 50, signal }],
    ['events', { keyword: '오수재', status: 'ONGOING', page: 0, size: 50, signal }],
  ]);
  assert.deepEqual(result, {
    places: [{ id: 11, name: '오수재 촬영지' }],
    works: [{ mediaId: 22, title: '왜 오수재인가' }],
    events: [{ id: 33, title: '오수재 특별전' }],
    hasPartialError: false,
  });
});

test('ranks an exact place name ahead of every provider partial match', () => {
  assert.equal(typeof placeSearch.rankSearchItems, 'function');

  const internalPartials = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    name: `경복궁점 ${index + 1}`,
    externalSource: 'DDEMACHIM',
  }));
  const exactKakaoPlace = {
    id: 'kakao:18565297',
    name: '경복궁',
    externalSource: 'KAKAO',
  };

  const ranked = placeSearch.rankSearchItems([...internalPartials, exactKakaoPlace], '경복궁');

  assert.equal(ranked[0].id, 'kakao:18565297');
  assert.deepEqual(ranked.slice(1).map((item) => item.id), internalPartials.map((item) => item.id));
});

test('formats available distances for concise Korean search metadata', () => {
  assert.equal(typeof placeSearch.formatCurrentLocationDistance, 'function');
  assert.equal(placeSearch.formatCurrentLocationDistance(320), '현재 위치에서 320m');
  assert.equal(placeSearch.formatCurrentLocationDistance(1200), '현재 위치에서 1.2km');
  assert.equal(placeSearch.formatCurrentLocationDistance(null), null);
  assert.equal(placeSearch.formatCurrentLocationDistance(undefined), null);
  assert.equal(placeSearch.formatCurrentLocationDistance(-1), null);
});

test('maps nullable Kakao distance before the address', () => {
  assert.equal(typeof placeSearch.mapKakaoPlaceToSearchRow, 'function');

  const nearby = placeSearch.mapKakaoPlaceToSearchRow({
    providerPlaceId: '123',
    name: '북촌 한옥마을',
    categoryName: '관광명소 > 문화유적',
    roadAddress: '서울 종로구 계동길 37',
    distanceMeters: '1200',
  });
  const withoutDistance = placeSearch.mapKakaoPlaceToSearchRow({
    providerPlaceId: '456',
    name: '서촌 카페',
    lotAddress: '서울 종로구 서촌동 1',
    distanceMeters: null,
  });

  assert.equal(nearby.distanceMeters, 1200);
  assert.equal(nearby.meta, '현재 위치에서 1.2km · 서울 종로구 계동길 37');
  assert.deepEqual(nearby.labels, { content: '카카오 검색', category: '문화유적' });
  assert.equal(withoutDistance.distanceMeters, null);
  assert.equal(withoutDistance.meta, '서울 종로구 서촌동 1');
});

test('keeps unverified Kakao search rows out of congestion lookup while retaining coordinates', () => {
  const row = placeSearch.mapKakaoPlaceToSearchRow({
    providerPlaceId: '789',
    name: '광화문광장',
    longitude: 126.9769,
    latitude: 37.5724,
  });

  assert.equal(row.showCongestion, false);
  assert.equal(row.longitude, 126.9769);
  assert.equal(row.latitude, 37.5724);
});

test('maps a Kakao map target without claiming internal congestion data', () => {
  assert.equal(typeof placeSearch.mapKakaoPlaceToMapCard, 'function');

  const card = placeSearch.mapKakaoPlaceToMapCard({
    providerPlaceId: '789',
    name: '광화문광장',
    longitude: 126.9769,
    latitude: 37.5724,
    roadAddress: '서울 종로구 세종대로 172',
  });

  assert.equal(card.name, '광화문광장');
  assert.equal(card.meta, '서울 종로구 세종대로 172');
  assert.equal(card.longitude, 126.9769);
  assert.equal(card.latitude, 37.5724);
  assert.equal(card.externalSource, 'KAKAO');
  assert.equal(card.showCongestion, false);
});

test('does not enable congestion for a Kakao map card without valid coordinates', () => {
  const card = placeSearch.mapKakaoPlaceToMapCard({
    name: '좌표 없는 장소',
    lotAddress: '서울 종로구 가상의 주소',
    longitude: 126.9769,
    latitude: null,
  });

  assert.equal(card.meta, '서울 종로구 가상의 주소');
  assert.equal(card.externalSource, 'KAKAO');
  assert.equal(card.showCongestion, false);
});

test('requests one cached browser position with a bounded timeout', async () => {
  assert.equal(typeof placeSearch.getSearchCoordinates, 'function');
  let calls = 0;
  let receivedOptions;
  const geolocation = {
    getCurrentPosition(onSuccess, _onError, options) {
      calls += 1;
      receivedOptions = options;
      onSuccess({ coords: { latitude: 37.5826, longitude: 126.9832 } });
    },
  };

  const coordinates = await placeSearch.getSearchCoordinates({ geolocation });

  assert.deepEqual(coordinates, { latitude: 37.5826, longitude: 126.9832 });
  assert.equal(calls, 1);
  assert.deepEqual(receivedOptions, {
    enableHighAccuracy: false,
    timeout: 3500,
    maximumAge: 300000,
  });
});

test('falls back without coordinates when geolocation is unsupported or denied', async () => {
  assert.equal(typeof placeSearch.getSearchCoordinates, 'function');
  const denied = {
    getCurrentPosition(_onSuccess, onError) {
      onError(new Error('denied'));
    },
  };

  assert.equal(await placeSearch.getSearchCoordinates({ geolocation: null }), null);
  assert.equal(await placeSearch.getSearchCoordinates({ geolocation: denied }), null);
});

test('bounds a silent geolocation request and ignores its stale callback', async () => {
  assert.equal(typeof placeSearch.getSearchCoordinates, 'function');
  let onSuccess;
  const geolocation = {
    getCurrentPosition(success) {
      onSuccess = success;
    },
  };

  const coordinates = await placeSearch.getSearchCoordinates({ geolocation, timeoutMs: 5 });
  onSuccess({ coords: { latitude: 37.5, longitude: 127 } });

  assert.equal(coordinates, null);
});

test('aborts a pending location request without accepting a later position', async () => {
  assert.equal(typeof placeSearch.getSearchCoordinates, 'function');
  const controller = new AbortController();
  let onSuccess;
  const geolocation = {
    getCurrentPosition(success) {
      onSuccess = success;
    },
  };

  const coordinatesPromise = placeSearch.getSearchCoordinates({
    geolocation,
    signal: controller.signal,
    timeoutMs: 100,
  });
  controller.abort();
  onSuccess({ coords: { latitude: 37.5, longitude: 127 } });

  await assert.rejects(coordinatesPromise, (error) => error?.name === 'AbortError');
});
