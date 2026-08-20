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

test('sendAiGuideMessage posts the bounded chat contract with an optional JWT', async () => {
  const client = await import('./client.js');
  assert.equal(typeof client.sendAiGuideMessage, 'function', 'AI guide API function must exist');

  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const controller = new AbortController();
  const localStorage = createStorage({ accessToken: 'guide-token' });
  let request;
  const result = { answer: '안국의 조용한 카페를 추천할게요.', responseId: 'response-1' };
  globalThis.window = { localStorage };
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return successResponse(result);
  };

  try {
    const response = await client.sendAiGuideMessage({
      message: '안국에서 조용한 카페를 추천해줘',
      history: [
        { role: 'ASSISTANT', content: '어떤 여행을 도와드릴까요?' },
        { role: 'USER', content: '카페를 찾고 있어.' },
      ],
      currentLocation: { latitude: 37.577, longitude: 126.972 },
      previousResponseId: 'response-before-search',
      signal: controller.signal,
    });

    assert.equal(request.url, '/api/v1/ai-guide/chats');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.get('Authorization'), 'Bearer guide-token');
    assert.deepEqual(JSON.parse(request.options.body), {
      message: '안국에서 조용한 카페를 추천해줘',
      history: [
        { role: 'ASSISTANT', content: '어떤 여행을 도와드릴까요?' },
        { role: 'USER', content: '카페를 찾고 있어.' },
      ],
      currentLocation: { latitude: 37.577, longitude: 126.972 },
      previousResponseId: 'response-before-search',
    });
    assert.equal(request.options.signal, controller.signal);
    assert.deepEqual(response, result);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('AI guide quota errors preserve transport details and provide actionable guidance', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    isSuccess: false,
    code: 'AIGUIDE4291',
    message: 'AI 가이드 사용량 한도를 초과했습니다.',
  }), { status: 429, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(
      client.sendAiGuideMessage({ message: '종로역 혼잡도 알려줘' }),
      (error) => {
        assert.equal(error.status, 429);
        assert.equal(error.code, 'AIGUIDE4291');
        assert.equal(error.path, '/v1/ai-guide/chats');
        const presentation = client.getAiGuideErrorPresentation(error);
        assert.equal(presentation.title, 'OpenAI 사용량 한도를 초과했어요');
        assert.equal(presentation.technical, 'HTTP 429 · AIGUIDE4291');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI guide network failures are distinguishable from backend JSON errors', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };

  try {
    await assert.rejects(
      client.sendAiGuideMessage({ message: '종로역 혼잡도 알려줘' }),
      (error) => {
        assert.equal(error.status, 0);
        assert.equal(error.code, 'NETWORK_ERROR');
        assert.equal(error.cause.message, 'fetch failed');
        assert.equal(client.getAiGuideErrorPresentation(error).title, '백엔드 서버에 연결하지 못했어요');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('non-JSON proxy failures are reported as invalid responses with HTTP status', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Bad Gateway', {
    status: 502,
    headers: { 'Content-Type': 'text/plain' },
  });

  try {
    await assert.rejects(
      client.sendAiGuideMessage({ message: '종로역 혼잡도 알려줘' }),
      (error) => {
        assert.equal(error.status, 502);
        assert.equal(error.code, 'INVALID_RESPONSE');
        const presentation = client.getAiGuideErrorPresentation(error);
        assert.equal(presentation.title, '서버 응답을 읽지 못했어요');
        assert.equal(presentation.technical, 'HTTP 502 · INVALID_RESPONSE');
        return true;
      },
    );
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

test('fetchPlaceTrends requests the default latest-trend limit and preserves abort', async () => {
  const client = await import('./client.js');
  assert.equal(typeof client.fetchPlaceTrends, 'function', 'place trend API function must exist');

  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let request;
  const result = [{
    placeId: 152,
    name: '콘웨이커피 안국점',
    district: '종로구',
    categoryLabel: '카페',
    imageUrl: null,
    trend: {
      status: 'TRENDING',
      updatedAt: '2026-08-13',
    },
  }];
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return successResponse(result);
  };

  try {
    const response = await client.fetchPlaceTrends({ signal: controller.signal });
    const url = new URL(request.url, 'https://ddemachim.test');

    assert.equal(url.pathname, '/api/places/trends');
    assert.equal(url.searchParams.get('limit'), '6');
    assert.equal(request.options.signal, controller.signal);
    assert.deepEqual(response, result);
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

test('fetchCoursePreview posts the exact authenticated draft and preserves abort', async () => {
  const client = await import('./client.js');
  assert.equal(typeof client.fetchCoursePreview, 'function', 'course preview API function must exist');

  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const localStorage = createStorage({ accessToken: 'course-token' });
  const controller = new AbortController();
  const payload = {
    serviceDate: '2026-08-18',
    desiredStartTime: '10:00',
    start: {
      type: 'SEARCHED_PLACE',
      name: '안국역 1번 출구',
      latitude: 37.5763,
      longitude: 126.9854,
    },
    places: [
      { basketItemId: 11, dwellMinutes: 45, arrivalDeadline: '15:00' },
      { basketItemId: 12, dwellMinutes: 60, arrivalDeadline: null },
    ],
  };
  let request;
  globalThis.window = { localStorage };
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return successResponse({ options: [] });
  };

  try {
    await client.fetchCoursePreview(payload, { signal: controller.signal });

    assert.equal(request.url, '/api/courses/preview');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.get('Authorization'), 'Bearer course-token');
    assert.deepEqual(JSON.parse(request.options.body), payload);
    assert.equal(request.options.signal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('course persistence APIs use authenticated save, list, detail, and start contracts', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const localStorage = createStorage({ accessToken: 'course-token' });
  const requests = [];
  globalThis.window = { localStorage };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return successResponse({ id: 31 });
  };

  try {
    const createPayload = { strategy: 'FAST', startTiming: 'SCHEDULED' };
    await client.createCourse(createPayload);
    await client.fetchCourses({ status: 'READY' });
    await client.fetchCourse(31);
    await client.startCourse(31, { replaceActive: true });

    assert.deepEqual(requests.map(({ url, options }) => [url, options.method || 'GET']), [
      ['/api/courses', 'POST'],
      ['/api/courses?status=READY', 'GET'],
      ['/api/courses/31', 'GET'],
      ['/api/courses/31/start', 'POST'],
    ]);
    assert.deepEqual(JSON.parse(requests[0].options.body), createPayload);
    assert.deepEqual(JSON.parse(requests[3].options.body), { replaceActive: true });
    requests.forEach(({ options }) => {
      assert.equal(options.headers.get('Authorization'), 'Bearer course-token');
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('fetchCoursePreview preserves the raw COURSE4222 result only for the exact 422 response', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  const result = {
    requestedStopCount: 1,
    diagnostics: [{
      basketItemId: 11,
      placeName: '서울공예박물관',
      reason: 'PLACE_CLOSED',
      adjustmentProposal: 'CHANGE_SERVICE_DATE',
    }],
  };
  globalThis.fetch = async () => new Response(JSON.stringify({
    isSuccess: false,
    code: 'COURSE4222',
    message: '조건에 맞는 빠른 코스를 생성할 수 없습니다.',
    result,
  }), { status: 422, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(
      client.fetchCoursePreview({ places: [] }),
      (error) => {
        assert.equal(error.status, 422);
        assert.equal(error.code, 'COURSE4222');
        assert.deepEqual(error.result, result);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('non-preview COURSE4222 errors never expose the response result', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    isSuccess: false,
    code: 'COURSE4222',
    message: '다른 요청 오류',
    result: { private: 'do not retain' },
  }), { status: 422, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(
      client.fetchRouteComparison({ origin: {}, destination: {} }),
      (error) => Object.hasOwn(error, 'result') === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preview COURSE4222 errors with a non-422 status never expose the response result', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    isSuccess: false,
    code: 'COURSE4222',
    message: '잘못된 상태 오류',
    result: { private: 'do not retain' },
  }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(
      client.fetchCoursePreview({ places: [] }),
      (error) => Object.hasOwn(error, 'result') === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preview 422 errors with another code never expose the response result', async () => {
  const client = await import('./client.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    isSuccess: false,
    code: 'COURSE4221',
    message: '장소 좌표 오류',
    result: { private: 'do not retain' },
  }), { status: 422, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(
      client.fetchCoursePreview({ places: [] }),
      (error) => Object.hasOwn(error, 'result') === false,
    );
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
