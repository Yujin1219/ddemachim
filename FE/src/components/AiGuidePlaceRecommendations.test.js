import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import AiGuidePlaceRecommendations from './AiGuidePlaceRecommendations.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderedText(node) {
  return node.children?.map((child) => (
    typeof child === 'string' ? child : renderedText(child)
  )).join('') ?? '';
}

function recommendation(id, overrides = {}) {
  return {
    place: {
      id,
      name: `추천 장소 ${id}`,
      categoryLabel: '카페',
      imageUrl: `/place-${id}.jpg`,
    },
    walkingMinutes: id + 2,
    distanceMeters: id * 100,
    reason: id === 1 ? '가장 가까운 추천 장소예요' : '도보로 이동할 수 있는 곳이에요',
    ...overrides,
  };
}

test('추천 결과는 처음에 최대 3개만 보여준다', async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(AiGuidePlaceRecommendations, {
      recommendations: [1, 2, 3, 4, 5].map((id) => recommendation(id)),
      onMapClick() {},
      onPlaceClick() {},
    }));
  });

  assert.equal(renderer.root.findAllByProps({ className: 'ai-guide-place-card' }).length, 3);
  const toggle = renderer.root.findByProps({ className: 'ai-guide-place-toggle' });
  assert.equal(toggle.props['aria-expanded'], false);
  assert.match(renderedText(toggle), /2곳 더 보기/);
});

test('더 보기 버튼은 남은 추천을 펼치고 다시 3개로 접는다', async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(AiGuidePlaceRecommendations, {
      recommendations: [1, 2, 3, 4, 5].map((id) => recommendation(id)),
      onMapClick() {},
      onPlaceClick() {},
    }));
  });

  await act(async () => {
    renderer.root.findByProps({ className: 'ai-guide-place-toggle' }).props.onClick();
  });
  assert.equal(renderer.root.findAllByProps({ className: 'ai-guide-place-card' }).length, 5);
  assert.equal(renderer.root.findByProps({ className: 'ai-guide-place-toggle' }).props['aria-expanded'], true);
  assert.match(renderedText(renderer.root.findByProps({ className: 'ai-guide-place-toggle' })), /접기/);

  await act(async () => {
    renderer.root.findByProps({ className: 'ai-guide-place-toggle' }).props.onClick();
  });
  assert.equal(renderer.root.findAllByProps({ className: 'ai-guide-place-card' }).length, 3);
});

test('추천 섹션은 결과 개수와 실제 장소 메타데이터를 카드 한 곳에 표시한다', () => {
  const markup = renderToStaticMarkup(createElement(AiGuidePlaceRecommendations, {
    recommendations: [recommendation(1, { walkingMinutes: 6, distanceMeters: 305 })],
    onMapClick() {},
    onPlaceClick() {},
  }));

  assert.match(markup, /근처 추천/);
  assert.match(markup, /1곳/);
  assert.match(markup, /지도보기/);
  assert.match(markup, /추천 장소 1 사진/);
  assert.match(markup, /카페/);
  assert.match(markup, /ai-guide-place-card-copy"><strong>추천 장소 1<\/strong><span class="ai-guide-place-category">카페/);
  assert.match(markup, /6분/);
  assert.match(markup, /305m/);
  assert.match(markup, /가장 가까운 추천 장소예요/);
  assert.match(markup, /추천 장소 1 상세 보기/);
});

test('지도보기는 추천 결과의 지도 이동 callback을 실행한다', async () => {
  let mapOpenCount = 0;
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(AiGuidePlaceRecommendations, {
      recommendations: [recommendation(1)],
      onMapClick: () => { mapOpenCount += 1; },
      onPlaceClick() {},
    }));
  });

  await act(async () => {
    renderer.root.findByProps({ className: 'ai-guide-place-map-link' }).props.onClick();
  });
  assert.equal(mapOpenCount, 1);
});

test('장소 카드는 선택한 장소를 상세 이동 callback에 전달한다', async () => {
  const selectedPlaceIds = [];
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(AiGuidePlaceRecommendations, {
      recommendations: [recommendation(7)],
      onMapClick() {},
      onPlaceClick: (place) => selectedPlaceIds.push(place.id),
    }));
  });

  await act(async () => {
    renderer.root.findByProps({ className: 'ai-guide-place-card' }).props.onClick();
  });
  assert.deepEqual(selectedPlaceIds, [7]);
});

test('코스 추천 장소는 카드 옆 체크박스에서 선택 상태를 바꾼다', async () => {
  const changes = [];
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(AiGuidePlaceRecommendations, {
      recommendations: [recommendation(1), recommendation(2), recommendation(3)],
      selectablePlaceIds: [1, 2, 3],
      requiredPlaceIds: [1],
      selectedPlaceIds: [1, 2],
      onPlaceSelectionChange: (placeId, checked) => changes.push([placeId, checked]),
      onMapClick() {},
      onPlaceClick() {},
    }));
  });

  const checkboxes = renderer.root.findAllByType('input');
  assert.deepEqual(checkboxes.map((checkbox) => checkbox.props.checked), [true, true, false]);
  assert.deepEqual(checkboxes.map((checkbox) => Boolean(checkbox.props.disabled)), [true, false, false]);

  await act(async () => {
    checkboxes[2].props.onChange({ target: { checked: true } });
  });
  assert.deepEqual(changes, [[3, true]]);
});

test('추천 카드의 체크박스를 눌러도 장소 상세 화면은 열리지 않는다', async () => {
  const openedPlaceIds = [];
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(AiGuidePlaceRecommendations, {
      recommendations: [recommendation(7)],
      selectablePlaceIds: [7],
      selectedPlaceIds: [7],
      onPlaceSelectionChange() {},
      onMapClick() {},
      onPlaceClick: (place) => openedPlaceIds.push(place.id),
    }));
  });

  await act(async () => {
    renderer.root.findByType('input').props.onChange({ target: { checked: false } });
  });
  assert.deepEqual(openedPlaceIds, []);
});

test('장소 이미지가 없을 때 다른 장소의 사진을 대신 보여주지 않는다', () => {
  const item = recommendation(1);
  item.place.imageUrl = null;
  const markup = renderToStaticMarkup(createElement(AiGuidePlaceRecommendations, {
    recommendations: [item],
    onMapClick() {},
    onPlaceClick() {},
  }));

  assert.equal(markup.includes('<img'), false);
  assert.match(markup, /ai-guide-place-image-placeholder/);
  assert.equal(markup.includes('explore-cafe.jpeg'), false);
});

test('장소 이미지 로딩이 실패하면 깨진 이미지 대신 기본 장소 표시를 보여준다', async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(AiGuidePlaceRecommendations, {
      recommendations: [recommendation(1)],
      onMapClick() {},
      onPlaceClick() {},
    }));
  });

  const image = renderer.root.findByType('img');
  await act(async () => {
    image.props.onError();
  });

  assert.equal(renderer.root.findAllByType('img').length, 0);
  assert.equal(renderer.root.findAllByProps({ className: 'ai-guide-place-image-placeholder' }).length, 1);
});
