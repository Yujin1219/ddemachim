export const FILMING_SCENE_DEMO_REFERENCES = [
  { url: '/assets/scenes/demo/scene-01.jpg', width: 960, height: 467 },
  { url: '/assets/scenes/demo/scene-02.jpg', width: 740, height: 480 },
  { url: '/assets/scenes/demo/scene-03.jpg', width: 730, height: 486 },
  { url: '/assets/scenes/demo/scene-04.jpg', width: 919, height: 512 },
  { url: '/assets/scenes/demo/scene-05.jpg', width: 617, height: 266 },
  { url: '/assets/scenes/demo/scene-06.jpg', width: 960, height: 456 },
];

export const FILMING_SCENE_DEMO_IMAGES = FILMING_SCENE_DEMO_REFERENCES.map(({ url }) => url);

const FILMING_SCENE_REFERENCE_OVERRIDES = Object.freeze({
  78: Object.freeze({
    outlineUrl: '/assets/scenes/demo/scene-01-outline.svg',
    defaultOverlay: Object.freeze({ x: -0.08, y: 0, scale: 1 }),
  }),
});

function stableSeed(filmingLocationId) {
  const numericLocationId = Number(filmingLocationId);
  if (Number.isFinite(numericLocationId)) return numericLocationId;

  return `${filmingLocationId ?? ''}`
    .split('')
    .reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) | 0, 0);
}

export function resolveFilmingSceneImage(
  { workId, filmingLocationId, existingImageUrl } = {},
  demoImages = FILMING_SCENE_DEMO_IMAGES,
) {
  if (existingImageUrl) return existingImageUrl;
  if (!Array.isArray(demoImages) || demoImages.length === 0) return null;

  return demoImages[Math.abs(stableSeed(filmingLocationId)) % demoImages.length];
}

export function resolveFilmingSceneReference(filmingLocationId) {
  if (!/^\d+$/.test(String(filmingLocationId ?? ''))) return null;
  const reference = FILMING_SCENE_DEMO_REFERENCES[
    Math.abs(stableSeed(filmingLocationId)) % FILMING_SCENE_DEMO_REFERENCES.length
  ];
  return {
    ...reference,
    ...FILMING_SCENE_REFERENCE_OVERRIDES[Number(filmingLocationId)],
    altText: '촬영 장면 참고 이미지',
    attribution: '사용자 제공 데모 장면',
  };
}

const FILMING_CONTENT_TYPE_LABELS = {
  DRAMA: '드라마',
  MOVIE: '영화',
  VARIETY: '예능',
};

export function buildFilmingSceneDetailPresentation(filmingLocation = {}) {
  const media = filmingLocation.mediaContent || {};
  const typeLabel = FILMING_CONTENT_TYPE_LABELS[filmingLocation.contentType]
    || (media.mediaType === 'movie' ? '영화' : '작품');
  const releaseYear = /^\d{4}/.exec(media.releaseDate || '')?.[0];

  return {
    kicker: [typeLabel, releaseYear].filter(Boolean).join(' · '),
    title: media.title || '작품 정보를 준비하고 있어요',
    placeName: filmingLocation.placeName || '촬영 장소 정보 확인 중',
    description: filmingLocation.sceneDescription || '촬영 장면 설명을 준비하고 있어요.',
  };
}
