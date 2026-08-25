import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';

import { AutoFocusHeading, BeforeAfterComparison, BlockingAlert, OverlayControls, SceneDetailHeading, SceneReferenceGate } from './ui.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function findAll(node, type, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (node.type === type) result.push(node);
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  children.forEach((child) => findAll(child, type, result));
  return result;
}

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  return children.map(textContent).join('');
}

test('comparison exposes a native 0..100 range with an exact accessible before/after value', () => {
  const tree = BeforeAfterComparison({ referenceUrl: '/ref.png', captureUrl: 'blob:capture', value: 50, onChange() {} });
  const [range] = findAll(tree, 'input');
  assert.equal(range.props.type, 'range');
  assert.equal(range.props.min, 0);
  assert.equal(range.props.max, 100);
  assert.equal(range.props.step, 1);
  assert.equal(range.props['aria-valuetext'], '참고 장면 50%, 촬영 결과 50%');
});

test('comparison divider changes the existing comparison state from direct pointer dragging', () => {
  const changes = [];
  const tree = BeforeAfterComparison({ referenceUrl: '/ref.png', captureUrl: 'blob:capture', value: 50, onChange: (value) => changes.push(value) });
  const handle = findAll(tree, 'span').find((node) => node.props.className === 'scene-comparison-handle');
  const stage = { getBoundingClientRect: () => ({ left: 100, width: 200 }) };
  const target = {
    setPointerCapture() {},
    hasPointerCapture: () => true,
    releasePointerCapture() {},
    closest: () => stage,
  };
  handle.props.onPointerDown({ currentTarget: target, pointerId: 1, clientX: 150 });
  handle.props.onPointerMove({ currentTarget: target, pointerId: 1, clientX: 250 });
  assert.deepEqual(changes, [25, 75]);
});

test('overlay controls provide display modes, opacity, visibility, and reset actions', () => {
  const tree = OverlayControls({ overlay: { x: 0, y: 0, scale: 1, opacity: 0.5, visible: true, mode: 'image' }, onPatch() {}, onReset() {} });
  const labels = findAll(tree, 'button').map((button) => button.props['aria-label']).filter(Boolean);
  assert.deepEqual(labels.toSorted(), ['장면 숨기기', '참고 장면 위치와 크기 초기화'].toSorted());
  const ranges = findAll(tree, 'input');
  assert.deepEqual(ranges.map((input) => input.props['aria-label']), ['참고 장면 불투명도']);
  assert.deepEqual(ranges.map((input) => input.props['aria-valuetext']), ['50%']);
  const tabs = findAll(tree, 'button').filter((button) => button.props.role === 'tab');
  assert.deepEqual(tabs.map(textContent), ['전체 장면', '실루엣']);
  const visibility = findAll(tree, 'button').find((button) => button.props['aria-label'] === '장면 숨기기');
  assert.equal(visibility.props['aria-pressed'], true);
});

test('overlay controls send mode, opacity, visibility, and reset changes through their public callbacks', () => {
  const patches = [];
  let resetCalls = 0;
  const tree = OverlayControls({
    overlay: { x: 0.2, y: -0.1, scale: 1, opacity: 0.5, visible: true, mode: 'image' },
    onPatch: (patch) => patches.push(patch),
    onReset: () => { resetCalls += 1; },
  });
  const buttons = findAll(tree, 'button');
  buttons.find((button) => textContent(button) === '실루엣').props.onClick();
  const ranges = findAll(tree, 'input');
  ranges[0].props.onChange({ target: { value: '0.65' } });
  buttons.find((button) => button.props['aria-label'] === '장면 숨기기').props.onClick();
  buttons.find((button) => button.props['aria-label'] === '참고 장면 위치와 크기 초기화').props.onClick();
  assert.deepEqual(patches, [{ mode: 'outline' }, { opacity: 0.65 }, { visible: false }]);
  assert.equal(resetCalls, 1);
});

test('reference gate disables camera entry until validated and gives a retry recovery on failure', () => {
  const checking = SceneReferenceGate({ status: 'checking', onStart() {}, onRetry() {} });
  assert.equal(findAll(checking, 'button')[0].props.disabled, true);
  const missing = SceneReferenceGate({ status: 'missing', onStart() {}, onRetry() {} });
  assert.equal(missing.props.role, 'alert');
  assert.equal(missing.props['aria-live'], 'assertive');
  assert.match(textContent(missing), /참고 장면/);
  assert.equal(textContent(findAll(missing, 'button')[0]), '다시 확인');
});

test('new screen headings and blocking alerts move focus to an announced heading', () => {
  let focusCalls = 0;
  let renderer;
  act(() => {
    renderer = create(React.createElement(AutoFocusHeading, null, '새 화면'), {
      createNodeMock(element) { return element.type === 'h1' ? { focus() { focusCalls += 1; } } : null; },
    });
  });
  assert.equal(focusCalls, 1);
  assert.equal(renderer.toJSON().props.tabIndex, -1);
  act(() => renderer.update(React.createElement(BlockingAlert, { title: '진행할 수 없어요', message: '다시 시도해주세요.' })));
  const alert = renderer.toJSON();
  assert.equal(alert.props.role, 'alert');
  assert.equal(alert.props['aria-live'], 'assertive');
  assert.equal(alert.children[0].type, 'h2');
  act(() => renderer.unmount());
});

test('ready reference gate forwards a ref to the camera entry CTA', () => {
  const buttonRef = React.createRef();
  const ready = SceneReferenceGate({ status: 'ready', onStart() {}, onRetry() {}, buttonRef });
  assert.equal(ready.props.ref, buttonRef);
});

test('scene-detail heading receives focus on ordinary entry and redirect recovery mounts', () => {
  let focusCalls = 0;
  const route = (screen) => React.createElement(React.Fragment, { key: screen }, screen === 'scene-detail' ? React.createElement(SceneDetailHeading, null, '참고 장면과 현장 구도 맞추기') : null);
  let renderer;
  act(() => {
    renderer = create(route('scene-detail'), { createNodeMock(element) { return element.type === 'h1' ? { focus() { focusCalls += 1; } } : null; } });
  });
  assert.equal(focusCalls, 1);
  assert.equal(renderer.toJSON().props.tabIndex, -1);
  act(() => renderer.update(route('map')));
  act(() => renderer.update(route('scene-detail')));
  assert.equal(focusCalls, 2);
  act(() => renderer.unmount());
});
