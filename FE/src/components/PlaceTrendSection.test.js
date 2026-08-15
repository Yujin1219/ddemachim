import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import PlaceTrendSection, {
  getPlaceTrendCardProps,
  getPlaceTrendSearchText,
  PlaceTrendReason,
} from './PlaceTrendSection.js';

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args.map((value) => String(value)).join(' ');
  if (!message.includes('react-test-renderer is deprecated')) originalConsoleError(...args);
};

test.after(() => {
  console.error = originalConsoleError;
  if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

function textContent(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent(node.children);
}

function nodesWithClass(renderer, className) {
  return renderer.root.findAll((node) => String(node.props.className || '').split(' ').includes(className));
}

async function render(element) {
  let renderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}

const visibleTrends = [
  {
    placeId: 152,
    name: '콘웨이커피 안국점',
    district: '종로구',
    categoryLabel: '카페',
    imageUrl: null,
    latitude: 37.574,
    longitude: 126.985,
    trend: {
      status: 'TRENDING',
      updatedAt: '2026-08-13',
    },
  },
  {
    placeId: 153,
    name: '서촌의 작은 책방',
    district: '종로구',
    categoryLabel: '서점',
    imageUrl: '/bookshop.jpg',
    latitude: 37.578,
    longitude: 126.982,
    trend: {
      status: 'WATCH',
      updatedAt: '2026-08-12',
    },
  },
];

test('maps visible trend places into the shared PlaceCard shape', () => {
  assert.deepEqual(getPlaceTrendCardProps(visibleTrends[0], '/fallback.jpg'), {
    id: 152,
    name: '콘웨이커피 안국점',
    meta: '종로구 · 카페',
    image: '/fallback.jpg',
    badge: '요즘 많이 언급돼요',
    latitude: 37.574,
    longitude: 126.985,
  });
  assert.equal(getPlaceTrendCardProps(visibleTrends[1], '/fallback.jpg').image, '/bookshop.jpg');
});

test('delegates the trend section to the shared Explore section and card renderers', async () => {
  let sectionProps;
  let cardProps;
  const renderer = await render(createElement(PlaceTrendSection, {
    trends: visibleTrends,
    onViewAll: () => {},
    renderCards: (props) => {
      cardProps = props;
      return createElement('div', { className: 'shared-horizontal-cards' }, props.places.map((place) => createElement('span', { key: place.placeId }, place.name)));
    },
    renderSection: (props) => {
      sectionProps = props;
      return createElement('section', { className: 'shared-screen-section' }, props.children);
    },
  }));

  assert.equal(nodesWithClass(renderer, 'shared-screen-section').length, 1);
  assert.equal(nodesWithClass(renderer, 'shared-horizontal-cards').length, 1);
  assert.equal(sectionProps.title, '요즘 이곳에서는');
  assert.equal(sectionProps.subtitle, '상태가 확인된 장소를 모아봤어요.');
  assert.equal(sectionProps.action, '전체보기');
  assert.equal(cardProps.places.length, 2);
  assert.equal(textContent(renderer.toJSON()).includes('요약'), false);
  assert.equal(textContent(renderer.toJSON()).includes('주제'), false);
});

test('builds safe Explore search text when trend evidence is missing or malformed', () => {
  assert.equal(
    getPlaceTrendSearchText({ name: '트렌드 없는 장소', district: '종로구', trend: null }),
    '트렌드 없는 장소 종로구',
  );
  assert.equal(
    getPlaceTrendSearchText({
      name: '크림커피점',
      district: '종로구',
      categoryLabel: '카페',
      trend: { status: 'WATCH', updatedAt: '2026-08-13' },
    }),
    '크림커피점 카페 종로구 관심이 이어져요',
  );
});

test('hides absent and insufficient-evidence trends from both surfaces', async () => {
  const hiddenTrend = {
    placeId: 154,
    name: '아직 근거가 부족한 장소',
    district: '종로구',
    categoryLabel: '카페',
    trend: { status: 'INSUFFICIENT_EVIDENCE', updatedAt: '2026-08-13' },
  };
  let cardProps;
  const listRenderer = await render(createElement(PlaceTrendSection, {
    trends: [hiddenTrend, { placeId: 155, name: '트렌드 없음', trend: null }],
    renderCards: (props) => {
      cardProps = props;
      return createElement('div', null);
    },
    renderSection: (props) => createElement('section', null, props.children),
  }));
  const reasonRenderer = await render(createElement(PlaceTrendReason, { trend: hiddenTrend.trend }));

  assert.equal(cardProps.places.length, 0);
  assert.equal(listRenderer.toJSON().type, 'section');
  assert.equal(reasonRenderer.toJSON(), null);
});

test('calls the place selection handler with the clicked visible trend', async () => {
  let selectedPlace = null;
  let cardProps;
  await render(createElement(PlaceTrendSection, {
    trends: visibleTrends,
    onPlaceSelect: (place) => { selectedPlace = place; },
    renderCards: (props) => {
      cardProps = props;
      return createElement('div', null);
    },
    renderSection: (props) => createElement('section', null, props.children),
  }));

  cardProps.onPlaceSelect(visibleTrends[1]);

  assert.equal(selectedPlace.placeId, 153);
  assert.equal(selectedPlace.name, '서촌의 작은 책방');
});

test('renders loading and recoverable empty/error states without inventing trend data', async () => {
  const slots = [];
  const renderWithSlot = (props) => render(createElement(PlaceTrendSection, {
    ...props,
    renderCards: (cardProps) => {
      slots.push(cardProps);
      return createElement('div', null);
    },
    renderSection: (sectionProps) => createElement('section', null, sectionProps.children),
  }));
  await renderWithSlot({ isLoading: true });
  await renderWithSlot({ trends: [] });
  let retryCount = 0;
  await renderWithSlot({ error: true, onRetry: () => { retryCount += 1; } });

  assert.equal(slots[0].isLoading, true);
  assert.equal(slots[0].places.length, 0);
  assert.equal(slots[1].places.length, 0);
  assert.equal(slots[2].error, true);
  slots[2].onRetry();
  assert.equal(retryCount, 1);
});

test('renders only the detail trend status and observed date', async () => {
  const renderer = await render(createElement(PlaceTrendReason, { trend: visibleTrends[0].trend }));
  const copy = textContent(renderer.toJSON());

  assert.equal(copy.includes('트렌드 상태'), true);
  assert.equal(copy.includes('요즘 많이 언급돼요'), true);
  assert.equal(copy.includes('요즘 주목받는 이유'), false);
  assert.equal(copy.includes('공개된 블로그 글'), false);
  assert.equal(copy.includes('주제'), false);
  assert.equal(copy.includes('관찰일 2026.08.13'), true);
});
