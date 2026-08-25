import assert from 'node:assert/strict';
import test from 'node:test';

const sessionModule = await import('./aiGuideSession.js').catch(() => ({}));

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test('restores AI guide messages and response context after leaving the page', () => {
  assert.equal(typeof sessionModule.saveAiGuideSession, 'function');
  assert.equal(typeof sessionModule.loadAiGuideSession, 'function');

  const storage = createStorage();
  const conversation = {
    messages: [
      { id: 'greeting', role: 'assistant', content: '안녕하세요.' },
      { id: 'user-1', role: 'user', content: '경복궁 근처 카페 추천해줘' },
      {
        id: 'response-1',
        role: 'assistant',
        content: '가까운 카페를 찾았어요.',
        recommendedPlaces: [{ id: 17, name: '테스트 카페' }],
      },
    ],
    previousResponseId: 'response-1',
  };

  sessionModule.saveAiGuideSession(conversation, storage);

  assert.deepEqual(sessionModule.loadAiGuideSession(storage), conversation);
});

test('ignores a damaged AI guide session instead of breaking the page', () => {
  assert.equal(typeof sessionModule.loadAiGuideSession, 'function');

  const storage = createStorage({ 'ddemachim.ai-guide-session': '{broken' });

  assert.deepEqual(sessionModule.loadAiGuideSession(storage), null);
});
