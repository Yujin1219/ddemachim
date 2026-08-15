function normalizeAreaCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function indexCongestionAreasByCode(areas) {
  return new globalThis.Map(
    (Array.isArray(areas) ? areas : [])
      .map((area) => [normalizeAreaCode(area?.areaCode), area])
      .filter(([areaCode]) => areaCode),
  );
}
