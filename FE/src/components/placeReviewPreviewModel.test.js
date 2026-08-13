import test from 'node:test';
import assert from 'node:assert/strict';
import * as reviewModel from './placeReviewPreviewModel.js';

const { getPreviewPhotos, toggleHelpful } = reviewModel;

test('normalizes numeric strings and rejects invalid ratings', () => {
  assert.equal(typeof reviewModel.normalizeRating, 'function');
  assert.equal(reviewModel.normalizeRating('4.7'), 4.7);
  assert.equal(reviewModel.normalizeRating(null), null);
  assert.equal(reviewModel.normalizeRating('bad'), null);
  assert.equal(reviewModel.normalizeRating('   '), null);
  assert.equal(reviewModel.normalizeRating(true), null);
  assert.equal(reviewModel.normalizeRating(false), null);
});

test('falls back to the visible review length when the summary count is invalid', () => {
  assert.equal(typeof reviewModel.normalizeReviewSummary, 'function');
  assert.deepEqual(
    reviewModel.normalizeReviewSummary({ averageRating: null, reviewCount: 'bad' }, [{}, {}]),
    { averageRating: null, reviewCount: 2 },
  );
});

test('rejects whitespace-only strings and booleans as review counts', () => {
  const reviews = [{}, {}];

  assert.equal(reviewModel.normalizeReviewSummary({ reviewCount: '   ' }, reviews).reviewCount, 2);
  assert.equal(reviewModel.normalizeReviewSummary({ reviewCount: true }, reviews).reviewCount, 2);
  assert.equal(reviewModel.normalizeReviewSummary({ reviewCount: false }, reviews).reviewCount, 2);
});

test('distinguishes an unavailable preview from a place with no reviews', () => {
  assert.equal(typeof reviewModel.getReviewPreviewEmptyMessage, 'function');
  assert.equal(reviewModel.getReviewPreviewEmptyMessage(126), '후기 미리보기를 준비하고 있어요');
  assert.equal(reviewModel.getReviewPreviewEmptyMessage(0), '아직 방문자 후기가 없어요');
});

test('orders review photos and limits the preview to three', () => {
  const photos = [
    { id: 2, displayOrder: 2, url: '/2.jpg' },
    { id: 0, displayOrder: 0, url: '/0.jpg' },
    { id: 3, displayOrder: 3, url: '/3.jpg' },
    { id: 1, displayOrder: 1, url: '/1.jpg' },
  ];

  assert.deepEqual(getPreviewPhotos(photos).map((photo) => photo.id), [0, 1, 2]);
});

test('keeps the caller photo order unchanged while sorting the preview', () => {
  const photos = [
    { id: 'last', displayOrder: 2, url: '/last.jpg' },
    { id: 'first', displayOrder: 0, url: '/first.jpg' },
    { id: 'middle', displayOrder: 1, url: '/middle.jpg' },
  ];

  assert.deepEqual(getPreviewPhotos(photos).map((photo) => photo.id), ['first', 'middle', 'last']);
  assert.deepEqual(photos.map((photo) => photo.id), ['last', 'first', 'middle']);
});

test('returns no photos for null and removes photos without a usable URL', () => {
  assert.deepEqual(getPreviewPhotos(null), []);
  assert.deepEqual(
    getPreviewPhotos([{ id: 'missing' }, { id: 'blank', url: '  ' }, { id: 'ok', url: '/ok.jpg' }]).map((photo) => photo.id),
    ['ok'],
  );
});

test('normalizes a non-array review payload to an empty list', () => {
  assert.equal(typeof reviewModel.normalizePreviewReviews, 'function');
  assert.deepEqual(reviewModel.normalizePreviewReviews(null), []);
});

test('normalizes review identity, rating, and photos for a bounded preview', () => {
  assert.equal(typeof reviewModel.normalizePreviewReviews, 'function');
  const reviews = reviewModel.normalizePreviewReviews([
    { id: 'first', rating: '4.7', photos: [{ id: 'photo', url: '/photo.jpg' }] },
    null,
    { authorNickname: '둘째', photos: null },
    { id: 'ignored', photos: [{ id: 'photo-3', url: '/photo-3.jpg' }] },
  ]);

  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].uiKey, 'first');
  assert.equal(reviews[0].rating, 4.7);
  assert.deepEqual(reviews[0].photos.map((photo) => photo.id), ['photo']);
  assert.equal(reviews[1].uiKey, 'review-preview-1');
  assert.deepEqual(reviews[1].photos, []);
});

test('assigns unique UI keys when preview reviews share an ID', () => {
  const reviews = reviewModel.normalizePreviewReviews([
    { id: 'duplicate' },
    { id: 'duplicate' },
  ]);

  assert.equal(new Set(reviews.map((review) => review.uiKey)).size, reviews.length);
});

test('formats a missing rating as Korean copy', () => {
  assert.equal(typeof reviewModel.formatReviewRating, 'function');
  assert.equal(reviewModel.formatReviewRating(null), '평가 전');
  assert.equal(reviewModel.formatReviewRating('4.7'), '4.7');
});

test('prefers a thumbnail URL for preview media', () => {
  assert.equal(typeof reviewModel.getPreviewPhotoSource, 'function');
  assert.equal(
    reviewModel.getPreviewPhotoSource({ thumbnailUrl: '/thumbnail.jpg', url: '/original.jpg' }),
    '/thumbnail.jpg',
  );
  assert.equal(
    reviewModel.getPreviewPhotoSource({ thumbnailUrl: '  ', url: '/original.jpg' }),
    '/original.jpg',
  );
});

test('toggles helpful state and keeps the count non-negative', () => {
  assert.deepEqual(toggleHelpful({ helpfulCount: 0, isHelpfulByMe: false }), {
    helpfulCount: 1,
    isHelpfulByMe: true,
  });
  assert.deepEqual(toggleHelpful({ helpfulCount: 0, isHelpfulByMe: true }), {
    helpfulCount: 0,
    isHelpfulByMe: false,
  });
});

test('keeps only approved cafe media in the featured fixture', () => {
  assert.deepEqual(
    new Set(reviewModel.PLACE_REVIEW_ITEMS[0].photos.map((photo) => photo.url)),
    new Set(['/assets/cafe-garden.png', '/assets/figma/place-detail.jpeg']),
  );
});

test('leaves the supporting fixture without unrelated media', () => {
  assert.deepEqual(reviewModel.PLACE_REVIEW_ITEMS[1].photos, []);
});
