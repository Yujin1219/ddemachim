const DEFAULT_ARRIVAL_RADIUS_METERS = 80;

function coordinatesOf(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export function distanceMeters(from, to) {
  const start = coordinatesOf(from);
  const end = coordinatesOf(to);
  if (!start || !end) return null;
  const radians = (value) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(end.latitude - start.latitude);
  const longitudeDelta = radians(end.longitude - start.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(start.latitude)) * Math.cos(radians(end.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearbyFilmingPlace(currentLocation, places, radiusMeters = DEFAULT_ARRIVAL_RADIUS_METERS) {
  return (Array.isArray(places) ? places : []).reduce((closest, place) => {
    const distance = distanceMeters(currentLocation, place);
    if (distance === null || distance > radiusMeters || (closest && closest.distance <= distance)) return closest;
    return { ...place, distance };
  }, null);
}

export function uniqueFilmingWorks(locations) {
  const seen = new Set();
  return (Array.isArray(locations) ? locations : []).flatMap((location) => {
    const work = location?.mediaContent;
    const id = work?.id;
    const title = typeof work?.title === 'string' ? work.title.trim() : '';
    if (!id || !title || seen.has(String(id))) return [];
    seen.add(String(id));
    return [{ id, title }];
  });
}
