export function aiCoursePreviewMode(aiGenerated) {
  return aiGenerated
    ? {
      readOnly: false,
      showEditActions: true,
      showSaveAction: true,
      backRoute: 'ai-guide',
      editLabel: '수정하기',
      confirmLabel: '이 코스로 생성하기',
    }
    : {
      readOnly: false,
      showEditActions: true,
      showSaveAction: true,
      backRoute: 'course-place-times',
      editLabel: '조건 수정',
      confirmLabel: null,
    };
}

export function shouldResetCoursePreviewForBasketChange(aiGenerated) {
  return !aiGenerated;
}
