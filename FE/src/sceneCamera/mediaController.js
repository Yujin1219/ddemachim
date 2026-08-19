const REAR_CONSTRAINTS = Object.freeze({ video: { facingMode: { ideal: 'environment' } }, audio: false });
const FALLBACK_CONSTRAINTS = Object.freeze({ video: true, audio: false });

function stopTracks(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export function createCameraController({
  mediaDevices = globalThis.navigator?.mediaDevices,
  isSecureContext = globalThis.isSecureContext,
  metadataTimeoutMs = 8000,
  onStop = () => {},
} = {}) {
  let generation = 0;
  let currentStream = null;
  let currentId = null;
  let videoElement = null;
  let cancelPendingVideoBinding = null;
  let videoBindingGeneration = 0;
  let endedBindings = [];
  let disposed = false;

  function cancelCurrentVideoBinding() {
    const cancel = cancelPendingVideoBinding;
    cancelPendingVideoBinding = null;
    cancel?.();
  }

  function cancelVideoBinding() {
    videoBindingGeneration += 1;
    cancelCurrentVideoBinding();
  }

  function detachCurrent(reason, notify = true) {
    cancelVideoBinding();
    endedBindings.forEach(([track, listener]) => track.removeEventListener?.('ended', listener));
    endedBindings = [];
    if (currentStream) stopTracks(currentStream);
    currentStream = null;
    currentId = null;
    if (videoElement) videoElement.srcObject = null;
    if (notify) onStop(reason);
  }

  function stop(reason = 'close') {
    generation += 1;
    detachCurrent(reason);
  }

  function requestStream() {
    if (isSecureContext === false) return Promise.reject(Object.assign(new Error('카메라는 HTTPS 보안 연결에서만 사용할 수 있어요.'), { name: 'SecurityError' }));
    if (!mediaDevices?.getUserMedia) return Promise.reject(Object.assign(new Error('이 브라우저는 카메라를 지원하지 않아요.'), { name: 'NotSupportedError' }));
    let request;
    try {
      request = mediaDevices.getUserMedia(REAR_CONSTRAINTS);
    } catch (error) {
      return Promise.reject(error);
    }
    return Promise.resolve(request).catch((error) => {
      if (error?.name !== 'OverconstrainedError') throw error;
      return mediaDevices.getUserMedia(FALLBACK_CONSTRAINTS);
    });
  }

  function start(id) {
    disposed = false;
    const token = ++generation;
    detachCurrent('retry', false);
    currentId = id;
    const request = requestStream();
    return request.then((stream) => {
      if (disposed || token !== generation || currentId !== id) {
        stopTracks(stream);
        return null;
      }
      currentStream = stream;
      endedBindings = stream.getTracks().map((track) => {
        const listener = () => stop('ended');
        track.addEventListener?.('ended', listener, { once: true });
        return [track, listener];
      });
      return stream;
    });
  }

  async function bindVideo(video) {
    const bindingToken = ++videoBindingGeneration;
    cancelCurrentVideoBinding();
    videoElement = video;
    if (!video || !currentStream) return null;
    video.srcObject = currentStream;
    video.muted = true;
    video.playsInline = true;
    try {
      if (!(video.videoWidth > 0 && video.videoHeight > 0)) {
        await new Promise((resolve, reject) => {
          let timeout;
          const loaded = () => { cleanup(); resolve(); };
          const failed = () => { cleanup(); reject(new Error('카메라 화면을 준비하지 못했어요.')); };
          const cancelled = () => {
            cleanup();
            reject(Object.assign(new Error('카메라 준비가 중단됐어요.'), { name: 'AbortError' }));
          };
          const cleanup = () => {
            clearTimeout(timeout);
            video.removeEventListener('loadedmetadata', loaded);
            video.removeEventListener('error', failed);
            if (cancelPendingVideoBinding === cancelled) cancelPendingVideoBinding = null;
          };
          cancelPendingVideoBinding = cancelled;
          video.addEventListener('loadedmetadata', loaded, { once: true });
          video.addEventListener('error', failed, { once: true });
          timeout = setTimeout(() => {
            cleanup();
            reject(Object.assign(new Error('카메라 화면 준비 시간이 초과됐어요.'), { name: 'TimeoutError' }));
          }, metadataTimeoutMs);
        });
      }
      await new Promise((resolve, reject) => {
        let settled = false;
        let timeout;
        const finish = (settle, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (cancelPendingVideoBinding === cancelled) cancelPendingVideoBinding = null;
          settle(value);
        };
        const cancelled = () => finish(reject, Object.assign(new Error('카메라 재생 준비가 중단됐어요.'), { name: 'AbortError' }));
        cancelPendingVideoBinding = cancelled;
        timeout = setTimeout(() => finish(reject, Object.assign(new Error('카메라 재생 준비 시간이 초과됐어요.'), { name: 'TimeoutError' })), metadataTimeoutMs);
        Promise.resolve().then(() => video.play()).then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error),
        );
      });
      if (!(video.videoWidth > 0 && video.videoHeight > 0)) throw new Error('카메라 크기를 확인하지 못했어요.');
      return { width: video.videoWidth, height: video.videoHeight };
    } catch (error) {
      if (error?.name === 'AbortError' || bindingToken !== videoBindingGeneration) throw error;
      detachCurrent('bind-failed');
      throw error;
    }
  }

  return {
    start,
    bindVideo,
    cancelVideoBinding,
    stop,
    handleVisibilityChange(hidden) { if (hidden) stop('hidden'); },
    handlePageHide() { stop('pagehide'); },
    dispose() { disposed = true; stop('unmount'); },
    getStream: () => currentStream,
    getVideo: () => videoElement,
    getId: () => currentId,
  };
}
