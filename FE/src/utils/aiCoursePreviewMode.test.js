import assert from 'node:assert/strict';
import test from 'node:test';

import { aiCoursePreviewMode, shouldResetCoursePreviewForBasketChange } from './aiCoursePreviewMode.js';

test('AI generated preview keeps route comparison and exposes edit and create actions', () => {
  assert.deepEqual(aiCoursePreviewMode(true), {
    readOnly: false,
    showEditActions: true,
    showSaveAction: true,
    backRoute: 'ai-guide',
    editLabel: '수정하기',
    confirmLabel: '이 코스로 생성하기',
  });
});

test('ordinary basket preview keeps its editing and saving actions', () => {
  assert.deepEqual(aiCoursePreviewMode(false), {
    readOnly: false,
    showEditActions: true,
    showSaveAction: true,
    backRoute: 'course-place-times',
    editLabel: '조건 수정',
    confirmLabel: null,
  });
});

test('basket updates reset ordinary previews without discarding an AI generated preview', () => {
  assert.equal(shouldResetCoursePreviewForBasketChange(false), true);
  assert.equal(shouldResetCoursePreviewForBasketChange(true), false);
});
