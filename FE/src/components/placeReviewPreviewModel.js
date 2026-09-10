import { withBasePath } from '../utils/appPath.js';
function parseFiniteNumber(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeRating(value) {
  const rating = parseFiniteNumber(value);
  return rating === null ? null : Math.min(5, Math.max(0, rating));
}

export function normalizeReviewSummary(summary, reviews = []) {
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  const count = parseFiniteNumber(summary?.reviewCount);
  return {
    averageRating: normalizeRating(summary?.averageRating),
    reviewCount: count !== null && count >= 0 ? Math.floor(count) : safeReviews.length,
  };
}

export function buildReviewSummaryView(summary, reviews = [], canWriteReview = false) {
  const normalizedSummary = normalizeReviewSummary(summary, reviews);
  return {
    ...normalizedSummary,
    reviewCountLabel: `${normalizedSummary.reviewCount}개 후기`,
    canWriteReview: canWriteReview === true,
  };
}

export function getReviewPreviewEmptyMessage(reviewCount) {
  return reviewCount === 0 ? '아직 방문자 후기가 없어요' : '후기 미리보기를 준비하고 있어요';
}

export function formatReviewRating(value) {
  const rating = normalizeRating(value);
  return rating === null ? '평가 전' : String(rating);
}

export function getPreviewPhotoSource(photo) {
  return [photo?.thumbnailUrl, photo?.url]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim() || '';
}

export function getPreviewPhotos(photos = [], limit = 3) {
  const safePhotos = Array.isArray(photos) ? photos : [];
  const numericLimit = Number(limit);
  const previewLimit = Number.isFinite(numericLimit) ? Math.max(0, Math.floor(numericLimit)) : 3;
  const usablePhotos = safePhotos.filter((photo) => photo && typeof photo === 'object' && getPreviewPhotoSource(photo));

  return [...usablePhotos]
    .sort((left, right) => (Number(left.displayOrder) || 0) - (Number(right.displayOrder) || 0))
    .slice(0, previewLimit);
}

export function normalizePreviewReviews(reviews) {
  if (!Array.isArray(reviews)) return [];
  const usedUiKeys = new Set();

  return reviews
    .filter((review) => review && typeof review === 'object')
    .slice(0, 2)
    .map((review, index) => {
      const rawId = review.id;
      const baseUiKey = rawId === null || rawId === undefined || rawId === '' ? `review-preview-${index}` : String(rawId);
      let uiKey = baseUiKey;
      let suffix = index;
      while (usedUiKeys.has(uiKey)) {
        uiKey = `${baseUiKey}-${suffix}`;
        suffix += 1;
      }
      usedUiKeys.add(uiKey);
      const helpfulCount = Number(review.helpfulCount);

      return {
        ...review,
        uiKey,
        authorNickname: String(review.authorNickname ?? '').trim() || '익명 방문자',
        rating: normalizeRating(review.rating),
        createdAt: typeof review.createdAt === 'string' || typeof review.createdAt === 'number' ? review.createdAt : null,
        visitVerified: review.visitVerified === true,
        text: typeof review.text === 'string' ? review.text : '',
        photos: getPreviewPhotos(review.photos),
        helpfulCount: Number.isFinite(helpfulCount) ? Math.max(0, Math.floor(helpfulCount)) : 0,
        isHelpfulByMe: review.isHelpfulByMe === true,
      };
    });
}

export function toggleHelpful(review = {}) {
  const isHelpfulByMe = !review.isHelpfulByMe;
  const delta = isHelpfulByMe ? 1 : -1;
  const helpfulCount = Number(review.helpfulCount);
  return {
    helpfulCount: Math.max(0, (Number.isFinite(helpfulCount) ? Math.floor(helpfulCount) : 0) + delta),
    isHelpfulByMe,
  };
}

// UI-only fixture: 후기 API가 없어 아래 수치와 내용은 화면 미리보기에서만 사용한다.
export const PLACE_REVIEW_SUMMARY = {
  reviewCount: 126,
  averageRating: 4.7,
};

export const PLACE_REVIEW_ITEMS = [
  {
    id: 'place-review-preview-1',
    authorNickname: '민서',
    rating: 5,
    createdAt: '2026.08.12',
    visitVerified: true,
    text: '골목에서 바로 보여 찾기 쉬웠고, 창가 자리가 특히 좋았어요. 오후 햇빛이 들어올 때 사진이 잘 나왔습니다.',
    photos: [
      {
        id: 'place-review-preview-1-photo-2',
        url: withBasePath('/assets/cafe-garden.png'),
        thumbnailUrl: withBasePath('/assets/cafe-garden.png'),
        displayOrder: 1,
        alt: '햇빛이 비치는 카페 정면과 창가',
      },
      {
        id: 'place-review-preview-1-photo-1',
        url: withBasePath('/assets/figma/place-detail.jpeg'),
        thumbnailUrl: withBasePath('/assets/figma/place-detail.jpeg'),
        displayOrder: 0,
        alt: '골목에서 바라본 카페 외관',
      },
    ],
    helpfulCount: 18,
    isHelpfulByMe: false,
  },
  {
    id: 'place-review-preview-2',
    authorNickname: '지우',
    rating: 4,
    createdAt: '2026.08.10',
    visitVerified: true,
    text: '주말 오전에 방문했는데 오래 기다리지 않았어요. 공간이 차분해서 천천히 쉬어가기 좋았습니다.',
    photos: [],
    helpfulCount: 7,
    isHelpfulByMe: false,
  },
];
