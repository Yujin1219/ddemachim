function normalizeCoordinate(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  if (typeof value[0] !== 'number' || typeof value[1] !== 'number') return null;
  const longitude = value[0];
  const latitude = value[1];
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
}

export function routeFitPointCoordinates(values, project = (coordinate) => coordinate) {
  if (!Array.isArray(values)) return [];
  return values
    .map(normalizeCoordinate)
    .filter(Boolean)
    .map((coordinate) => project(coordinate))
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2);
}

export function routeLegFeatureSpecs(routeLegs, project = (coordinate) => coordinate) {
  if (!Array.isArray(routeLegs)) return [];

  return routeLegs
    .map((leg) => {
      const geometry = leg?.geometry;
      if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return null;
      const coordinates = geometry.coordinates.map(normalizeCoordinate);
      if (coordinates.length < 2 || coordinates.some((coordinate) => !coordinate)) return null;
      const projected = coordinates.map((coordinate) => project(coordinate));
      if (projected.some((coordinate) => !Array.isArray(coordinate) || coordinate.length < 2)) return null;
      return {
        coordinates: projected,
        mode: leg?.mode || null,
        routeName: leg?.routeName || null,
      };
    })
    .filter(Boolean);
}

export function lineStringLength(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return 0;
  return coordinates.slice(1).reduce((total, coordinate, index) => {
    const previous = coordinates[index];
    if (!Array.isArray(previous) || !Array.isArray(coordinate)) return total;
    const dx = Number(coordinate[0]) - Number(previous[0]);
    const dy = Number(coordinate[1]) - Number(previous[1]);
    return Number.isFinite(dx) && Number.isFinite(dy) ? total + Math.hypot(dx, dy) : total;
  }, 0);
}

export function partialLineString(coordinates, ratio) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  if (lineStringLength(coordinates) <= 0) return null;
  if (ratio >= 1) return coordinates.map((coordinate) => coordinate.slice());

  const target = lineStringLength(coordinates) * ratio;
  const result = [coordinates[0].slice()];
  let traversed = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    const dx = current[0] - previous[0];
    const dy = current[1] - previous[1];
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) continue;
    if (traversed + length >= target) {
      const segmentRatio = (target - traversed) / length;
      if (segmentRatio > 0) result.push([
        previous[0] + dx * segmentRatio,
        previous[1] + dy * segmentRatio,
      ]);
      return result;
    }
    result.push(current.slice());
    traversed += length;
  }
  return result;
}

export function chevronAnchors(coordinates, spacing, limit = 8) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !(spacing > 0) || !(limit > 0)) return [];
  const total = lineStringLength(coordinates);
  if (!(total > spacing * 1.5)) return [];
  const anchors = [];
  for (let distance = spacing; distance < total - spacing * 0.4 && anchors.length < limit; distance += spacing) {
    let traversed = 0;
    for (let index = 1; index < coordinates.length; index += 1) {
      const previous = coordinates[index - 1];
      const current = coordinates[index];
      const dx = current[0] - previous[0];
      const dy = current[1] - previous[1];
      const length = Math.hypot(dx, dy);
      if (!(length > 0)) continue;
      if (traversed + length >= distance) {
        const ratio = (distance - traversed) / length;
        anchors.push({
          coordinate: [previous[0] + dx * ratio, previous[1] + dy * ratio],
          rotation: -Math.atan2(dy, dx),
        });
        break;
      }
      traversed += length;
    }
  }
  return anchors;
}
