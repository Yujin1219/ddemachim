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
