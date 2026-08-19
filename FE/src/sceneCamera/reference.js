export const LOCAL_REFERENCE_STILLS = Object.freeze({
  1: Object.freeze({
    url: '/assets/scenes/filming-location-1.jpg',
    altText: '촬영지 1의 장면 구도 참고 이미지',
    attribution: '테스트용 임시 이미지 · 원본 제공: 경향신문(images.khan.co.kr)',
    width: 600,
    height: 399,
  }),
});

export class ReferenceError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'ReferenceError';
    this.code = code;
  }
}

export function normalizeReferenceStill(value, { origin = globalThis.location?.origin } = {}) {
  if (!value || typeof value !== 'object') return null;
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) return null;
  if (![value.url, value.altText, value.attribution].every((item) => typeof item === 'string' && item.trim())) return null;
  try {
    const base = origin || 'https://local.invalid';
    const url = new URL(value.url, base);
    if (url.origin !== new URL(base).origin) return null;
  } catch {
    return null;
  }
  return { url: value.url, altText: value.altText.trim(), attribution: value.attribution.trim(), width, height };
}

export function resolveReferenceStill(id, map = LOCAL_REFERENCE_STILLS, options) {
  return normalizeReferenceStill(map[id], options);
}

function withTimeout(promise, timeoutMs) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new ReferenceError('timeout', '참고 장면 확인 시간이 초과됐어요.')), timeoutMs); }),
  ]).finally(() => clearTimeout(timeout));
}

export async function preflightReference(metadata, {
  createImage = () => new Image(),
  createCanvas = () => document.createElement('canvas'),
  timeoutMs = 8000,
} = {}) {
  if (!metadata) throw new ReferenceError('missing', '참고 장면이 없어요.');
  const image = createImage();
  const load = new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = (event) => reject(new ReferenceError('decode', '참고 장면을 불러오지 못했어요.', event));
  });
  if (/^https?:/i.test(metadata.url)) image.crossOrigin = 'anonymous';
  image.src = metadata.url;

  try {
    await withTimeout((async () => {
      await load;
      try {
        await image.decode?.();
      } catch (error) {
        throw new ReferenceError('decode', '참고 장면을 해석하지 못했어요.', error);
      }
    })(), timeoutMs);
  } finally {
    image.onload = null;
    image.onerror = null;
  }

  if (image.naturalWidth !== metadata.width || image.naturalHeight !== metadata.height) {
    throw new ReferenceError('dimension', '참고 장면 크기가 승인된 정보와 달라요.');
  }
  try {
    const canvas = createCanvas();
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(image, 0, 0, 1, 1);
    context.getImageData(0, 0, 1, 1);
  } catch (error) {
    throw new ReferenceError('taint', '참고 장면을 안전하게 내보낼 수 없어요.', error);
  }
  return { metadata, image };
}
