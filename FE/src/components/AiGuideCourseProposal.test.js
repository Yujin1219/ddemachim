import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import AiGuideCourseProposal from './AiGuideCourseProposal.js';

test('course proposal asks for confirmation and invokes generation action', () => {
  let confirmed = false;
  let renderer;
  act(() => {
    renderer = create(createElement(AiGuideCourseProposal, {
      proposal: { candidatePlaceIds: [1, 2, 3] },
      busy: false,
      onConfirm: () => { confirmed = true; },
    }));
  });
  const button = renderer.root.findByProps({ className: 'ai-guide-course-confirm' });
  assert.match(button.children.join(''), /코스 생성/);
  button.props.onClick();
  assert.equal(confirmed, true);
});
