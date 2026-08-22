import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as aiGuidePresentation from '../utils/aiGuidePresentation.js';

test('AI 가이드의 새 답변은 채팅 영역 맨 아래로 스크롤한다', () => {
  assert.equal(typeof aiGuidePresentation.scrollAiGuideToLatest, 'function');

  const scrollContainer = {
    scrollHeight: 840,
    scrollTop: 0,
    scrollTo(options) {
      this.lastScrollOptions = options;
    },
  };

  aiGuidePresentation.scrollAiGuideToLatest(scrollContainer);

  assert.deepEqual(scrollContainer.lastScrollOptions, { top: 840, behavior: 'smooth' });
  assert.equal(scrollContainer.scrollTop, 840);
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
