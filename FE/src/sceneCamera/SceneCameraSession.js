import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { captureVideoFrame } from './canvas.js';
import { resultGuardDestination, startCameraGesture } from './flow.js';
import { createCameraController } from './mediaController.js';
import { createObjectUrlOwner } from './objectUrlOwner.js';
import { LOCAL_REFERENCE_STILLS, preflightReference, resolveReferenceStill } from './reference.js';
import { createSceneSession, sceneCameraReducer } from './sessionReducer.js';
import { attemptFileShare, startFileDownload } from './share.js';

const SceneCameraContext = createContext(null);
const h = React.createElement;

/**
 * HTMLVideoElement frames and videoWidth/videoHeight are browser-decoded,
 * presentation-upright pixels. This app has no trustworthy source-frame sensor
 * metadata, so screen.orientation must not be used to guess a pixel transform.
 */
export const BROWSER_DECODED_VIDEO_ROTATION = 0;

function normalizeCameraError(error) {
  const messages = {
    NotAllowedError: '카메라 권한이 거부됐어요. 브라우저 설정에서 허용한 뒤 다시 시도해주세요.',
    NotFoundError: '사용할 수 있는 카메라를 찾지 못했어요.',
    NotReadableError: '다른 앱이 카메라를 사용 중일 수 있어요.',
    NotSupportedError: '이 브라우저에서는 카메라를 사용할 수 없어요.',
  };
  return { code: error?.name || 'camera-error', message: messages[error?.name] || error?.message || '카메라를 시작하지 못했어요.' };
}

export function SceneCameraProvider({
  children,
  screen,
  routeId,
  referenceMap = LOCAL_REFERENCE_STILLS,
  mediaDevices,
  preflight = preflightReference,
  captureFrame = captureVideoFrame,
  objectUrlApi,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  cameraOptions,
}) {
  const [state, dispatch] = useReducer(sceneCameraReducer, undefined, createSceneSession);
  const [referenceStatus, setReferenceStatus] = useState('idle');
  const referenceImageRef = useRef(null);
  const referenceReadyRef = useRef(false);
  const currentSceneIdRef = useRef(null);
  const pendingCameraRef = useRef(null);
  const operationRef = useRef(0);
  const preflightRef = useRef(0);
  const restoreEntryFocusRef = useRef(false);
  const redirectNoticeRef = useRef(null);
  const previousRouteRef = useRef(null);
  const ownerRef = useRef(null);
  if (!ownerRef.current) ownerRef.current = createObjectUrlOwner(objectUrlApi);
  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createCameraController({
      mediaDevices,
      ...cameraOptions,
      onStop: (reason) => {
        if (['ended', 'hidden', 'pagehide'].includes(reason)) {
          dispatch({ type: 'ERROR', token: operationRef.current, error: { code: reason, message: '카메라가 중단됐어요. 버튼을 눌러 다시 켜주세요.' } });
        }
      },
    });
  }

  const prepareReference = useCallback(async (id, { force = false } = {}) => {
    if (!force && currentSceneIdRef.current === id) return { status: referenceReadyRef.current ? 'ready' : 'pending' };
    const attempt = ++preflightRef.current;
    operationRef.current += 1;
    pendingCameraRef.current = null;
    controllerRef.current.stop('new-scene');
    ownerRef.current.clear();
    referenceImageRef.current = null;
    referenceReadyRef.current = false;
    currentSceneIdRef.current = id;
    setReferenceStatus('checking');
    const metadata = resolveReferenceStill(id, referenceMap);
    dispatch({ type: 'BEGIN_SCENE', id, reference: metadata });
    if (!metadata) {
      setReferenceStatus('missing');
      return { status: 'missing' };
    }
    try {
      const result = await preflight(metadata);
      if (attempt !== preflightRef.current) return { status: 'stale' };
      referenceImageRef.current = result.image;
      referenceReadyRef.current = true;
      setReferenceStatus('ready');
      dispatch({ type: 'REFERENCE_READY' });
      return { status: 'ready' };
    } catch (error) {
      if (attempt !== preflightRef.current) return { status: 'stale' };
      setReferenceStatus(error?.code || 'missing');
      dispatch({ type: 'ERROR', error: { code: error?.code || 'reference-error', message: error?.message || '참고 장면을 확인하지 못했어요.' } });
      return { status: 'error', error };
    }
  }, [preflight, referenceMap]);

  const startCamera = useCallback((id, navigate) => startCameraGesture({
    id,
    isReferenceReady: referenceReadyRef.current,
    controller: controllerRef.current,
    onStarting: (pending) => {
      restoreEntryFocusRef.current = true;
      const token = ++operationRef.current;
      pendingCameraRef.current = pending;
      dispatch({ type: 'PREPARE_CAMERA', token });
      pending.catch((error) => dispatch({ type: 'ERROR', token, error: normalizeCameraError(error) }));
    },
    navigate,
  }), []);

  const bindVideo = useCallback(async (video) => {
    const token = operationRef.current;
    try {
      const stream = await pendingCameraRef.current;
      if (!stream || token !== operationRef.current) return null;
      const dimensions = await controllerRef.current.bindVideo(video);
      if (token === operationRef.current) dispatch({ type: 'CAMERA_READY', token });
      return dimensions;
    } catch (error) {
      if (error?.name !== 'AbortError' && token === operationRef.current) dispatch({ type: 'ERROR', token, error: normalizeCameraError(error) });
      return null;
    }
  }, []);

  const cancelVideoBinding = useCallback(() => {
    controllerRef.current.cancelVideoBinding();
  }, []);

  const capture = useCallback(async () => {
    const token = operationRef.current;
    dispatch({ type: 'CAPTURING', token });
    try {
      const result = await captureFrame(controllerRef.current.getVideo(), { rotation: BROWSER_DECODED_VIDEO_ROTATION });
      if (token !== operationRef.current) return null;
      controllerRef.current.stop('capture');
      const objectUrl = ownerRef.current.replace(result.blob);
      const captured = { ...result, objectUrl };
      dispatch({ type: 'CAPTURED', token, captured });
      return captured;
    } catch (error) {
      if (token !== operationRef.current) return null;
      dispatch({ type: 'ERROR', token, error: { code: 'capture-failed', message: '사진을 만들지 못했어요. 카메라 화면을 확인하고 다시 촬영해주세요.' } });
      return null;
    }
  }, [captureFrame]);

  const close = useCallback(() => {
    preflightRef.current += 1;
    operationRef.current += 1;
    controllerRef.current.stop('close');
    ownerRef.current.clear();
    referenceImageRef.current = null;
    referenceReadyRef.current = false;
    currentSceneIdRef.current = null;
    setReferenceStatus('idle');
    dispatch({ type: 'CLOSE' });
  }, []);

  const retake = useCallback((id, navigate) => {
    if (!referenceReadyRef.current) return null;
    const pending = controllerRef.current.start(id);
    const token = ++operationRef.current;
    pendingCameraRef.current = pending;
    ownerRef.current.clear();
    dispatch({ type: 'RETAKE', id });
    dispatch({ type: 'PREPARE_CAMERA', token });
    pending.catch((error) => dispatch({ type: 'ERROR', token, error: normalizeCameraError(error) }));
    navigate('camera', id);
    return pending;
  }, []);

  const shareCapture = useCallback(async () => {
    if (!state.captured?.blob) throw new Error('저장할 촬영 사진이 없어요.');
    return attemptFileShare(state.captured.blob, { filename: `scene-camera-${state.filmingLocationId}.png` });
  }, [state.captured, state.filmingLocationId]);

  const consumeCameraEntryFocus = useCallback(() => {
    const shouldRestore = restoreEntryFocusRef.current;
    restoreEntryFocusRef.current = false;
    return shouldRestore;
  }, []);

  const setRedirectNotice = useCallback((notice) => {
    redirectNoticeRef.current = notice;
  }, []);

  const consumeRedirectNotice = useCallback(() => {
    const notice = redirectNoticeRef.current;
    redirectNoticeRef.current = null;
    return notice;
  }, []);

  useEffect(() => {
    const nextRoute = { screen, id: routeId };
    if (shouldResetSceneSession(previousRouteRef.current, nextRoute)) {
      preflightRef.current += 1;
      operationRef.current += 1;
      pendingCameraRef.current = null;
      controllerRef.current.stop('route-departure');
      ownerRef.current.clear();
      referenceImageRef.current = null;
      referenceReadyRef.current = false;
      currentSceneIdRef.current = null;
      setReferenceStatus('idle');
      dispatch({ type: 'CLOSE' });
    }
    previousRouteRef.current = nextRoute;
  }, [routeId, screen]);

  useEffect(() => {
    const onPageHide = () => controllerRef.current.handlePageHide();
    const onVisibility = () => controllerRef.current.handleVisibilityChange(documentTarget?.hidden);
    windowTarget?.addEventListener('pagehide', onPageHide);
    documentTarget?.addEventListener('visibilitychange', onVisibility);
    return () => {
      windowTarget?.removeEventListener('pagehide', onPageHide);
      documentTarget?.removeEventListener('visibilitychange', onVisibility);
      preflightRef.current += 1;
      operationRef.current += 1;
      currentSceneIdRef.current = null;
      controllerRef.current.dispose();
      ownerRef.current.clear();
    };
  }, [documentTarget, windowTarget]);

  const value = useMemo(() => ({
    state,
    dispatch,
    referenceStatus,
    referenceReady: referenceReadyRef.current,
    prepareReference,
    startCamera,
    bindVideo,
    cancelVideoBinding,
    capture,
    close,
    retake,
    shareCapture,
    consumeCameraEntryFocus,
    setRedirectNotice,
    consumeRedirectNotice,
    downloadFile: startFileDownload,
  }), [bindVideo, cancelVideoBinding, capture, close, consumeCameraEntryFocus, consumeRedirectNotice, prepareReference, referenceStatus, retake, setRedirectNotice, shareCapture, startCamera, state]);

  return h(SceneCameraContext.Provider, { value }, children);
}

export function useSceneCamera() {
  const value = useContext(SceneCameraContext);
  if (!value) throw new Error('useSceneCamera must be used inside SceneCameraProvider');
  return value;
}

export function shouldResetSceneSession(previous, next) {
  if (!previous || (previous.screen === next.screen && previous.id === next.id)) return false;
  const sameScene = previous.id != null && String(previous.id) === String(next.id);
  if (sameScene && previous.screen === 'scene-detail' && next.screen === 'camera') return false;
  if (sameScene && previous.screen === 'camera' && next.screen === 'shot-result') return false;
  if (sameScene && previous.screen === 'shot-result' && next.screen === 'camera') return false;
  return true;
}

export function SceneCameraVideo({ videoRef: providedVideoRef, ...props }) {
  const { state, bindVideo, cancelVideoBinding } = useSceneCamera();
  const internalVideoRef = useRef(null);
  const videoRef = providedVideoRef || internalVideoRef;
  useEffect(() => {
    bindVideo(videoRef.current);
    return cancelVideoBinding;
  }, [bindVideo, cancelVideoBinding, state.token]);
  return h('video', { ...props, ref: videoRef, autoPlay: true, muted: true, playsInline: true, 'aria-hidden': true });
}

export function SceneResultRouteGuard({ id, captured, go }) {
  const { setRedirectNotice } = useSceneCamera();
  useEffect(() => {
    const destination = resultGuardDestination({ id, captured });
    if (!destination) return;
    setRedirectNotice(destination.notice);
    go(destination.screen, destination.id, { replace: true });
  }, [captured, go, id, setRedirectNotice]);
  return null;
}

export function SceneCameraRedirectNotice() {
  const { consumeRedirectNotice } = useSceneCamera();
  const [notice] = useState(() => consumeRedirectNotice());
  if (!notice) return null;
  const message = notice === 'capture-missing'
    ? '촬영 결과가 이 기기에 남아 있지 않아 장면 화면으로 돌아왔어요.'
    : '촬영할 장면을 다시 선택해주세요.';
  return h('p', { className: 'scene-camera-notice', role: 'status' }, message);
}
