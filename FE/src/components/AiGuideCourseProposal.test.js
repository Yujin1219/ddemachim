import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import AiGuideCourseProposal from './AiGuideCourseProposal.js';

const proposal = {
  requiredPlaceIds: [1],
  candidatePlaceIds: [2, 3],
};

const places = [
  { id: 1, name: '경복궁', categoryLabel: '관광명소' },
  { id: 2, name: '카페 어니언', categoryLabel: '카페' },
  { id: 3, name: '서울공예박물관', categoryLabel: '박물관' },
];

function renderProposal(props = {}) {
  let renderer;
  act(() => {
    renderer = create(createElement(AiGuideCourseProposal, {
      proposal,
      places,
      selectedCandidatePlaceIds: [2],
      busy: false,
      onConfirm: () => {},
      onSelectionChange: () => {},
      ...props,
    }));
  });
  return renderer;
}

test('shows course conditions without rendering a second place selection list', () => {
  const renderer = renderProposal();

  assert.equal(renderer.root.findAllByType('input').length, 0);
  assert.equal(renderer.root.findAllByProps({ className: 'ai-guide-course-place-list' }).length, 0);
});

test('shows the total selected count and invokes course generation', () => {
  let confirmed = false;
  const renderer = renderProposal({ onConfirm: () => { confirmed = true; } });
  const button = renderer.root.findByProps({ className: 'ai-guide-course-confirm' });

  assert.match(button.children.flat(Infinity).join(''), /선택한 2곳으로 코스 만들기/);
  button.props.onClick();
  assert.equal(confirmed, true);
});

test('disables generation when no proposal places are selected', () => {
  const renderer = renderProposal({
    proposal: { requiredPlaceIds: [], candidatePlaceIds: [2, 3] },
    selectedCandidatePlaceIds: [],
  });
  const button = renderer.root.findByProps({ className: 'ai-guide-course-confirm' });

  assert.equal(button.props.disabled, true);
  assert.match(button.children.flat(Infinity).join(''), /선택한 0곳으로 코스 만들기/);
});
