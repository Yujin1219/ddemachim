const EARTH_RADIUS_METERS = 6_371_000;

const radians = (degrees) => degrees * Math.PI / 180;

export function normalizeHeading(heading) {
  return ((heading % 360) + 360) % 360;
}

export function shortestHeadingDelta(from, to) {
  return ((normalizeHeading(to) - normalizeHeading(from) + 540) % 360) - 180;
}

export function rotationForHeading(heading, currentRotation = 0) {
  const targetRotation = -radians(normalizeHeading(heading));
  const fullTurn = Math.PI * 2;
  const delta = ((targetRotation - currentRotation + Math.PI * 3) % fullTurn) - Math.PI;
  return currentRotation + delta;
}

export function navigationViewCenter({ coordinate, size, resolution, rotation, verticalRatio = 0.68 }) {
  const verticalOffset = (verticalRatio - 0.5) * size[1] * resolution;
  return [
    coordinate[0] - verticalOffset * Math.sin(rotation),
    coordinate[1] + verticalOffset * Math.cos(rotation),
  ];
}

export function distanceMeters(from, to) {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function bearingDegrees(from, to) {
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function resolveNavigationHeading({
  previousFix,
  currentFix,
  previousHeading = null,
  minDistanceMeters = 3,
  minHeadingChange = 4,
  smoothing = 0.35,
  maxHeadingStep = 35,
}) {
  const movedMeters = previousFix ? distanceMeters(previousFix, currentFix) : 0;
  const rawHeading = Number(currentFix.heading);
  const speed = Number(currentFix.speed);
  const accuracy = Number(currentFix.accuracy);
  const hasReliableGpsHeading = currentFix.heading != null
    && Number.isFinite(rawHeading)
    && rawHeading >= 0
    && (currentFix.speed == null || (Number.isFinite(speed) && speed >= 0.4))
    && (currentFix.accuracy == null || (Number.isFinite(accuracy) && accuracy <= 50));
  if (!previousFix) {
    return hasReliableGpsHeading
      ? { heading: normalizeHeading(rawHeading), movedMeters, source: 'gps' }
      : { heading: previousHeading, movedMeters, source: 'held' };
  }
  if (movedMeters < minDistanceMeters) {
    return { heading: previousHeading, movedMeters, source: 'held' };
  }
  const candidate = hasReliableGpsHeading ? normalizeHeading(rawHeading) : bearingDegrees(previousFix, currentFix);
  const source = hasReliableGpsHeading ? 'gps' : 'bearing';
  if (!Number.isFinite(previousHeading)) return { heading: candidate, movedMeters, source };
  const delta = shortestHeadingDelta(previousHeading, candidate);
  if (Math.abs(delta) < minHeadingChange) return { heading: previousHeading, movedMeters, source: 'held' };
  const smoothedStep = Math.max(-maxHeadingStep, Math.min(maxHeadingStep, delta * smoothing));
  return {
    heading: normalizeHeading(previousHeading + smoothedStep),
    movedMeters,
    source,
  };
}
