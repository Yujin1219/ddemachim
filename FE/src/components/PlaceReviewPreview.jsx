import { useState } from 'react';
import { BadgeCheck, ChevronRight, PencilLine, Star, ThumbsUp } from 'lucide-react';
import {
  buildReviewSummaryView,
  formatReviewRating,
  getPreviewPhotoSource,
  getPreviewPhotos,
  getReviewPreviewEmptyMessage,
  normalizePreviewReviews,
  normalizeRating,
  toggleHelpful,
} from './placeReviewPreviewModel.js';

function RatingValue({ rating, label }) {
  const normalizedRating = normalizeRating(rating);
  const accessibleLabel = label ?? (normalizedRating === null ? '별점 평가 전' : `별점 ${formatReviewRating(normalizedRating)}점`);

  return (
    <span className={`place-review-rating${normalizedRating === null ? ' is-missing' : ''}`} role="img" aria-label={accessibleLabel}>
      <Star aria-hidden="true" size={14} strokeWidth={2.1} />
      <strong>{formatReviewRating(normalizedRating)}</strong>
    </span>
  );
}

function getReviewDateParts(value) {
  const rawValue = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!rawValue) return { label: '날짜 정보 없음', dateTime: undefined };

  const matchedDate = rawValue.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (matchedDate) {
    const [, year, month, day] = matchedDate;
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    return { label: `${year}.${paddedMonth}.${paddedDay}`, dateTime: `${year}-${paddedMonth}-${paddedDay}` };
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) return { label: rawValue, dateTime: undefined };

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const day = String(parsedDate.getDate()).padStart(2, '0');
  return { label: `${year}.${month}.${day}`, dateTime: `${year}-${month}-${day}` };
}

function ReviewDate({ value }) {
  const { label, dateTime } = getReviewDateParts(value);
  return <time dateTime={dateTime}>{label}</time>;
}

function ReviewPhoto({ photo, review, index, onViewAll, thumbnail = false }) {
  const [hasError, setHasError] = useState(false);
  const alt = typeof photo.alt === 'string' && photo.alt.trim()
    ? photo.alt
    : `${review.authorNickname}님의 방문 사진 ${index + 1}`;
  const source = getPreviewPhotoSource(photo);
  const media = hasError ? (
    <span className="place-review-photo-fallback" role="img" aria-label={`${alt} 이미지를 불러오지 못했어요`}>사진을 불러오지 못했어요</span>
  ) : (
    <img
      alt={alt}
      decoding="async"
      loading="lazy"
      onError={() => setHasError(true)}
      src={source}
    />
  );
  const className = `place-review-photo${thumbnail ? ' is-thumbnail' : ''}`;

  if (typeof onViewAll === 'function') {
    return (
      <button
        aria-label={`${alt} · 후기 전체보기`}
        className={`${className} place-review-photo-button`}
        onClick={onViewAll}
        type="button"
      >
        {media}
      </button>
    );
  }

  return <span className={className}>{media}</span>;
}

function ReviewHeader({ review }) {
  return (
    <header className="place-review-author">
      <div className="place-review-author-copy">
        <div className="place-review-author-line">
          <strong>{review.authorNickname}</strong>
          {review.visitVerified && (
            <span className="place-review-verified">
              <BadgeCheck aria-hidden="true" size={14} strokeWidth={2} />
              방문 인증
            </span>
          )}
        </div>
        <div className="place-review-meta">
          <RatingValue
            label={review.rating === null ? '후기 별점 평가 전' : `후기 별점 ${formatReviewRating(review.rating)}점`}
            rating={review.rating}
          />
          <ReviewDate value={review.createdAt} />
        </div>
      </div>
    </header>
  );
}

function HelpfulButton({ review, helpful, onToggle }) {
  return (
    <button
      aria-label={`${helpful.isHelpfulByMe ? '도움돼요 취소' : '도움돼요'} 현재 ${helpful.helpfulCount}명`}
      aria-pressed={helpful.isHelpfulByMe}
      onClick={() => onToggle(review)}
      type="button"
    >
      <ThumbsUp aria-hidden="true" fill={helpful.isHelpfulByMe ? 'currentColor' : 'none'} size={16} strokeWidth={2} />
      <span>도움돼요</span>
      <strong>{helpful.helpfulCount}</strong>
    </button>
  );
}

function ReviewHelpful({ review, helpful, onToggle }) {
  return (
    <footer className="place-review-footer">
      <HelpfulButton helpful={helpful} onToggle={onToggle} review={review} />
    </footer>
  );
}

function FeaturedReview({ review, helpful, onHelpfulToggle, onViewAll }) {
  const photos = getPreviewPhotos(review.photos, 3);

  return (
    <article className="place-review-item is-featured">
      <ReviewHeader review={review} />
      <p className="place-review-text">{review.text || '후기 내용이 없어요.'}</p>
      {photos.length > 0 && (
        <div className="place-review-photos" data-count={photos.length}>
          {photos.map((photo, index) => (
            <ReviewPhoto
              index={index}
              key={photo.id ?? getPreviewPhotoSource(photo) ?? index}
              onViewAll={onViewAll}
              photo={photo}
              review={review}
            />
          ))}
        </div>
      )}
      <ReviewHelpful helpful={helpful} onToggle={onHelpfulToggle} review={review} />
    </article>
  );
}

function SupportingReview({ review, helpful, onHelpfulToggle, onViewAll }) {
  const photo = getPreviewPhotos(review.photos, 1)[0];

  return (
    <article className="place-review-item is-supporting">
      <div className="place-review-support-copy">
        <ReviewHeader review={review} />
        <p className="place-review-text">{review.text || '후기 내용이 없어요.'}</p>
        <ReviewHelpful helpful={helpful} onToggle={onHelpfulToggle} review={review} />
      </div>
      {photo && <ReviewPhoto index={0} onViewAll={onViewAll} photo={photo} review={review} thumbnail />}
    </article>
  );
}

export default function PlaceReviewPreview({ summary, reviews, onViewAll, onWriteReview }) {
  const normalizedReviews = normalizePreviewReviews(reviews);
  const normalizedSummary = buildReviewSummaryView(summary, normalizedReviews, typeof onWriteReview === 'function');
  const [helpfulByReviewId, setHelpfulByReviewId] = useState({});
  const [helpfulMessage, setHelpfulMessage] = useState('');
  const canViewAll = typeof onViewAll === 'function';

  const handleHelpfulToggle = (review) => {
    const currentHelpful = helpfulByReviewId[review.uiKey] ?? review;
    const nextHelpful = toggleHelpful(currentHelpful);
    setHelpfulByReviewId((current) => ({
      ...current,
      [review.uiKey]: toggleHelpful(current[review.uiKey] ?? review),
    }));
    setHelpfulMessage(nextHelpful.isHelpfulByMe ? '도움돼요로 표시했어요' : '도움돼요를 취소했어요');
  };

  return (
    <section className="place-review-preview" aria-label="방문자 후기 미리보기">
      <div className="place-review-surface">
        <div className="place-review-summary">
          <div className="place-review-summary-main">
            <RatingValue
              label={normalizedSummary.averageRating === null ? '평균 별점 평가 전' : `평균 별점 ${formatReviewRating(normalizedSummary.averageRating)}점`}
              rating={normalizedSummary.averageRating}
            />
            <span>{normalizedSummary.reviewCountLabel}</span>
          </div>
          {normalizedSummary.canWriteReview && (
            <button className="place-review-write" onClick={onWriteReview} type="button">
              <PencilLine aria-hidden="true" size={15} strokeWidth={2} />
              후기 작성
            </button>
          )}
        </div>

        <div className="place-review-list">
          {normalizedReviews.length === 0 ? (
            <p className="place-review-empty">{getReviewPreviewEmptyMessage(normalizedSummary.reviewCount)}</p>
          ) : (
            <>
              <FeaturedReview
                helpful={helpfulByReviewId[normalizedReviews[0].uiKey] ?? normalizedReviews[0]}
                onHelpfulToggle={handleHelpfulToggle}
                onViewAll={canViewAll ? onViewAll : undefined}
                review={normalizedReviews[0]}
              />
              {normalizedReviews[1] && (
                <SupportingReview
                  helpful={helpfulByReviewId[normalizedReviews[1].uiKey] ?? normalizedReviews[1]}
                  onHelpfulToggle={handleHelpfulToggle}
                  onViewAll={canViewAll ? onViewAll : undefined}
                  review={normalizedReviews[1]}
                />
              )}
            </>
          )}
        </div>

        {canViewAll && (
          <button className="place-review-view-all" onClick={onViewAll} type="button">
            후기 전체보기
            <ChevronRight aria-hidden="true" size={17} strokeWidth={2} />
          </button>
        )}
      </div>
      <p aria-atomic="true" aria-live="polite" className="place-review-feedback">{helpfulMessage}</p>
    </section>
  );
}
