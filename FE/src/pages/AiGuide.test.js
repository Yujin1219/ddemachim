import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as aiGuidePresentation from '../utils/aiGuidePresentation.js';

test('AI 가이드의 새 답변은 긴 추천 결과의 끝이 아닌 답변 시작을 보여준다', () => {
  assert.equal(typeof aiGuidePresentation.scrollAiGuideToLatest, 'function');

  const scrollContainer = {
    clientHeight: 500,
    scrollHeight: 840,
    scrollTop: 0,
    scrollTo(options) {
      this.lastScrollOptions = options;
    },
  };
  const latestMessage = {
    offsetHeight: 140,
    scrollIntoView(options) {
      this.lastScrollOptions = options;
    },
  };
  const bottomSpacer = { style: { height: '0px' } };

  aiGuidePresentation.scrollAiGuideToLatest(scrollContainer, latestMessage, bottomSpacer);

  assert.equal(bottomSpacer.style.height, '360px');
  assert.deepEqual(latestMessage.lastScrollOptions, { block: 'start', behavior: 'smooth' });
  assert.equal(scrollContainer.lastScrollOptions, undefined);
  assert.equal(scrollContainer.scrollTop, 0);
});

test('AI 가이드 답변의 Markdown 서식은 기호 대신 안전한 화면 요소로 렌더링한다', () => {
  assert.equal(typeof aiGuidePresentation.renderAiGuideMarkdown, 'function');

  const markup = renderToStaticMarkup(createElement(
    'div',
    null,
    aiGuidePresentation.renderAiGuideMarkdown('**추천** 장소입니다.\n- 조용한 카페\n- 전시 관람', 'answer'),
  ));

  assert.match(markup, /<strong>추천<\/strong>/);
  assert.match(markup, /<ul/);
  assert.match(markup, /<li>조용한 카페<\/li>/);
  assert.equal(markup.includes('**추천**'), false);
});

test('AI 추천 장소 링크는 해당 목록 항목 바로 아래에 렌더링한다', () => {
  const markup = renderToStaticMarkup(createElement(
    'div',
    null,
    aiGuidePresentation.renderAiGuideMarkdown('- 금문 — 종로구 맛집', 'answer', {
      renderListItemFooter: (item) => item.includes('금문')
        ? createElement('a', { href: '#place-1' }, '금문 상세 보기')
        : null,
    }),
  ));

  assert.match(markup, /<li>금문 — 종로구 맛집<a href="#place-1">금문 상세 보기<\/a><\/li>/);
});

test('구조화된 AI 추천 장소는 답변 목록에서 제거하고 실제 도보 정보를 카드 모델로 옮긴다', () => {
  assert.equal(typeof aiGuidePresentation.buildAiGuidePlacePresentation, 'function');

  const presentation = aiGuidePresentation.buildAiGuidePlacePresentation(
    [
      '경복궁 주변에서 가까운 장소를 찾았어요.',
      '',
      '- **씨애틀즈베스트커피** — 도보 약 6분, 305m',
      '- **스타벅스 이마빌딩점** — 도보 약 8분, 620m',
      '',
      '영업 여부는 방문 전에 확인해 주세요.',
    ].join('\n'),
    [
      { id: 11, name: '씨애틀즈베스트커피', categoryLabel: '카페' },
      { id: 12, name: '스타벅스 이마빌딩점', categoryLabel: '카페' },
    ],
  );

  assert.equal(
    presentation.messageContent,
    '경복궁 주변에서 가까운 장소를 찾았어요.\n\n영업 여부는 방문 전에 확인해 주세요.',
  );
  assert.deepEqual(presentation.recommendations.map((item) => ({
    id: item.place.id,
    walkingMinutes: item.walkingMinutes,
    distanceMeters: item.distanceMeters,
  })), [
    { id: 11, walkingMinutes: 6, distanceMeters: 305 },
    { id: 12, walkingMinutes: 8, distanceMeters: 620 },
  ]);
});

test('추천 이유는 실제 최단 거리와 도보 시간이 확인된 장소에만 만든다', () => {
  const presentation = aiGuidePresentation.buildAiGuidePlacePresentation(
    [
      '가까운 곳부터 추천해드릴게요.',
      '- **첫 번째 카페** — 도보 약 9분, 640m',
      '- **두 번째 카페** — 도보 약 4분, 240m',
      '- **정보 없는 카페**',
    ].join('\n'),
    [
      { id: 1, name: '첫 번째 카페' },
      { id: 2, name: '두 번째 카페' },
      { id: 3, name: '정보 없는 카페' },
    ],
  );

  assert.deepEqual(presentation.recommendations.map((item) => item.reason), [
    '도보로 이동할 수 있는 곳이에요',
    '가장 가까운 추천 장소예요',
    null,
  ]);
});

test('번호가 붙은 추천 장소 목록도 말풍선에서 제거한다', () => {
  const presentation = aiGuidePresentation.buildAiGuidePlacePresentation(
    '가까운 카페예요.\n\n1. **카페 하나** — 도보 약 3분, 200m',
    [{ id: 1, name: '카페 하나' }],
  );

  assert.equal(presentation.messageContent, '가까운 카페예요.');
  assert.equal(presentation.recommendations[0].walkingMinutes, 3);
  assert.equal(presentation.recommendations[0].distanceMeters, 200);
});

test('이름이 겹치는 장소는 가장 긴 정확한 장소명에 도보 정보를 연결한다', () => {
  const presentation = aiGuidePresentation.buildAiGuidePlacePresentation(
    [
      '추천 결과예요.',
      '- **스타벅스 이마빌딩점** — 도보 약 3분, 200m',
      '- **스타벅스** — 도보 약 5분, 400m',
    ].join('\n'),
    [
      { id: 1, name: '스타벅스' },
      { id: 2, name: '스타벅스 이마빌딩점' },
    ],
  );

  assert.deepEqual(presentation.recommendations.map((item) => ({
    id: item.place.id,
    walkingMinutes: item.walkingMinutes,
    distanceMeters: item.distanceMeters,
  })), [
    { id: 1, walkingMinutes: 5, distanceMeters: 400 },
    { id: 2, walkingMinutes: 3, distanceMeters: 200 },
  ]);
});
