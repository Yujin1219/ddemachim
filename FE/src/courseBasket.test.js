import assert from 'node:assert/strict';
import test from 'node:test';

test('basket helpers deduplicate Kakao items by provider id without colliding with internal places', async () => {
  const basket = await import('./courseBasket.js').catch(() => ({}));
  assert.equal(typeof basket.mergeBasketItem, 'function', 'basket merge helper must exist');
  assert.equal(typeof basket.basketHasKakaoPlace, 'function', 'Kakao identity helper must exist');
  assert.equal(typeof basket.basketHasUserPlace, 'function', 'internal identity helper must exist');

  const items = [
    { id: 1, source: 'DDEMACHIM', placeId: 777, placeName: '내부 장소' },
    { id: 2, source: 'KAKAO', providerPlaceId: '777', placeName: '이전 카카오 이름' },
  ];
  const merged = basket.mergeBasketItem(items, {
    id: 3,
    source: 'KAKAO',
    providerPlaceId: '777',
    placeName: '갱신된 카카오 이름',
  });

  assert.equal(merged.length, 2);
  assert.equal(merged[0].placeName, '갱신된 카카오 이름');
  assert.equal(merged[1].source, 'DDEMACHIM');
  assert.equal(basket.basketHasKakaoPlace(merged, '777'), true);
  assert.equal(basket.basketHasUserPlace(merged, 777), true);
  assert.equal(basket.basketHasKakaoPlace(merged, 'missing'), false);
});

test('duplicate basket errors include HTTP conflicts and already-added API codes', async () => {
  const basket = await import('./courseBasket.js').catch(() => ({}));
  assert.equal(typeof basket.isDuplicateBasketError, 'function', 'duplicate error helper must exist');

  assert.equal(basket.isDuplicateBasketError({ status: 409 }), true);
  assert.equal(basket.isDuplicateBasketError({ code: 'COURSE_BASKET_ALREADY_EXISTS' }), true);
  assert.equal(basket.isDuplicateBasketError({ status: 500, code: 'SERVER_ERROR' }), false);
});

test('auth return storage is consumed once and preserves the place id', async () => {
  const basket = await import('./courseBasket.js').catch(() => ({}));
  assert.equal(typeof basket.storeAuthReturnRoute, 'function', 'auth return writer must exist');
  assert.equal(typeof basket.consumeAuthReturnRoute, 'function', 'auth return reader must exist');

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };

  basket.storeAuthReturnRoute({ screen: 'place', id: 81 }, storage);

  assert.deepEqual(basket.consumeAuthReturnRoute(storage), { screen: 'place', id: '81' });
  assert.equal(basket.consumeAuthReturnRoute(storage), null);
});

test('Kakao external links reject non-Kakao URLs and fall back to the provider place page', async () => {
  const basket = await import('./courseBasket.js');
  assert.equal(typeof basket.getKakaoPlaceUrl, 'function', 'Kakao URL helper must exist');

  assert.equal(
    basket.getKakaoPlaceUrl({ providerPlaceId: '18612586', placeUrl: 'http://place.map.kakao.com/18612586' }),
    'https://place.map.kakao.com/18612586',
  );
  assert.equal(
    basket.getKakaoPlaceUrl({ providerPlaceId: '18612586', placeUrl: 'javascript:alert(1)' }),
    'https://place.map.kakao.com/18612586',
  );
});
