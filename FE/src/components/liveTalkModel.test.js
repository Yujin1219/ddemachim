import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveTalkMessage, orderLiveTalkMessages } from './liveTalkModel.js';

test('orders chat messages from oldest to newest', () => {
  const messages = [
    { id: 'latest', minutesAgo: 1 },
    { id: 'oldest', minutesAgo: 12 },
    { id: 'middle', minutesAgo: 5 },
  ];

  assert.deepEqual(orderLiveTalkMessages(messages).map(({ id }) => id), [
    'oldest',
    'middle',
    'latest',
  ]);
  assert.deepEqual(messages.map(({ id }) => id), ['latest', 'oldest', 'middle']);
});

test('creates a local live-talk message with the selected place tag', () => {
  assert.deepEqual(createLiveTalkMessage({
    text: '지금 포장 줄은 짧아요.',
    place: '런던베이글뮤지엄 안국점',
    id: 'mine-1',
  }), {
    id: 'mine-1',
    author: '나',
    time: '방금',
    place: '런던베이글뮤지엄 안국점',
    text: '지금 포장 줄은 짧아요.',
    mine: true,
    kind: 'report',
  });
});

test('rejects an empty live-talk message', () => {
  assert.equal(createLiveTalkMessage({ text: '   ', place: '안국동' }), null);
});
