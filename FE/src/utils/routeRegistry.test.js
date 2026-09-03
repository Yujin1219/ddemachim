import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detailReturnRouteFor,
  rememberDetailReturnRoute,
  rootRoutes,
  routes,
} from './routeRegistry.js';

function memoryStorage(initial = {}) {
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

test('route registry keeps every root tab and detail destination available', () => {
  assert.deepEqual(rootRoutes, {
    map: 'map',
    explore: 'explore',
    assistant: 'ai-guide',
    course: 'course-home',
    my: 'my',
  });
  assert.equal(routes.has('place'), true);
  assert.equal(routes.has('event-detail'), true);
  assert.equal(routes.has('filming-work'), true);
});

test('detail return routes preserve the exact screen and identifier in session storage', () => {
  const storage = memoryStorage();

  rememberDetailReturnRoute('#/place/42', '#/active-course/9', storage);

  assert.deepEqual(detailReturnRouteFor('#/place/42', storage), {
    screen: 'active-course',
    id: '9',
  });
});

test('detail return routes reject malformed or unknown destinations', () => {
  const storage = memoryStorage({
    'ddemachim.detail-return-routes': JSON.stringify({ '#/place/42': '#/unknown/9' }),
  });

  assert.equal(detailReturnRouteFor('#/place/42', storage), null);
  assert.doesNotThrow(() => rememberDetailReturnRoute('place/42', '#/map', storage));
});
