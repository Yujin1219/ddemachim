import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

async function loadPrompts() {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    server: { hmr: false, middlewareMode: true },
  });
  try {
    return await server.ssrLoadModule('/src/components/MapPrompts.jsx');
  } finally {
    await server.close();
  }
}

test('map permission prompt keeps its action destination and explanatory copy', async () => {
  const { MapPermissionPrompt } = await loadPrompts();
  let destination = null;
  const markup = renderToStaticMarkup(createElement(MapPermissionPrompt, {
    action: '위치 권한 허용',
    copy: '현재 위치가 필요해요.',
    detail: ['앱 사용 중에만 위치 사용', '설정에서 변경할 수 있어요.'],
    go(next) { destination = next; },
    next: 'map',
    title: '위치 권한이 필요해요',
  }));

  assert.match(markup, /위치 권한이 필요해요/);
  assert.match(markup, /앱 사용 중에만 위치 사용/);
  assert.match(markup, /위치 권한 허용/);
  assert.equal(destination, null);
});

test('map loading prompt exposes a loading message and safe exit', async () => {
  const { MapLoadingPrompt } = await loadPrompts();
  const markup = renderToStaticMarkup(createElement(MapLoadingPrompt, { go() {} }));

  assert.match(markup, /장소 정보를 불러오고 있어요/);
  assert.match(markup, /나중에 다시 보기/);
});
