import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import CoursePreviewResults from './CoursePreviewResults.js';
import * as coursePreviewResultsModule from './CoursePreviewResults.js';
import CourseNavigationGuidance from './CourseNavigationGuidance.js';

const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
const unexpectedConsoleErrors = [];
console.error = (...args) => {
  const message = args.map((value) => String(value)).join(' ');
  if (!message.includes('react-test-renderer is deprecated')) unexpectedConsoleErrors.push(message);
};

function textContent(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent(node.children);
}

function FakeMap(props) {
  return createElement('div', { role: 'img', 'aria-label': props.ariaLabel });
}

test('development route simulation advances once from departure to destination', () => {
  assert.equal(typeof coursePreviewResultsModule.routeSimulationProgress, 'function');
  assert.equal(coursePreviewResultsModule.routeSimulationProgress(0), 0);
  assert.equal(coursePreviewResultsModule.routeSimulationProgress(2_500), 0.5);
  assert.equal(coursePreviewResultsModule.routeSimulationProgress(4_999) < 1, true);
  assert.equal(coursePreviewResultsModule.routeSimulationProgress(5_000), 1);
  assert.equal(coursePreviewResultsModule.routeSimulationProgress(10_000), 1);
});

test('starts route movement only after the navigation route layer is ready', () => {
  assert.equal(typeof coursePreviewResultsModule.shouldStartRouteSimulation, 'function');
  assert.equal(coursePreviewResultsModule.shouldStartRouteSimulation(true, true, false), false);
  assert.equal(coursePreviewResultsModule.shouldStartRouteSimulation(true, true, true), true);
  assert.equal(coursePreviewResultsModule.shouldStartRouteSimulation(false, true, true), false);
});

const walkStep = {
  streetName: '율곡로',
  distanceMeters: 180,
  description: '횡단보도를 건너세요',
  geometry: { type: 'LineString', coordinates: [[126.98, 37.57], [126.99, 37.58]] },
};
const preview = {
  strategy: 'FAST',
  stopCount: 2,
  totalDurationMinutes: 260,
  totalTravelMinutes: 52,
  totalDistanceMeters: 7800,
  scheduledStart: '10:00',
  scheduledEnd: '14:20',
  routeFitKey: 'generated-1',
  routeLegs: [{ mode: 'WALK', routeName: '도보', geometry: walkStep.geometry, steps: [walkStep] }],
  stops: [
    {
      sequenceNo: 1,
      placeName: '서울공예박물관',
      address: '서울 종로구 율곡로3길 4',
      latitude: 37.576,
      longitude: 126.983,
      dwellMinutes: 45,
      dwellSource: 'USER',
      arrivalDeadline: '11:10',
      arrivalBufferMinutes: 10,
      scheduledArrival: '11:00',
      scheduledDeparture: '11:45',
      travelMinutesFromPrevious: 15,
      travelDistanceMeters: 2800,
      hoursSourceType: 'REAL',
      openTime: '09:00',
      closeTime: '18:00',
      incomingRoute: {
        mode: 'TRANSIT',
        status: 'AVAILABLE',
        durationSeconds: 900,
        distanceMeters: 2800,
        fareWon: 1500,
        transferCount: 0,
        walkDistanceMeters: 180,
        unavailableReason: null,
        legs: [
          { mode: 'TRANSIT', routeName: '종로02', durationSeconds: 600, distanceMeters: 2400, geometry: null, steps: [] },
          { mode: 'WALK', routeName: '도보', durationSeconds: 300, distanceMeters: 400, geometry: null, steps: [walkStep] },
        ],
      },
    },
    {
      sequenceNo: 2,
      placeName: '도토리가든',
      address: '서울 종로구 계동길 19-8',
      latitude: 37.58,
      longitude: 126.986,
      dwellMinutes: 60,
      dwellSource: 'DEFAULT',
      arrivalDeadline: null,
      arrivalBufferMinutes: null,
      scheduledArrival: '12:10',
      scheduledDeparture: '13:10',
      travelMinutesFromPrevious: null,
      travelDistanceMeters: null,
      hoursSourceType: 'DEMO_DEFAULT',
      openTime: '09:00',
      closeTime: '21:00',
      incomingRoute: {
        mode: 'TRANSIT',
        status: 'UNAVAILABLE',
        durationSeconds: null,
        distanceMeters: null,
        fareWon: null,
        transferCount: null,
        walkDistanceMeters: null,
        unavailableReason: 'NO_ROUTE',
        legs: [],
      },
    },
  ],
};

test.afterEach(() => {
  assert.deepEqual(unexpectedConsoleErrors, [], `unexpected console.error: ${unexpectedConsoleErrors.join('\n')}`);
  unexpectedConsoleErrors.length = 0;
});

test.after(() => {
  console.error = originalConsoleError;
  if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

test('confirms the currently selected single course and hides editing in saved mode', async () => {
  const confirmations = [];
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
      onConfirm: (selection) => confirmations.push(selection),
      confirmLabel: '시작하기',
      readOnly: true,
    }));
  });

  const buttons = renderer.root.findAllByType('button');
  const startButton = buttons.find((button) => textContent(button.props.children) === '시작하기');
  assert.ok(startButton);
  assert.equal(buttons.some((button) => textContent(button.props.children) === '출발 조건 수정'), false);
  assert.equal(buttons.some((button) => textContent(button.props.children) === '장소별 시간 수정'), false);

  await act(async () => startButton.props.onClick());
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].strategy, 'FAST');
  assert.deepEqual(confirmations[0].routeSelections, {});
});

test('uses the AI-specific edit label in the preview action bar', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
      onConfirm: () => {},
      onEditConditions: () => {},
      editLabel: '수정하기',
      confirmLabel: '이 코스로 생성하기',
    }));
  });

  const labels = renderer.root.findAllByType('button').map((button) => textContent(button.props.children));
  assert.equal(labels.includes('수정하기'), true);
  assert.equal(labels.includes('이 코스로 생성하기'), true);
  assert.equal(labels.includes('조건 수정'), false);
});

test('shows explicit progress while a scheduled course is being saved', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
      onConfirm: () => {},
      confirmLabel: '예정 코스로 저장',
      confirmBusy: true,
    }));
  });

  const copy = textContent(renderer.toJSON());
  const saveButton = renderer.root.findAllByType('button')
    .find((button) => textContent(button.props.children) === '저장 중…');
  assert.ok(saveButton);
  assert.equal(saveButton.props.disabled, true);
  assert.equal(copy.includes('코스를 저장하고 있어요'), true);
  assert.equal(copy.includes('최대 30초 정도 걸릴 수 있어요.'), true);
});

test('links marker selection to its itinerary stop without overriding the full segment map fit', async () => {
  const scrollCalls = [];
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
    }), {
      createNodeMock: (element) => (
        typeof element.props.className === 'string' && element.props.className.startsWith('course-preview-stop')
          ? { scrollIntoView: (options) => scrollCalls.push(options) }
          : {}
      ),
    });
  });

  const map = () => renderer.root.findByType(FakeMap);
  await act(async () => map().props.onPlaceClick({ id: '1-서울공예박물관' }));
  assert.equal(map().props.selectedPlaceKey, 'INTERNAL:1-서울공예박물관');
  assert.equal(map().props.focusedPlaceKey, '');
  assert.deepEqual(scrollCalls, [{ behavior: 'smooth', block: 'nearest' }]);

  const secondStop = renderer.root.findByProps({ 'data-course-orbit-index': 1 });
  await act(async () => secondStop.props.onClick());
  assert.equal(map().props.selectedPlaceKey, 'INTERNAL:2-도토리가든');
  assert.equal(map().props.focusedPlaceKey, '');
  assert.equal(map().props.routeFitKey, 'generated-1|stop:1');
});

test('starts with the whole course and keeps it visible while focusing a selected place segment', async () => {
  const firstGeometry = { type: 'LineString', coordinates: [[126.97, 37.56], [126.98, 37.57]] };
  const secondGeometry = { type: 'LineString', coordinates: [[126.98, 37.57], [126.99, 37.58]] };
  const wholeCoursePreview = {
    ...preview,
    routeFitKey: 'whole-course',
    stops: [
      {
        ...preview.stops[0],
        basketItemId: 11,
        selectedRoute: {
          ...preview.stops[0].incomingRoute,
          legs: [{ mode: 'WALK', routeName: '첫 번째 구간', geometry: firstGeometry, steps: [] }],
        },
      },
      {
        ...preview.stops[1],
        basketItemId: 12,
        selectedRoute: {
          mode: 'WALK',
          status: 'AVAILABLE',
          durationSeconds: 600,
          distanceMeters: 900,
          legs: [{ mode: 'WALK', routeName: '두 번째 구간', geometry: secondGeometry, steps: [] }],
        },
      },
    ],
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: wholeCoursePreview,
      status: 'success',
      MapComponent: FakeMap,
      origin: { longitude: 126.96, latitude: 37.55 },
    }));
  });

  const map = () => renderer.root.findByType(FakeMap);
  const routeNames = (legs) => legs.map((leg) => leg.routeName).filter(Boolean);
  const overviewButton = () => renderer.root.findAllByType('button').find((button) => (
    button.props.className?.includes('course-preview-overview-button')
  ));

  assert.deepEqual(routeNames(map().props.routeLegs), ['첫 번째 구간', '두 번째 구간']);
  assert.deepEqual(map().props.ghostRouteLegs, []);
  assert.equal(map().props.routeFitKey, 'whole-course|overview');
  assert.equal(overviewButton().props['aria-pressed'], true);

  await act(async () => renderer.root.findByProps({ 'data-course-orbit-index': 1 }).props.onClick());

  assert.equal(routeNames(map().props.routeLegs).includes('첫 번째 구간'), false);
  assert.equal(routeNames(map().props.routeLegs).includes('두 번째 구간'), true);
  assert.deepEqual(routeNames(map().props.ghostRouteLegs), ['첫 번째 구간', '두 번째 구간']);
  assert.equal(map().props.routeFitKey, 'whole-course|stop:1');
  assert.equal(overviewButton().props['aria-pressed'], false);

  await act(async () => overviewButton().props.onClick());

  assert.deepEqual(routeNames(map().props.routeLegs), ['첫 번째 구간', '두 번째 구간']);
  assert.equal(map().props.routeFitKey, 'whole-course|overview');
  assert.equal(overviewButton().props['aria-pressed'], true);
});

test('summarizes the whole itinerary before a place segment is selected', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
    }));
  });

  const summary = () => renderer.root.findByProps({ className: 'course-preview-sheet-summary' });
  assert.equal(textContent(summary()).includes('전체 코스'), true);
  assert.equal(textContent(summary()).includes('2곳 · 4시간 20분 · 7.8km'), true);

  await act(async () => renderer.root.findByProps({ 'data-course-orbit-index': 1 }).props.onClick());
  assert.equal(textContent(summary()).includes('2. 도토리가든'), true);
});

test('shows only the ordered stops in the whole-course detail and opens a stop on selection', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
    }));
  });

  const itinerary = renderer.root.findByProps({ className: 'course-preview-itinerary' });
  const orderedStops = itinerary.findAllByProps({ className: 'course-preview-overview-stop' });
  assert.equal(orderedStops.length, 2);
  assert.equal(textContent(orderedStops[0]).includes('1서울공예박물관'), true);
  assert.equal(textContent(orderedStops[1]).includes('2도토리가든'), true);
  assert.equal(textContent(itinerary).includes('종로02'), false);
  assert.equal(textContent(itinerary).includes('횡단보도를 건너세요'), false);

  await act(async () => orderedStops[1].props.onClick());

  assert.equal(renderer.root.findAllByProps({ className: 'course-preview-overview-stop' }).length, 0);
  assert.equal(textContent(renderer.root.findByProps({ className: 'course-preview-sheet-summary' })).includes('2. 도토리가든'), true);
});

test('keeps the resizable itinerary sheet over the map stage', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
    }));
  });

  const stage = renderer.root.findByProps({ className: 'course-preview-stage' });
  assert.ok(stage.findByProps({ className: 'course-preview-sheet-frame' }));
});

test('toggles the detail action between expanding and collapsing the itinerary sheet', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
    }), {
      createNodeMock: (element) => {
        if (element.props.className === 'course-preview-sheet-frame') return { clientHeight: 600 };
        if (element.props.className === 'course-preview-timeline') return { children: [] };
        if (element.props.className === 'course-preview-overview-order') {
          return {
            children: [
              { getBoundingClientRect: () => ({ height: 88 }) },
              { getBoundingClientRect: () => ({ height: 88 }) },
            ],
          };
        }
        return {};
      },
    });
  });

  const detailButton = () => renderer.root.findAllByType('button')
    .find((button) => ['상세 보기', '상세 닫기'].includes(textContent(button.props.children)));
  const sheetOffset = () => Number.parseFloat(
    renderer.root.findByProps({ className: 'course-preview-sheet' }).props.style.transform.match(/[-\d.]+/)[0],
  );

  assert.equal(textContent(detailButton().props.children), '상세 보기');
  assert.equal(detailButton().props['aria-expanded'], false);
  const collapsedOffset = sheetOffset();

  await act(async () => detailButton().props.onClick());
  assert.equal(textContent(detailButton().props.children), '상세 닫기');
  assert.equal(detailButton().props['aria-expanded'], true);
  assert.equal(sheetOffset() < collapsedOffset, true, 'opening the overview detail must visibly raise the sheet');

  await act(async () => detailButton().props.onClick());
  assert.equal(textContent(detailButton().props.children), '상세 보기');
  assert.equal(detailButton().props['aria-expanded'], false);
  assert.equal(sheetOffset(), collapsedOffset);
});

test('starts the itinerary sheet collapsed while keeping its bottom edge above the actions', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
    }), {
      createNodeMock: (element) => {
        if (element.props.className === 'course-preview-sheet-frame') return { clientHeight: 600 };
        if (element.props.className === 'course-preview-timeline') {
          return {
            children: [
              { getBoundingClientRect: () => ({ height: 180 }) },
              { getBoundingClientRect: () => ({ height: 220 }) },
            ],
          };
        }
        return {};
      },
    });
  });

  const sheet = renderer.root.findByProps({ className: 'course-preview-sheet' });
  assert.deepEqual(sheet.props.style, {
    transform: 'translateY(468px)',
    height: 'calc(100% - 468px)',
  });
});

test('positions the route summary below the place orbit controls', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
    }));
  });

  const summary = renderer.root.findByProps({ className: 'course-preview-floating' });
  assert.deepEqual(summary.props.style, { top: '116px' });
});

test('enables navigation camera only while a saved course is actively progressing', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      navigationMode: true,
      readOnly: true,
      onBack: () => {},
    }));
  });

  const map = renderer.root.findByType(FakeMap);
  assert.equal(map.props.navigationMode, true);
  assert.equal(map.props.routeFitKey, '');
  assert.equal(map.props.routeDrawKey, '');
  assert.equal(map.props.focusedPlaceKey, '');
});

test('keeps the navigation map at the departure point until its route layer reports ready', async () => {
  const origin = { longitude: 126.977, latitude: 37.565 };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      origin,
      status: 'success',
      MapComponent: FakeMap,
      navigationMode: true,
      readOnly: true,
      onBack: () => {},
    }));
  });

  let map = renderer.root.findByType(FakeMap);
  assert.deepEqual(map.props.center, [origin.longitude, origin.latitude]);
  assert.equal(typeof map.props.onRouteReady, 'function');

  await act(async () => map.props.onRouteReady());
  map = renderer.root.findByType(FakeMap);
  assert.equal(map.props.center, undefined);
});

test('places a course finish error in the map stage instead of behind the navigation guidance', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      navigationMode: true,
      readOnly: true,
      completeError: '코스를 종료하지 못했어요. 다시 시도해주세요.',
      onBack: () => {},
      onCompleteCourse: () => {},
    }));
  });

  const stage = renderer.root.findByProps({ className: 'course-preview-stage' });
  const alert = stage.findByProps({ role: 'alert' });
  assert.equal(alert.props.className, 'course-navigation-finish-error');
  assert.equal(
    renderer.root.findByProps({ className: 'navigation-top-card course-navigation-top-card' })
      .findAllByProps({ role: 'alert' }).length,
    0,
  );
});

test('passes GPS coordinates and heading metadata from guidance into the navigation map', async () => {
  const reportedLocations = [];
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      navigationMode: true,
      onBack: () => {},
      onNavigationLocationChange: (location) => reportedLocations.push(location),
    }));
  });
  const observation = {
    coordinate: [126.978, 37.5665],
    heading: 47,
    speed: 1.2,
    accuracy: 9,
    timestamp: 1234,
  };

  await act(async () => renderer.root.findByType(CourseNavigationGuidance).props.onLocationChange(observation));

  const map = renderer.root.findByType(FakeMap);
  assert.deepEqual(map.props.userLocation, observation.coordinate);
  assert.equal(map.props.userHeading, 47);
  assert.equal(map.props.userSpeed, 1.2);
  assert.equal(map.props.userLocationAccuracy, 9);
  assert.deepEqual(reportedLocations, [observation.coordinate]);
});

test('shows arrival first and opens the ordinary place detail only from its button', async () => {
  const arrivals = [];
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      navigationMode: true,
      onArrivalPlace: (stop, arrivedAt) => arrivals.push([stop, arrivedAt]),
      onBack: () => {},
    }));
  });

  await act(async () => renderer.root.findByType(CourseNavigationGuidance).props.onArrival(preview.stops[0]));

  assert.equal(arrivals.length, 0);
  const arrival = renderer.root.findByProps({ className: 'course-navigation-arrival' });
  assert.equal(textContent(arrival.findByType('h1')), '서울공예박물관');

  await act(async () => arrival.findByProps({ className: 'course-navigation-place-link' }).props.onClick());

  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0][0], preview.stops[0]);
  assert.equal(Number.isFinite(arrivals[0][1]), true);
  await act(async () => renderer.unmount());
});

test('puts a detected filming-scene action inside the matching arrival card', async () => {
  const filmingPlace = { id: 101, name: '서울공예박물관' };
  const filmingVisits = [];
  const previewWithPlaceIds = {
    ...preview,
    stops: preview.stops.map((stop, index) => ({ ...stop, placeId: index === 0 ? 101 : 202 })),
  };
  let renderer;

  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: previewWithPlaceIds,
      status: 'success',
      MapComponent: FakeMap,
      navigationMode: true,
      filmingNotice: filmingPlace,
      onViewFilming: (place) => filmingVisits.push(place),
      onBack: () => {},
    }));
  });

  assert.equal(renderer.root.findAllByProps({ className: 'course-navigation-filming-prompt' }).length, 0);
  await act(async () => renderer.root.findByType(CourseNavigationGuidance).props.onArrival(previewWithPlaceIds.stops[0]));

  const arrival = renderer.root.findByProps({ className: 'course-navigation-arrival' });
  const filmingPrompt = arrival.findByProps({ className: 'course-navigation-filming-prompt' });
  assert.equal(textContent(filmingPrompt).includes('촬영 장면이 있어요'), true);

  await act(async () => filmingPrompt.findByType('button').props.onClick());
  assert.deepEqual(filmingVisits, [filmingPlace]);
  await act(async () => renderer.unmount());
});

test('renders FAST schedule, authoritative hours, incoming legs, WALK steps, and map geometry', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
      onEditConditions: () => {},
      onEditStops: () => {},
    }));
  });
  await act(async () => renderer.root.findAllByProps({ className: 'course-preview-overview-stop' })[0].props.onClick());

  const copy = textContent(renderer.toJSON());
  const map = renderer.root.findByType(FakeMap);
  assert.equal(map.props.ariaLabel, '빠른 코스 추천 경로 지도');
  assert.equal(copy.includes('4시간 20분'), true);
  assert.equal(copy.includes('7.8km'), true);
  assert.equal(copy.includes('10:00 출발'), true);
  assert.equal(copy.includes('11:00 도착'), true);
  assert.equal(copy.includes('종로02'), true);
  assert.equal(copy.includes('횡단보도를 건너세요'), true);
  assert.equal(copy.includes('도토리가든'), true);
  assert.equal(map.props.routeLegs.some((leg) => leg.description === '횡단보도를 건너세요'), true);
  assert.equal(map.props.routeFitKey, 'generated-1|stop:0');
  assert.equal(map.props.center, undefined);
  assert.equal(map.props.interactive, true);
  assert.equal(map.props.clusterPlaces, false);
  assert.equal(map.props.showCongestionAreas, false);
  assert.equal(map.props.fitPlaceMarkers, false);
  assert.equal(map.props.placeRequestKey, 'generated-1');
  assert.deepEqual(map.props.routeFitPadding, [156, 32, 176, 32]);
  assert.deepEqual(await map.props.loadPlacesInBounds(), [
    { id: '1-서울공예박물관', name: '서울공예박물관', latitude: 37.576, longitude: 126.983, sequenceNo: 1, imageUrl: '' },
    { id: '2-도토리가든', name: '도토리가든', latitude: 37.58, longitude: 126.986, sequenceNo: 2, imageUrl: '' },
  ]);
  assert.equal(map.props.placeMarkerLabel({ sequenceNo: 2 }), 2);
});

test('switches every displayed and mapped value between FAST and QUIET by strategy', async () => {
  const quietStop = {
    ...preview.stops[1],
    sequenceNo: 1,
    placeName: '한적한 북촌 정원',
    scheduledArrival: '10:40',
    scheduledDeparture: '11:40',
    congestionScore: 67,
    latitude: 35.18,
    longitude: 129.07,
  };
  const quiet = {
    ...preview,
    strategy: 'QUIET',
    stopCount: 1,
    totalDurationMinutes: 310,
    totalTravelMinutes: 70,
    totalDistanceMeters: 9100,
    scheduledStart: '10:20',
    scheduledEnd: '15:30',
    averageCongestionScore: 33,
    routeFitKey: 'generated-1|QUIET|12:1:10:40',
    routeLegs: [{ mode: 'WALK', routeName: '조용한 길', geometry: null, steps: [] }],
    stops: [quietStop],
  };
  const responsePreview = { ...preview, options: [quiet, preview] };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: responsePreview,
      status: 'success',
      MapComponent: FakeMap,
      onBack: () => {},
      onEditConditions: () => {},
      onEditStops: () => {},
    }));
  });

  const tabs = renderer.root.findAllByProps({ role: 'tab' });
  const fastTab = tabs.find((button) => textContent(button.props.children) === '빠른 길');
  const quietTab = tabs.find((button) => textContent(button.props.children) === '한적한 길');
  assert.equal(fastTab.props['aria-selected'], true);
  assert.equal(quietTab.props['aria-selected'], false);

  await act(async () => quietTab.props.onClick());
  await act(async () => renderer.root.findByProps({ className: 'course-preview-overview-stop' }).props.onClick());

  const copy = textContent(renderer.toJSON());
  const selectedTabs = renderer.root.findAllByProps({ role: 'tab' });
  const map = renderer.root.findByType(FakeMap);
  assert.equal(selectedTabs.find((button) => textContent(button.props.children) === '한적한 길').props['aria-selected'], true);
  assert.equal(copy.includes('5시간 10분'), true);
  assert.equal(copy.includes('9.1km'), true);
  assert.equal(copy.includes('한적한 북촌 정원'), true);
  assert.equal(copy.includes('10:40 도착'), true);
  assert.equal(copy.includes('예상 혼잡도 약간 붐빔'), true);
  assert.equal(map.props.routeLegs.length, 0);
  assert.equal(map.props.routeFitKey, `${quiet.routeFitKey}|stop:0`);
  assert.equal(map.props.placeRequestKey, quiet.routeFitKey);
  assert.equal(map.props.fitPlaceMarkers, true);
  assert.deepEqual(await map.props.loadPlacesInBounds(), [
    { id: '1-한적한 북촌 정원', name: '한적한 북촌 정원', latitude: 35.18, longitude: 129.07, sequenceNo: 1, imageUrl: '' },
  ]);
  assert.deepEqual(map.props.center, [129.07, 35.18]);
  assert.equal(map.props.ariaLabel, '한적한 코스 추천 경로 지도');
});

test('resets a prior QUIET choice to FAST when a new response arrives', async () => {
  const quiet = { ...preview, strategy: 'QUIET', routeFitKey: 'quiet-route' };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: { ...preview, options: [quiet, preview] },
      status: 'success',
      MapComponent: FakeMap,
    }));
  });
  const quietTab = renderer.root.findAllByProps({ role: 'tab' }).find((button) => textContent(button.props.children) === '한적한 길');
  await act(async () => quietTab.props.onClick());

  const nextFastOption = { ...preview, routeFitKey: 'next-fast-route', totalDurationMinutes: 120 };
  const nextQuietOption = { ...quiet, routeFitKey: 'next-quiet-route', totalDurationMinutes: 360 };
  const nextFast = { ...nextFastOption, options: [nextQuietOption, nextFastOption] };
  await act(async () => {
    renderer.update(createElement(CoursePreviewResults, {
      preview: nextFast,
      status: 'success',
      MapComponent: FakeMap,
    }));
  });

  const nextTabs = renderer.root.findAllByProps({ role: 'tab' });
  assert.equal(nextTabs.find((button) => textContent(button.props.children) === '빠른 길').props['aria-selected'], true);
  assert.equal(nextTabs.find((button) => textContent(button.props.children) === '한적한 길').props['aria-selected'], false);
  assert.equal(textContent(renderer.toJSON()).includes('2시간'), true);
  assert.equal(renderer.root.findByType(FakeMap).props.routeFitKey, 'next-fast-route|overview');
});

test('switches an individual leg locally and propagates a longer route to its map and downstream schedule', async () => {
  const alternativeGeometry = { type: 'LineString', coordinates: [[126.982, 37.572], [126.99, 37.58]] };
  const alternativeRoute = {
    mode: 'WALK',
    status: 'AVAILABLE',
    durationSeconds: 1200,
    distanceMeters: 900,
    legs: [{ mode: 'WALK', routeName: '대안 도보', durationSeconds: 1200, distanceMeters: 900, geometry: alternativeGeometry, steps: [] }],
  };
  const selectable = {
    ...preview,
    stops: [
      {
        ...preview.stops[0],
        basketItemId: 101,
        scheduledArrival: '10:15',
        scheduledDeparture: '11:00',
        selectedRoute: preview.stops[0].incomingRoute,
        alternativeRoute,
      },
      {
        ...preview.stops[1],
        basketItemId: 102,
        scheduledArrival: '11:15',
        scheduledDeparture: '12:15',
        selectedRoute: { ...preview.stops[0].incomingRoute, legs: [] },
      },
    ],
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, { preview: selectable, status: 'success', MapComponent: FakeMap }));
  });
  await act(async () => renderer.root.findAllByProps({ className: 'course-preview-overview-stop' })[0].props.onClick());

  const alternative = renderer.root.findAllByType('input').find((input) => input.props.value === 'alternative');
  assert.ok(alternative);
  assert.equal(textContent(renderer.toJSON()).includes('도보20분900m'), true);
  await act(async () => alternative.props.onChange());

  const copy = textContent(renderer.toJSON());
  const map = renderer.root.findByType(FakeMap);
  assert.equal(copy.includes('10:20 도착'), true);
  assert.equal(copy.includes('4시간 25분'), true);
  assert.equal(map.props.routeLegs[0], alternativeRoute.legs[0]);
  assert.equal(map.props.routeLegs.at(-1).routeName, '도착지 연결');
  assert.match(map.props.routeFitKey, /101:alternative.*stop:0/);
  assert.equal(map.props.placeRequestKey, 'generated-1|legs:101:alternative');
  assert.deepEqual(await map.props.loadPlacesInBounds(), [
    { id: 101, name: '서울공예박물관', latitude: 37.576, longitude: 126.983, sequenceNo: 1, imageUrl: '' },
    { id: 102, name: '도토리가든', latitude: 37.58, longitude: 126.986, sequenceNo: 2, imageUrl: '' },
  ]);
});

test('hides EASY terrain metrics for transit and reveals ascent for a short selected walk', async () => {
  const easyPreview = {
    ...preview,
    strategy: 'EASY',
    totalAscentMeters: 18,
    elevationComparisons: [{
      sequenceNo: 1,
      placeName: '서울공예박물관',
      originalAscentMeters: 22,
      easyAscentMeters: 18,
      originalSteepUphillDistanceMeters: 50,
      easySteepUphillDistanceMeters: 20,
      easyCoveragePercent: 100,
    }],
    stops: [{
      ...preview.stops[0],
      basketItemId: 201,
      ascentMeters: 18,
      selectedRoute: preview.stops[0].incomingRoute,
      alternativeRoute: {
        mode: 'WALK',
        status: 'AVAILABLE',
        durationSeconds: 1200,
        distanceMeters: 1000,
        legs: [],
      },
    }],
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, { preview: easyPreview, status: 'success', MapComponent: FakeMap }));
  });
  assert.equal(textContent(renderer.toJSON()).includes('상승 고도'), false);
  await act(async () => renderer.root.findByProps({ className: 'course-preview-overview-stop' }).props.onClick());

  const alternative = renderer.root.findAllByType('input').find((input) => input.props.value === 'alternative');
  await act(async () => alternative.props.onChange());
  assert.equal(textContent(renderer.toJSON()).includes('상승 고도 18m'), true);
});

test('shows EASY feedback from elevation comparisons when FAST has no aggregate ascent', async () => {
  const fastOption = { ...preview, strategy: 'FAST', totalAscentMeters: null };
  const easyOption = {
    ...preview,
    strategy: 'EASY',
    totalAscentMeters: 18,
    elevationComparisons: [{
      originalAscentMeters: 40,
      easyAscentMeters: 18,
      originalSteepUphillDistanceMeters: 90,
      easySteepUphillDistanceMeters: 30,
    }],
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: { ...fastOption, options: [fastOption, easyOption] },
      status: 'success',
      MapComponent: FakeMap,
    }));
  });

  const easyTab = renderer.root.findAllByType('button').find((button) => button.children.join('') === '편한 길');
  await act(async () => easyTab.props.onClick());

  const copy = textContent(renderer.toJSON());
  assert.equal(copy.includes('더 편한 길을 찾았어요'), true);
  assert.equal(copy.includes('40m → 18m'), true);
  assert.equal(copy.includes('오르막 55% ↓'), true);
});

test('renders the animated course builder as a busy status while the preview is loading', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'loading',
      MapComponent: FakeMap,
    }));
  });

  const screen = renderer.root.findByType('section');
  const status = renderer.root.findByProps({ role: 'status' });
  const illustration = renderer.root.findByType('svg');
  const copy = textContent(status);

  assert.equal(screen.props['aria-busy'], true);
  assert.equal(status.props['aria-live'], 'polite');
  assert.equal(status.props['aria-busy'], true);
  assert.equal(copy.includes('최적화된 코스를 만들고 있어요'), true);
  assert.equal(copy.includes('장소 사이 이동 시간을 비교하고 있어요'), true);
  assert.equal(copy.includes('오르막 부담이 적은 길을 찾고 있어요'), true);
  assert.equal(copy.includes('붐비는 시간대를 피해 순서를 조정하고 있어요'), true);
  assert.equal(copy.includes('운영시간과 전체 일정을 확인하고 있어요'), true);
  assert.equal(copy.includes('빠른 길'), true);
  assert.equal(copy.includes('편한 길'), true);
  assert.equal(copy.includes('한적한 길'), true);
  assert.equal(copy.includes('세 가지 코스를 차례대로 확인하고 있어요'), true);
  const announcement = renderer.root.findByProps({ className: 'course-preview-loader-announcement' });
  assert.equal(/완료|완성/.test(textContent(announcement)), false);
  assert.equal(illustration.props.viewBox, '0 0 390 560');
  assert.equal(illustration.props['aria-hidden'], true);
  assert.equal(illustration.props.focusable, false);
  assert.equal(renderer.root.findAllByProps({ className: 'course-preview-spinner' }).length, 0);
  assert.equal(renderer.root.findAllByType(FakeMap).length, 0);
});

test('spaces every course builder progress step at an equal interval', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'loading',
      MapComponent: FakeMap,
    }));
  });

  const stepX = ['one', 'two', 'three', 'four'].map((step) => (
    renderer.root.findAllByProps({ className: `course-preview-loader-step-${step}` })
      .find((node) => node.type === 'circle').props.cx
  ));

  assert.deepEqual(stepX.slice(1).map((value, index) => value - stepX[index]), [86, 86, 86]);
});

test('shows the completion motion only after the course preview succeeds', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'loading',
      MapComponent: FakeMap,
    }));
  });

  assert.equal(renderer.root.findAllByProps({
    className: 'course-preview-loader-status is-complete',
  }).length, 0);

  await act(async () => {
    renderer.update(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
    }));
  });

  assert.equal(renderer.root.findAllByProps({
    className: 'course-preview-loader-status is-complete',
  }).length, 1);
  assert.equal(renderer.root.findByProps({ role: 'status' }).props['aria-busy'], false);

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });

  assert.equal(renderer.root.findAllByProps({
    className: 'course-preview-loader-status is-complete',
  }).length, 0);
  assert.equal(renderer.root.findAllByProps({ className: 'course-preview-stage' }).length, 1);
});

test('collapses the itinerary sheet after the completion motion reveals a generated course', async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'loading',
      MapComponent: FakeMap,
    }), {
      createNodeMock: (element) => {
        if (element.props.className === 'course-preview-sheet-frame') return { clientHeight: 600 };
        if (element.props.className === 'course-preview-timeline') return { children: [] };
        return {};
      },
    });
  });

  await act(async () => {
    renderer.update(createElement(CoursePreviewResults, {
      preview,
      status: 'success',
      MapComponent: FakeMap,
    }));
  });

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 280));
  });

  const sheet = renderer.root.findByProps({ className: 'course-preview-sheet' });
  assert.deepEqual(sheet.props.style, {
    transform: 'translateY(468px)',
    height: 'calc(100% - 468px)',
  });
});

test('renders every structured failure message in semantic group order outside the concise alert', async () => {
  const failure = {
    groups: [
      {
        id: 'conditions',
        label: '출발 조건',
        action: 'conditions',
        messages: [
          '현재 출발 시각으로는 장소별 조건을 모두 맞추기 어려워요.',
          '서울공예박물관: 선택한 날짜에는 운영하지 않아요.',
        ],
      },
      {
        id: 'stops',
        label: '장소별 시간',
        action: 'stops',
        messages: ['도토리가든: 운영시간 안에 방문을 마치기 어려워요.'],
      },
      {
        id: 'route',
        label: '이동 경로',
        action: 'route',
        messages: ['북촌: 이용 가능한 이동 경로를 찾지 못했어요.'],
      },
    ],
  };
  let conditionsCount = 0;
  let stopsCount = 0;
  let retryCount = 0;
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'error',
      message: 'COURSE4222 서버 원문 adjustmentProposal',
      failure,
      onBack: () => {},
      onEditConditions: () => { conditionsCount += 1; },
      onEditStops: () => { stopsCount += 1; },
      onRetry: () => { retryCount += 1; },
    }));
  });

  const alert = renderer.root.findByProps({ role: 'alert' });
  assert.equal(textContent(alert), '입력한 조건으로는 코스를 만들기 어려워요확인된 이유와 바꿔볼 수 있는 조건을 정리했어요.');
  const groups = renderer.root.findAllByProps({ className: 'course-preview-diagnostic-group' });
  assert.deepEqual(groups.map((group) => textContent(group.findByType('h2'))), ['출발 조건', '장소별 시간', '이동 경로']);
  assert.deepEqual(groups.flatMap((group) => group.findAllByType('li').map(textContent)), [
    '현재 출발 시각으로는 장소별 조건을 모두 맞추기 어려워요.',
    '서울공예박물관: 선택한 날짜에는 운영하지 않아요.',
    '도토리가든: 운영시간 안에 방문을 마치기 어려워요.',
    '북촌: 이용 가능한 이동 경로를 찾지 못했어요.',
  ]);
  assert.equal(textContent(renderer.toJSON()).includes('COURSE4222'), false);
  assert.equal(textContent(renderer.toJSON()).includes('adjustmentProposal'), false);

  const buttons = renderer.root.findAllByType('button');
  const conditions = buttons.find((button) => textContent(button) === '출발 조건 수정');
  const stops = buttons.find((button) => textContent(button) === '장소별 시간 수정');
  const retry = buttons.find((button) => textContent(button) === '다시 계산하기');
  assert.equal(conditions.props.className, 'ui-button primary');
  assert.equal(stops.props.className, 'ui-button secondary');
  assert.equal(retry.props.className, 'ui-button secondary');
  await act(async () => conditions.props.onClick());
  await act(async () => stops.props.onClick());
  await act(async () => retry.props.onClick());
  assert.equal(conditionsCount, 1);
  assert.equal(stopsCount, 1);
  assert.equal(retryCount, 1);
});

test('makes the first available structured action primary and omits unavailable callbacks', async () => {
  const failure = {
    groups: [
      { id: 'conditions', label: '출발 조건', action: 'conditions', messages: ['출발 조건 이유'] },
      { id: 'stops', label: '장소별 시간', action: 'stops', messages: ['장소 시간 이유'] },
      { id: 'route', label: '이동 경로', action: 'route', messages: ['경로 이유'] },
    ],
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'error',
      failure,
      onEditStops: () => {},
    }));
  });

  const buttons = renderer.root.findAllByType('button');
  assert.deepEqual(buttons.map(textContent), ['장소별 시간 수정']);
  assert.equal(buttons[0].props.className, 'ui-button primary');
  assert.equal(renderer.root.findAllByType('li').length, 3, 'missing actions must not hide diagnostics');
});

test('uses the generic safe error UI for malformed failures and for validation status', async () => {
  const malformedFailure = {
    groups: [{ id: 'route', label: '서버 그룹', action: 'route', messages: [] }],
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'error',
      message: '안전한 일반 오류',
      failure: malformedFailure,
      onEditConditions: () => {},
    }));
  });
  assert.equal(textContent(renderer.toJSON()).includes('코스를 계산하지 못했어요'), true);
  assert.equal(textContent(renderer.toJSON()).includes('안전한 일반 오류'), true);
  assert.equal(renderer.root.findAllByProps({ className: 'course-preview-diagnostic-group' }).length, 0);

  await act(async () => {
    renderer.update(createElement(CoursePreviewResults, {
      preview: null,
      status: 'validation',
      message: '장소를 먼저 담아주세요.',
      failure: {
        groups: [{ id: 'route', label: '이동 경로', action: 'route', messages: ['경로 이유'] }],
      },
      onEditConditions: () => {},
    }));
  });
  assert.equal(textContent(renderer.toJSON()).includes('코스 조건을 먼저 확인해주세요'), true);
  assert.equal(renderer.root.findAllByProps({ className: 'course-preview-diagnostic-group' }).length, 0);
});

test('renders an actionable preview error without discarding the draft', async () => {
  let retryCount = 0;
  let backCount = 0;
  let editCount = 0;
  let editStopsCount = 0;
  let renderer;
  await act(async () => {
    renderer = create(createElement(CoursePreviewResults, {
      preview: null,
      status: 'error',
      message: '입력한 조건으로 빠른 코스를 만들 수 없어요.',
      onBack: () => { backCount += 1; },
      onRetry: () => { retryCount += 1; },
      onEditConditions: () => { editCount += 1; },
      onEditStops: () => { editStopsCount += 1; },
    }));
  });

  const alert = renderer.root.findByProps({ role: 'alert' });
  assert.equal(textContent(alert).includes('입력한 조건으로 빠른 코스를 만들 수 없어요.'), true);
  const buttons = renderer.root.findAllByType('button');
  const retry = buttons.find((button) => textContent(button) === '다시 계산하기');
  const edit = buttons.find((button) => textContent(button) === '출발 조건 수정');
  const editStops = buttons.find((button) => textContent(button) === '장소별 시간 수정');
  const back = buttons.find((button) => button.props['aria-label'] === '이전');
  assert.ok(retry);
  assert.ok(edit);
  assert.ok(editStops);
  assert.ok(back);
  await act(async () => retry.props.onClick());
  await act(async () => edit.props.onClick());
  await act(async () => editStops.props.onClick());
  await act(async () => back.props.onClick());
  assert.equal(retryCount, 1);
  assert.equal(editCount, 1);
  assert.equal(editStopsCount, 1);
  assert.equal(backCount, 1);
});
