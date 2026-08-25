import { createElement, useId, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Footprints, MapPinned } from 'lucide-react';

function distanceLabel(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) return null;
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)}m`;
  const kilometers = distanceMeters / 1000;
  return `${kilometers.toFixed(Number.isInteger(kilometers) ? 0 : 1)}km`;
}

function PlaceImage({ place }) {
  const [failed, setFailed] = useState(false);

  if (!place.imageUrl || failed) {
    return createElement('span', { 'aria-hidden': true, className: 'ai-guide-place-image-placeholder' },
      createElement(MapPinned, { size: 21, strokeWidth: 1.8 }));
  }

  return createElement('img', {
    alt: `${place.name} 사진`,
    decoding: 'async',
    loading: 'lazy',
    onError: () => setFailed(true),
    src: place.imageUrl,
  });
}

function recommendationCard(recommendation, onPlaceClick) {
  const { place, walkingMinutes, distanceMeters, reason } = recommendation;
  const distance = distanceLabel(distanceMeters);
  const hasWalkingMeta = walkingMinutes !== null || distance !== null;
  return createElement('button', {
    'aria-label': `${place.name} 상세 보기`,
    className: 'ai-guide-place-card',
    key: place.id,
    onClick: () => onPlaceClick?.(place),
    type: 'button',
  },
  createElement(PlaceImage, { key: place.imageUrl || 'placeholder', place }),
  createElement('span', { className: 'ai-guide-place-card-copy' },
    createElement('strong', null, place.name),
    createElement('span', { className: 'ai-guide-place-category' }, place.categoryLabel || '장소'),
    hasWalkingMeta && createElement('span', { className: 'ai-guide-place-walk' },
      createElement(Footprints, { 'aria-hidden': true, size: 14, strokeWidth: 2.1 }),
      walkingMinutes !== null && createElement('b', null, `${walkingMinutes}분`),
      walkingMinutes !== null && distance !== null && createElement('span', { 'aria-hidden': true }, '·'),
      distance !== null && createElement('span', null, distance)),
    reason && createElement('small', null, reason)),
  createElement(ChevronRight, { 'aria-hidden': true, className: 'ai-guide-place-chevron', size: 18, strokeWidth: 2 }));
}

export default function AiGuidePlaceRecommendations({ recommendations = [], onMapClick, onPlaceClick }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const visibleRecommendations = expanded ? recommendations : recommendations.slice(0, 3);
  const hiddenCount = Math.max(0, recommendations.length - 3);
  if (recommendations.length === 0) return null;
  return createElement('section', { 'aria-label': 'AI 추천 장소', className: 'ai-guide-recommendations' },
    createElement('header', { className: 'ai-guide-place-header' },
      createElement('div', null,
        createElement('h2', null, '근처 추천'),
        createElement('span', null, `· ${recommendations.length}곳`)),
      createElement('button', { className: 'ai-guide-place-map-link', onClick: onMapClick, type: 'button' },
        createElement(MapPinned, { 'aria-hidden': true, size: 14, strokeWidth: 2 }),
        '지도보기')),
    createElement('div', { className: 'ai-guide-place-cards', id: listId },
      visibleRecommendations.map((recommendation) => recommendationCard(recommendation, onPlaceClick))),
    hiddenCount > 0 && createElement('button', {
      'aria-controls': listId,
      'aria-expanded': expanded,
      className: 'ai-guide-place-toggle',
      onClick: () => setExpanded((current) => !current),
      type: 'button',
    }, expanded
      ? createElement('span', null, '접기', createElement(ChevronUp, { 'aria-hidden': true, size: 15 }))
      : createElement('span', null, `${hiddenCount}곳 더 보기`, createElement(ChevronDown, { 'aria-hidden': true, size: 15 }))));
}
