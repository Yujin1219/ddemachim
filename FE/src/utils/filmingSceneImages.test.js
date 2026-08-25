import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFilmingSceneImage } from './filmingSceneImages.js';

const demoImages = ['/scene-a.jpg', '/scene-b.jpg', '/scene-c.jpg'];

test('keeps an existing filming image instead of replacing it with a demo image', () => {
  assert.equal(resolveFilmingSceneImage({
    workId: 274,
    filmingLocationId: 59,
    existingImageUrl: '/real-scene.jpg',
  }, demoImages), '/real-scene.jpg');
});

test('assigns the same stable demo image to a filming location across every entry route', () => {
  assert.equal(resolveFilmingSceneImage({
    workId: 274,
    filmingLocationId: 59,
  }, demoImages), '/scene-c.jpg');

  assert.equal(resolveFilmingSceneImage({
    workId: 999,
    filmingLocationId: 59,
  }, demoImages), '/scene-c.jpg');

  assert.equal(resolveFilmingSceneImage({
    workId: 274,
    filmingLocationId: 60,
  }, demoImages), '/scene-a.jpg');
});

test('returns null when there is no existing image or demo pool', () => {
  assert.equal(resolveFilmingSceneImage({ workId: 274, filmingLocationId: 59 }, []), null);
});

test('builds scene detail copy from the matched work, place, and scene data', async () => {
  const module = await import('./filmingSceneImages.js');
  assert.equal(typeof module.buildFilmingSceneDetailPresentation, 'function', 'scene detail presentation builder must exist');

  assert.deepEqual(module.buildFilmingSceneDetailPresentation({
    id: 834,
    placeName: '경희궁3길',
    contentType: 'DRAMA',
    mediaContent: {
      id: 274,
      mediaType: 'tv',
      title: '키스 식스 센스',
      releaseDate: '2022-05-25',
    },
    sceneDescription: '두 주인공이 데이트를 마치고 골목을 함께 걷는 장면',
  }), {
    kicker: '드라마 · 2022',
    title: '키스 식스 센스',
    placeName: '경희궁3길',
    description: '두 주인공이 데이트를 마치고 골목을 함께 걷는 장면',
  });
});
