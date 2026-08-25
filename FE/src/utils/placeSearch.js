export const SEARCH_LOCATION_TIMEOUT_MS = 3500;
export const SEARCH_LOCATION_MAXIMUM_AGE_MS = 300000;

const SEARCHABLE_ITEM_FIELDS = [
  'name',
  'title',
  'meta',
  'badge',
  'searchText',
  'venueName',
  'placeName',
  'eventType',
  'categoryName',
];

function normalizeSearchToken(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^0-9a-z가-힣]/gi, '');
}

export function filterSearchItems(items, query) {
  const source = Array.isArray(items) ? items : [];
  const tokens = String(query ?? '')
    .trim()
    .split(/\s+/)
    .map(normalizeSearchToken)
    .filter(Boolean);
  if (!tokens.length) return source;

  return source.filter((item) => {
    const searchableText = normalizeSearchToken([
      ...SEARCHABLE_ITEM_FIELDS.map((field) => item?.[field]),
      item?.labels?.content,
      item?.labels?.category,
    ].filter(Boolean).join(' '));
    return tokens.every((token) => searchableText.includes(token));
  });
}

export async function searchExploreCatalog(query, {
  fetchPlaces,
  fetchFilmingWorks,
  fetchEvents,
  signal,
  size = 50,
} = {}) {
  const keyword = String(query ?? '').trim();
  if (!keyword) {
    return { places: [], works: [], events: [], hasPartialError: false };
  }

  const requests = [
    fetchPlaces({ keyword, page: 0, size, signal }),
    fetchFilmingWorks({ keyword, page: 0, size, signal }),
    fetchEvents({ keyword, status: 'ONGOING', page: 0, size, signal }),
  ];
  const [places, works, events] = await Promise.allSettled(requests);

  if (signal?.aborted) {
    const error = new Error('Explore search aborted');
    error.name = 'AbortError';
    throw error;
  }

  const outcomes = [places, works, events];
  if (outcomes.every((outcome) => outcome.status === 'rejected')) {
    throw new AggregateError(outcomes.map((outcome) => outcome.reason), 'Explore search failed');
  }

  const contentOf = (outcome) => outcome.status === 'fulfilled' && Array.isArray(outcome.value?.content)
    ? filterSearchItems(outcome.value.content, keyword)
    : [];
  return {
    places: contentOf(places),
    works: contentOf(works),
    events: contentOf(events),
    hasPartialError: outcomes.some((outcome) => outcome.status === 'rejected'),
  };
}

export function rankSearchItems(items, query) {
  const source = Array.isArray(items) ? items : [];
  const normalizedQuery = normalizeSearchToken(query);
  if (!normalizedQuery) return source;

  return source
    .map((item, sourceIndex) => {
      const normalizedName = normalizeSearchToken(item?.name ?? item?.title);
      const relevance = normalizedName === normalizedQuery
        ? 4
        : normalizedName.startsWith(normalizedQuery)
          ? 3
          : normalizedName.includes(normalizedQuery)
            ? 2
            : filterSearchItems([item], query).length > 0
              ? 1
              : 0;
      return { item, relevance, sourceIndex };
    })
    .sort((left, right) => right.relevance - left.relevance || left.sourceIndex - right.sourceIndex)
    .map(({ item }) => item);
}

function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('Search location request aborted', 'AbortError');
  }
  const error = new Error('Search location request aborted');
  error.name = 'AbortError';
  return error;
}

function normalizeCoordinates(position) {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function getSearchCoordinates({
  geolocation = typeof navigator === 'undefined' ? null : navigator.geolocation,
  signal,
  timeoutMs = SEARCH_LOCATION_TIMEOUT_MS,
  maximumAge = SEARCH_LOCATION_MAXIMUM_AGE_MS,
} = {}) {
  if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
    return Promise.resolve(null);
  }
  if (signal?.aborted) return Promise.reject(createAbortError());

  const boundedTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) >= 0
    ? Number(timeoutMs)
    : SEARCH_LOCATION_TIMEOUT_MS;
  const cachedPositionAge = Number.isFinite(Number(maximumAge)) && Number(maximumAge) >= 0
    ? Number(maximumAge)
    : SEARCH_LOCATION_MAXIMUM_AGE_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', handleAbort);
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const handleAbort = () => settle(reject, createAbortError());

    signal?.addEventListener('abort', handleAbort, { once: true });
    timeoutId = setTimeout(() => settle(resolve, null), boundedTimeout);

    try {
      geolocation.getCurrentPosition(
        (position) => settle(resolve, normalizeCoordinates(position)),
        () => settle(resolve, null),
        {
          enableHighAccuracy: false,
          timeout: boundedTimeout,
          maximumAge: cachedPositionAge,
        },
      );
    } catch {
      settle(resolve, null);
    }
  });
}

function nullableDistanceMeters(value) {
  if (value === null || value === undefined || value === '') return null;
  const distance = Number(value);
  return Number.isFinite(distance) && distance >= 0 ? distance : null;
}

export function formatCurrentLocationDistance(distanceMeters) {
  const distance = nullableDistanceMeters(distanceMeters);
  if (distance === null) return null;
  if (distance < 1000) return `현재 위치에서 ${Math.round(distance)}m`;
  const distanceKilometers = Number((distance / 1000).toFixed(1));
  return `현재 위치에서 ${distanceKilometers}km`;
}

export function mapKakaoPlaceToSearchRow(place) {
  const distanceMeters = nullableDistanceMeters(place?.distanceMeters);
  const address = place?.roadAddress || place?.lotAddress || '주소 정보 없음';
  const distanceLabel = formatCurrentLocationDistance(distanceMeters);
  return {
    ...place,
    distanceMeters,
    id: `kakao:${place?.providerPlaceId}`,
    externalSource: 'KAKAO',
    showCongestion: false,
    meta: [distanceLabel, address].filter(Boolean).join(' · '),
    labels: {
      content: '카카오 검색',
      category: String(place?.categoryName || '').split('>').at(-1)?.trim() || '장소',
    },
  };
}

function hasValidCoordinates(place) {
  const latitudeValue = place?.latitude;
  const longitudeValue = place?.longitude;
  const hasValue = (value) => value !== null
    && value !== undefined
    && !(typeof value === 'string' && value.trim() === '');
  if (!hasValue(latitudeValue) || !hasValue(longitudeValue)) return false;

  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  return Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180;
}

export function mapKakaoPlaceToMapCard(place) {
  const address = place?.roadAddress || place?.lotAddress || '주소 정보 없음';
  return {
    ...place,
    meta: address,
    badge: '카카오 검색',
    externalSource: 'KAKAO',
    showCongestion: false,
  };
}
