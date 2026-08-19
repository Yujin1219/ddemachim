import assert from 'node:assert/strict';
import test from 'node:test';
import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';

import { SceneCameraProvider, SceneCameraRedirectNotice, SceneResultRouteGuard } from './SceneCameraSession.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const target = { hidden: false, addEventListener() {}, removeEventListener() {} };

test('direct result recovery replaces to detail, shows one notice, and a later fresh detail entry has none', async () => {
  const navigations = [];
  let navigate;
  function App() {
    const [route, setRoute] = useState({ screen: 'shot-result', id: '42' });
    navigate = (screen, id, options = {}) => {
      navigations.push({ screen, id, options });
      setRoute({ screen, id });
    };
    return React.createElement(SceneCameraProvider, { screen: route.screen, routeId: route.id, windowTarget: target, documentTarget: target },
      route.screen === 'shot-result'
        ? React.createElement(SceneResultRouteGuard, { id: route.id, captured: null, go: navigate })
        : React.createElement(React.Fragment, { key: route.screen },
          route.screen === 'scene-detail' ? React.createElement(SceneCameraRedirectNotice) : null));
  }

  let renderer;
  await act(async () => { renderer = create(React.createElement(App)); });
  assert.deepEqual(navigations[0], { screen: 'scene-detail', id: '42', options: { replace: true } });
  assert.equal(renderer.root.findAllByProps({ className: 'scene-camera-notice' }).length, 1);

  act(() => navigate('map', null));
  act(() => navigate('scene-detail', '42'));
  assert.equal(renderer.root.findAllByProps({ className: 'scene-camera-notice' }).length, 0);
  act(() => renderer.unmount());
});
