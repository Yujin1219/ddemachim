// Vite replaces BASE_URL at build time; Node tests retain the local root default.
export function withBasePath(path, base = import.meta.env?.BASE_URL || '/') {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return path;
  const prefix = base.replace(/\/$/, '');
  if (!prefix || path === prefix || path.startsWith(`${prefix}/`)) return path;
  return `${prefix}${path}`;
}
