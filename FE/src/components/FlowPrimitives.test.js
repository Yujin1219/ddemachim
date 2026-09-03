import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

async function loadPrimitives() {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    server: { hmr: false, middlewareMode: true },
  });
  try {
    return await server.ssrLoadModule('/src/components/FlowPrimitives.jsx');
  } finally {
    await server.close();
  }
}

test('flow primitives preserve button tone and header accessibility labels', async () => {
  const { ActionButton, BackHeader } = await loadPrimitives();
  const markup = renderToStaticMarkup(createElement(
    'div',
    null,
    createElement(ActionButton, { tone: 'secondary' }, '저장'),
    createElement(BackHeader, { title: '계정 정보', onBack() {} }),
  ));

  assert.match(markup, /class="ui-button secondary "/);
  assert.match(markup, /aria-label="이전"/);
  assert.match(markup, /<h1>계정 정보<\/h1>/);
});

test('flow primitives render section metadata and status copy without changing markup roles', async () => {
  const { ScreenSection, StatusBanner } = await loadPrimitives();
  const markup = renderToStaticMarkup(createElement(
    ScreenSection,
    { title: '설정', subtitle: '선택 사항', action: '전체보기' },
    createElement(StatusBanner, { title: '저장됐어요', copy: '변경사항을 적용했습니다.' }),
  ));

  assert.match(markup, /class="content-section"/);
  assert.match(markup, /<h2>설정<\/h2>/);
  assert.match(markup, /class="status-banner blue"/);
  assert.match(markup, /변경사항을 적용했습니다/);
});
