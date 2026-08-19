export async function attemptFileShare(blob, {
  navigator = globalThis.navigator,
  fileFactory = (parts, name, options) => new File(parts, name, options),
  filename = 'scene-camera.png',
} = {}) {
  const file = fileFactory([blob], filename, { type: 'image/png' });
  const payload = { files: [file] };
  if (!navigator?.canShare?.(payload) || !navigator?.share) return { status: 'download-available', file };
  try {
    await navigator.share(payload);
    return { status: 'shared', file };
  } catch (error) {
    if (error?.name === 'AbortError') return { status: 'cancelled', file };
    return { status: 'download-available', file, error };
  }
}

export function startFileDownload(file, {
  createObjectURL = (value) => URL.createObjectURL(value),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  createAnchor = () => document.createElement('a'),
  schedule = (callback) => setTimeout(callback, 0),
} = {}) {
  const url = createObjectURL(file);
  const anchor = createAnchor();
  anchor.href = url;
  anchor.download = file.name || 'scene-camera.png';
  try {
    anchor.click();
    anchor.remove?.();
    schedule(() => revokeObjectURL(url));
    return { status: 'download-started' };
  } catch (error) {
    anchor.remove?.();
    revokeObjectURL(url);
    return { status: 'download-failed', error };
  }
}
