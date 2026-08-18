import assert from 'node:assert/strict';
import test from 'node:test';

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function successResponse(result) {
  return new Response(JSON.stringify({ isSuccess: true, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('fetchKakaoPlaces sends available location options and preserves the abort signal', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return successResponse([]);
  };

  try {
    await client.fetchKakaoPlaces('북촌 한옥마을', {
      latitude: 37.5826,
      longitude: 126.9832,
      radius: 20000,
      signal: controller.signal,
    });

    const url = new URL(request.url, 'https://ddemachim.test');
    assert.equal(url.pathname, '/api/place-search/kakao');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      query: '북촌 한옥마을',
      latitude: '37.5826',
      longitude: '126.9832',
      radius: '20000',
    });
    assert.equal(request.options.signal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchKakaoPlaces omits missing location parameters', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = url;
    return successResponse([]);
  };

  try {
    await client.fetchKakaoPlaces('서촌');

    const url = new URL(requestUrl, 'https://ddemachim.test');
    assert.equal(url.searchParams.get('query'), '서촌');
    assert.equal(url.searchParams.has('latitude'), false);
    assert.equal(url.searchParams.has('longitude'), false);
    assert.equal(url.searchParams.has('radius'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('addKakaoPlaceToCourseBasket sends the frozen authenticated payload', async () => {
  const client = await import('./client.js');
  assert.equal(typeof client.addKakaoPlaceToCourseBasket, 'function', 'Kakao basket API function must exist');

  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const localStorage = createStorage({ accessToken: 'token-123' });
  let request;
  globalThis.window = { localStorage };
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      isSuccess: true,
      result: {
        id: 41,
        source: 'KAKAO',
        providerPlaceId: '18612586',
        placeName: '긴고랑 한우촌',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await client.addKakaoPlaceToCourseBasket({
      providerPlaceId: '18612586',
      name: '긴고랑 한우촌',
      categoryName: '음식점 > 한식 > 육류,고기',
      categoryGroupCode: 'FD6',
      roadAddress: '서울 종로구 율곡로 10',
      lotAddress: '서울 종로구 관훈동 1',
      longitude: 126.9841,
      latitude: 37.5742,
      phone: '02-123-4567',
      placeUrl: 'https://place.map.kakao.com/18612586',
    });

    assert.equal(request.url, '/api/course-basket/kakao-places');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.get('Authorization'), 'Bearer token-123');
    assert.deepEqual(JSON.parse(request.options.body), {
      providerPlaceId: '18612586',
      name: '긴고랑 한우촌',
      categoryName: '음식점 > 한식 > 육류,고기',
      categoryGroupCode: 'FD6',
      roadAddress: '서울 종로구 율곡로 10',
      lotAddress: '서울 종로구 관훈동 1',
      longitude: 126.9841,
      latitude: 37.5742,
      phone: '02-123-4567',
    });
    assert.equal(result.id, 41);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('authenticated Kakao add clears stale auth when the backend returns 401', async () => {
  const client = await import('./client.js');
  assert.equal(typeof client.addKakaoPlaceToCourseBasket, 'function', 'Kakao basket API function must exist');

  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const localStorage = createStorage({ accessToken: 'expired-token', user: '{"id":1}' });
  globalThis.window = { localStorage };
  globalThis.fetch = async () => new Response(JSON.stringify({
    isSuccess: false,
    code: 'AUTH401',
    message: '로그인이 필요합니다.',
  }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(
      client.addKakaoPlaceToCourseBasket({
        providerPlaceId: '18612586',
        name: '긴고랑 한우촌',
        longitude: 126.9841,
        latitude: 37.5742,
      }),
      (error) => error.status === 401,
    );
    assert.equal(localStorage.getItem('accessToken'), null);
    assert.equal(localStorage.getItem('user'), null);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('fetchRouteComparison sends only origin and destination and preserves abort', async () => {
  const client = await import('./client.js');
  assert.equal(typeof client.fetchRouteComparison, 'function', 'route comparison API function must exist');

  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return successResponse({ routes: [] });
  };

  try {
    await client.fetchRouteComparison({
      origin: {
        latitude: 37.5665,
        longitude: 126.978,
        name: '현재 위치',
        address: '서울 종로구 세종대로 1',
        providerPlaceId: 'origin-secret',
      },
      destination: {
        latitude: 37.5559,
        longitude: 126.9723,
        name: '선택 장소',
        address: '서울 종로구 가회동 1',
        providerPlaceId: 'destination-secret',
      },
      signal: controller.signal,
    });

    assert.equal(request.url, '/api/routes/compare');
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), {
      origin: { latitude: 37.5665, longitude: 126.978 },
      destination: { latitude: 37.5559, longitude: 126.9723 },
    });
    assert.equal(request.options.signal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchMockCrowdingPoints posts one coordinate batch and unwraps the API result', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let request;
  const points = [
    { referenceId: 'place:101', latitude: 37.5759, longitude: 126.9768 },
    { referenceId: 'event:202', latitude: 37.5826, longitude: 126.9832 },
  ];
  const result = [
    {
      referenceId: 'place:101',
      covered: true,
      gridCode: 'G-100-100',
      score: 42,
      level: 'NORMAL',
      levelLabel: '보통',
      mock: true,
      slotStart: '2026-08-18T14:00:00+09:00',
      slotEnd: '2026-08-18T14:30:00+09:00',
    },
    { referenceId: 'event:202', covered: false },
  ];
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return successResponse(result);
  };

  try {
    const response = await client.fetchMockCrowdingPoints(points, {
      at: '2026-08-18T14:17:00+09:00',
      signal: controller.signal,
    });

    assert.equal(request.url, '/api/v1/crowding/points');
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), {
      points,
      at: '2026-08-18T14:17:00+09:00',
    });
    assert.equal(request.options.signal, controller.signal);
    assert.deepEqual(response, result);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchMockCrowdingGrids sends WGS84 viewport bounds, optional slot time, and abort signal', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let request;
  const result = [{
    gridCode: 'G-100-100',
    coordinates: [[
      [126.9765, 37.5757],
      [126.9771, 37.5757],
      [126.9771, 37.5761],
      [126.9765, 37.5761],
      [126.9765, 37.5757],
    ]],
    centerLatitude: 37.5759,
    centerLongitude: 126.9768,
    score: 76,
    level: 'VERY_CROWDED',
    levelLabel: '붐빔',
    mock: true,
    slotStart: '2026-08-18T14:00:00+09:00',
    slotEnd: '2026-08-18T14:30:00+09:00',
  }];
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return successResponse(result);
  };

  try {
    const response = await client.fetchMockCrowdingGrids({
      minLat: 37.57,
      maxLat: 37.58,
      minLng: 126.97,
      maxLng: 126.98,
    }, {
      at: '2026-08-18T14:17:00+09:00',
      signal: controller.signal,
    });

    const url = new URL(request.url, 'https://ddemachim.test');
    assert.equal(url.pathname, '/api/v1/crowding/grids');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      minLat: '37.57',
      maxLat: '37.58',
      minLng: '126.97',
      maxLng: '126.98',
      at: '2026-08-18T14:17:00+09:00',
    });
    assert.equal(request.options.signal, controller.signal);
    assert.deepEqual(response, result);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
