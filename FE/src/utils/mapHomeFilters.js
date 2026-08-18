export const MAP_HOME_FILTERS = Object.freeze([
  { key: 'ALL', label: '전체', type: 'all', tone: 'all' },
  { key: 'FILMING', label: '촬영지', type: 'tag', code: 'FILMING_LOCATION', tone: 'filming' },
  { key: 'HOT', label: 'HOT', type: 'hot', tone: 'hot' },
  { key: 'POPUP', label: '팝업', type: 'mixed', code: 'POPUP', tone: 'popup' },
  { key: 'EVENT', label: '전시·행사', type: 'mixed', code: 'EXHIBITION', tone: 'event' },
  { key: 'RESTAURANT', label: '음식점', type: 'category', code: 'RESTAURANT', tone: 'restaurant' },
  { key: 'CAFE_DESSERT', label: '카페·디저트', type: 'category', codes: ['CAFE', 'DESSERT'], tone: 'cafe-dessert' },
]);

export const SELECTABLE_MAP_HOME_FILTERS = Object.freeze(
  MAP_HOME_FILTERS.filter((filter) => filter.key !== 'ALL'),
);

const SELECTABLE_MAP_HOME_FILTER_KEYS = SELECTABLE_MAP_HOME_FILTERS.map((filter) => filter.key);

export function areAllMapFiltersSelected(selectedKeys) {
  const selected = new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
  return SELECTABLE_MAP_HOME_FILTER_KEYS.every((key) => selected.has(key));
}

export function toggleMapFilterSelection(selectedKeys, filterKey) {
  const selected = new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
  if (filterKey === 'ALL') return areAllMapFiltersSelected(selectedKeys) ? [] : [...SELECTABLE_MAP_HOME_FILTER_KEYS];
  if (!SELECTABLE_MAP_HOME_FILTER_KEYS.includes(filterKey)) return [...selected];

  if (selected.has(filterKey)) selected.delete(filterKey);
  else selected.add(filterKey);
  return SELECTABLE_MAP_HOME_FILTER_KEYS.filter((key) => selected.has(key));
}

export function tagMapItemsForFilter(items, filterKey) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => item?.mapCategoryKey ? item : { ...item, mapCategoryKey: filterKey });
}

const MAP_FILTER_MARKER_TONES = Object.freeze({
  FILMING: 'filming',
  HOT: 'hot',
  POPUP: 'popup',
  EVENT: 'event',
  RESTAURANT: 'restaurant',
  CAFE_DESSERT: 'cafe-dessert',
});

export function resolveMapMarkerTone(place = {}) {
  if (place.externalSource === 'KAKAO') return 'search';
  const selectedTone = MAP_FILTER_MARKER_TONES[String(place.mapCategoryKey || '').toUpperCase()];
  if (selectedTone) return selectedTone;

  const normalize = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');
  const tags = Array.isArray(place.tags)
    ? place.tags.map((tag) => normalize(typeof tag === 'string' ? tag : tag?.code))
    : [normalize(place.tags)];
  if (tags.includes('FILMING_LOCATION')) return 'filming';

  const categoryCode = normalize(place.categoryCode);
  if (categoryCode === 'RESTAURANT') return 'restaurant';
  if (categoryCode === 'CAFE' || categoryCode === 'DESSERT') return 'cafe-dessert';
  if (categoryCode === 'ATTRACTION') return 'attraction';
  if (categoryCode === 'CULTURE') return 'culture';
  if (categoryCode === 'EXHIBITION') return 'event';
  if (categoryCode === 'SHOPPING') return 'shopping';
  if (categoryCode === 'POPUP') return 'popup';
  if (categoryCode === 'PARK') return 'park';
  if (categoryCode === 'WALK') return 'walk';
  if (categoryCode === 'PHOTO_SPOT') return 'photo-spot';
  return 'default';
}

export function resolveMapClusterTone(places) {
  const tones = new Set((Array.isArray(places) ? places : []).map(resolveMapMarkerTone));
  if (tones.size === 1) return [...tones][0];
  return 'mixed';
}

export function mapFilterApiParams(filter) {
  if (filter?.type === 'tag') return { tag: filter.code };
  if (filter?.type === 'category' || filter?.type === 'mixed') {
    return { category: filter.codes?.join(',') || filter.code };
  }
  return {};
}

export function resolveCongestionPreference(storedValue) {
  return storedValue === 'on';
}

function isPopupEvent(event) {
  const searchable = `${event?.eventType || ''} ${event?.title || ''}`.toUpperCase();
  return searchable.includes('POPUP') || searchable.includes('팝업');
}

function hasCoordinates(item) {
  if (item?.latitude === null || item?.latitude === undefined || item?.latitude === '') return false;
  if (item?.longitude === null || item?.longitude === undefined || item?.longitude === '') return false;
  return Number.isFinite(Number(item?.latitude)) && Number.isFinite(Number(item?.longitude));
}

export function mapEventsForFilter(events, filterKey) {
  if (!Array.isArray(events)) return [];
  if (filterKey === 'POPUP') return events.filter((event) => hasCoordinates(event) && isPopupEvent(event));
  if (filterKey === 'EVENT') return events.filter((event) => hasCoordinates(event) && !isPopupEvent(event));
  return [];
}

function cleanEventTitle(title) {
  const trimmed = String(title || '').trim();
  return trimmed.replace(/^(?:\[[^\]]*\]\s*)+/, '').trim() || trimmed;
}

export function eventToMapMarker(event) {
  const popup = isPopupEvent(event);
  return {
    id: `event:${event.id}`,
    eventId: event.id,
    externalSource: 'EVENT',
    name: cleanEventTitle(event.title),
    categoryCode: popup ? 'POPUP' : 'EXHIBITION',
    categoryLabel: popup ? '팝업' : '전시·행사',
    roadAddress: event.venueName || event.placeName || '',
    latitude: Number(event.latitude),
    longitude: Number(event.longitude),
    imageUrl: event.mainImage || null,
    tags: [],
  };
}
