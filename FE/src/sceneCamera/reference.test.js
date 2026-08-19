import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { LOCAL_REFERENCE_STILLS, normalizeReferenceStill, preflightReference, resolveReferenceStill } from './reference.js';

const valid = { url: '/assets/scenes/42.png', altText: '처마와 마당이 보이는 참고 장면', attribution: '권리 승인 제공자', width: 1080, height: 1440 };

test('resolves filming location 1 to its bundled same-origin reference still', async () => {
  const reference = resolveReferenceStill('1', LOCAL_REFERENCE_STILLS, { origin: 'https://example.test' });

  assert.deepEqual(reference, {
    url: '/assets/scenes/filming-location-1.jpg',
    altText: '촬영지 1의 장면 구도 참고 이미지',
    attribution: '테스트용 임시 이미지 · 원본 제공: 경향신문(images.khan.co.kr)',
    width: 600,
    height: 399,
  });
  assert.equal(Object.isFrozen(LOCAL_REFERENCE_STILLS), true);

  const assetUrl = new URL(`../../public${reference.url}`, import.meta.url);
  const asset = await readFile(assetUrl);
  assert.deepEqual([...asset.subarray(0, 3)], [0xff, 0xd8, 0xff]);
});

test('normalizes only complete same-origin reference metadata', () => {
  assert.deepEqual(normalizeReferenceStill(valid, { origin: 'https://example.test' }), valid);
  assert.equal(normalizeReferenceStill({ ...valid, url: 'https://cdn.test/42.png' }, { origin: 'https://example.test' }), null);
  assert.equal(normalizeReferenceStill({ ...valid, width: 0 }, { origin: 'https://example.test' }), null);
  assert.equal(normalizeReferenceStill({ ...valid, attribution: '' }, { origin: 'https://example.test' }), null);
});

function imageFixture({ naturalWidth = 1080, naturalHeight = 1440, decodeReject = null } = {}) {
  const image = {
    naturalWidth,
    naturalHeight,
    complete: false,
    crossOrigin: undefined,
    _src: '',
    decode: () => decodeReject ? Promise.reject(decodeReject) : Promise.resolve(),
    set src(value) { this._src = value; this.complete = true; queueMicrotask(() => this.onload?.()); },
    get src() { return this._src; },
  };
  return image;
}

test('preflights decode, intrinsic dimensions, and origin-clean canvas before returning the image', async () => {
  const image = imageFixture();
  const calls = [];
  const result = await preflightReference(valid, {
    createImage: () => image,
    createCanvas: () => ({ getContext: () => ({ drawImage: (...args) => calls.push(['drawImage', ...args]), getImageData: (...args) => calls.push(['getImageData', ...args]) }) }),
    timeoutMs: 50,
  });
  assert.equal(result.image, image);
  assert.equal(image.src, valid.url);
  assert.deepEqual(calls.map(([name]) => name), ['drawImage', 'getImageData']);
});

test('preflight reports typed dimension, decode, timeout, and taint failures', async () => {
  await assert.rejects(preflightReference(valid, { createImage: () => imageFixture({ naturalWidth: 10 }), createCanvas: () => ({}), timeoutMs: 50 }), { code: 'dimension' });
  await assert.rejects(preflightReference(valid, { createImage: () => imageFixture({ decodeReject: new Error('bad') }), createCanvas: () => ({}), timeoutMs: 50 }), { code: 'decode' });
  await assert.rejects(preflightReference(valid, { createImage: () => ({ set src(_) {}, decode: () => new Promise(() => {}) }), createCanvas: () => ({}), timeoutMs: 2 }), { code: 'timeout' });
  await assert.rejects(preflightReference(valid, { createImage: () => imageFixture(), createCanvas: () => ({ getContext: () => ({ drawImage() {}, getImageData() { throw new Error('tainted'); } }) }), timeoutMs: 50 }), { code: 'taint' });
});

test('timeout detaches late image listeners so a stale load cannot resume preflight', async () => {
  const image = { set src(value) { this._src = value; }, decode: () => new Promise(() => {}) };
  await assert.rejects(preflightReference(valid, { createImage: () => image, createCanvas: () => ({}), timeoutMs: 2 }), { code: 'timeout' });
  assert.equal(image.onload, null);
  assert.equal(image.onerror, null);
});
