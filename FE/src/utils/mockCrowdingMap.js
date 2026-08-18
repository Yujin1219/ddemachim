const SLOT_DURATION_MS = 30 * 60 * 1000;
const SEOUL_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;

const LEVEL_LABELS = Object.freeze({
  RELAXED: '여유',
  NORMAL: '보통',
  CROWDED: '약간 붐빔',
  VERY_CROWDED: '붐빔',
});

function validText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validCoordinate(value, minimum, maximum) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function normalizeMetadata(grid) {
  const gridCode = validText(grid?.gridCode);
  const score = grid?.score;
  const level = validText(grid?.level).toUpperCase();
  const levelLabel = validText(grid?.levelLabel) || LEVEL_LABELS[level];
  const slotStart = validText(grid?.slotStart);
  const slotEnd = validText(grid?.slotEnd);
  const startTimestamp = Date.parse(slotStart);
  const endTimestamp = Date.parse(slotEnd);

  if (
    !gridCode
    || !Number.isInteger(score)
    || score < 1
    || score > 100
    || !LEVEL_LABELS[level]
    || !levelLabel
    || grid?.mock !== true
    || !Number.isFinite(startTimestamp)
    || !Number.isFinite(endTimestamp)
    || endTimestamp <= startTimestamp
  ) {
    throw new TypeError('A complete scored MOCK crowding grid is required.');
  }

  return {
    gridCode,
    score,
    level,
    levelLabel,
    mock: true,
    slotStart,
    slotEnd,
  };
}

function normalizePolygonCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    throw new TypeError('Valid GeoJSON Polygon coordinates are required.');
  }

  return coordinates.map((ring) => {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new TypeError('Every crowding grid ring must contain at least four positions.');
    }

    const normalizedRing = ring.map((position) => {
      if (
        !Array.isArray(position)
        || position.length < 2
        || !validCoordinate(position[0], -180, 180)
        || !validCoordinate(position[1], -90, 90)
      ) {
        throw new TypeError('Crowding grid positions must use [longitude, latitude].');
      }
      return [position[0], position[1]];
    });
    const first = normalizedRing[0];
    const last = normalizedRing.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw new TypeError('Crowding grid polygon rings must be closed.');
    }
    return normalizedRing;
  });
}

function seoulDateTimeParts(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${byType.year}-${byType.month}-${byType.day}`,
    dateLabel: `${Number(byType.month)}월 ${Number(byType.day)}일`,
    timeLabel: `${byType.hour}:${byType.minute}`,
  };
}

function formatSlotRange(slotStart, slotEnd) {
  const start = new Date(slotStart);
  const end = new Date(slotEnd);
  const startParts = seoulDateTimeParts(start);
  const endParts = seoulDateTimeParts(end);
  const endLabel = startParts.dateKey === endParts.dateKey
    ? endParts.timeLabel
    : `${endParts.dateLabel} ${endParts.timeLabel}`;
  return `${startParts.dateLabel} ${startParts.timeLabel}–${endLabel}`;
}

export function toMockCrowdingFeatureCollection(grids) {
  if (!Array.isArray(grids)) {
    throw new TypeError('The crowding grid response must be an array.');
  }

  return {
    type: 'FeatureCollection',
    features: grids.map((grid) => {
      const metadata = normalizeMetadata(grid);
      if (
        !validCoordinate(grid.centerLongitude, -180, 180)
        || !validCoordinate(grid.centerLatitude, -90, 90)
      ) {
        throw new TypeError('A valid crowding grid center is required.');
      }
      return {
        type: 'Feature',
        id: metadata.gridCode,
        geometry: {
          type: 'Polygon',
          coordinates: normalizePolygonCoordinates(grid.coordinates),
        },
        properties: {
          gridCode: metadata.gridCode,
          centerCoordinate: [grid.centerLongitude, grid.centerLatitude],
          score: metadata.score,
          level: metadata.level,
          levelLabel: metadata.levelLabel,
          mock: metadata.mock,
          slotStart: metadata.slotStart,
          slotEnd: metadata.slotEnd,
        },
      };
    }),
  };
}

export function toMockCrowdingGridDetail(grid) {
  const metadata = normalizeMetadata(grid);
  return {
    gridCode: metadata.gridCode,
    title: '50m 격자',
    score: metadata.score,
    scoreLabel: `${metadata.score}점`,
    level: metadata.level,
    levelLabel: metadata.levelLabel,
    slotLabel: formatSlotRange(metadata.slotStart, metadata.slotEnd),
  };
}

export function reconcileSelectedMockCrowdingGrid(grids, selectedGridCode) {
  const normalizedGridCode = validText(selectedGridCode);
  if (!normalizedGridCode || !Array.isArray(grids)) return null;
  const selectedGrid = grids.find((grid) => validText(grid?.gridCode) === normalizedGridCode);
  return selectedGrid ? toMockCrowdingGridDetail(selectedGrid) : null;
}

export function getMockCrowdingGridDetailAtCoordinate(source, coordinate) {
  if (!source?.getFeaturesAtCoordinate || !Array.isArray(coordinate)) return null;
  const feature = source.getFeaturesAtCoordinate(coordinate)[0];
  return feature ? toMockCrowdingGridDetail(feature.getProperties()) : null;
}

export function getMockCrowdingMarkerPresentation({ placeName, markerLabel, grid } = {}) {
  const safePlaceName = validText(placeName) || '장소';
  const hasMarkerLabel = markerLabel !== undefined && markerLabel !== null && markerLabel !== '';
  const baseLabel = hasMarkerLabel
    ? `${markerLabel}번 ${safePlaceName} 장소 보기`
    : `${safePlaceName} 장소 보기`;

  if (!grid) return { ariaLabel: baseLabel, className: '', levelLabel: null };

  try {
    const metadata = normalizeMetadata(grid);
    return {
      ariaLabel: `${baseLabel} · 혼잡도 ${metadata.levelLabel}`,
      className: `is-crowding-${metadata.level.toLowerCase().replaceAll('_', '-')}`,
      levelLabel: metadata.levelLabel,
    };
  } catch {
    return { ariaLabel: baseLabel, className: '', levelLabel: null };
  }
}

export function getSeoulCrowdingSlot(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError('A valid current time is required.');

  const shiftedTimestamp = timestamp + SEOUL_UTC_OFFSET_MS;
  const shiftedSlotStart = Math.floor(shiftedTimestamp / SLOT_DURATION_MS) * SLOT_DURATION_MS;
  const startTimestamp = shiftedSlotStart - SEOUL_UTC_OFFSET_MS;
  return {
    key: new Date(startTimestamp).toISOString(),
    requestAt: date.toISOString(),
    startTimestamp,
    endTimestamp: startTimestamp + SLOT_DURATION_MS,
  };
}

export function createLatestViewportRequest() {
  let activeController = null;
  let generation = 0;

  function abort() {
    generation += 1;
    activeController?.abort();
    activeController = null;
  }

  async function run(load, apply, onError) {
    activeController?.abort();
    const controller = new AbortController();
    const requestGeneration = ++generation;
    activeController = controller;

    try {
      const response = await load(controller.signal);
      if (controller.signal.aborted || requestGeneration !== generation) {
        return { status: 'stale' };
      }
      apply(response);
      return { status: 'applied' };
    } catch (error) {
      if (controller.signal.aborted || requestGeneration !== generation || error?.name === 'AbortError') {
        return { status: 'aborted' };
      }
      onError?.(error);
      return { status: 'error', error };
    } finally {
      if (activeController === controller) activeController = null;
    }
  }

  return { abort, run };
}

export function createViewportLoadGate() {
  let lastSignature = '';

  function shouldLoad(bounds) {
    const values = [bounds?.minLat, bounds?.maxLat, bounds?.minLng, bounds?.maxLng]
      .map(Number);
    if (!values.every(Number.isFinite)) return false;

    const signature = values.map((value) => value.toFixed(7)).join(':');
    if (signature === lastSignature) return false;
    lastSignature = signature;
    return true;
  }

  function reset() {
    lastSignature = '';
  }

  return { reset, shouldLoad };
}
