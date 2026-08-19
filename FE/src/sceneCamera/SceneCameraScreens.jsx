import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp, X } from 'lucide-react';

import { createOverlayGesture } from './gesture.js';
import { createSceneGeometry, geometryToCssVars } from './geometry.js';
import { normalizeFilmingLocationId } from './routes.js';
import { SceneCameraRedirectNotice, SceneCameraVideo, SceneResultRouteGuard, useSceneCamera } from './SceneCameraSession.js';
import { AutoFocusHeading, BeforeAfterComparison, BlockingAlert, OverlayControls, SceneReferenceGate } from './ui.js';

export function SceneDetailCameraPanel({ id, go }) {
  const normalizedId = normalizeFilmingLocationId(id);
  const { state, referenceStatus, prepareReference, startCamera, consumeCameraEntryFocus } = useSceneCamera();
  const entryButtonRef = useRef(null);

  useEffect(() => {
    if (normalizedId && referenceStatus === 'idle') prepareReference(normalizedId);
  }, [normalizedId, prepareReference, referenceStatus]);

  useEffect(() => {
    if (referenceStatus === 'ready' && state.flowState === 'idle' && consumeCameraEntryFocus()) entryButtonRef.current?.focus();
  }, [consumeCameraEntryFocus, referenceStatus, state.flowState]);

  if (!normalizedId) {
    return <BlockingAlert className="scene-reference-gate is-error" title="촬영할 장면을 다시 선택해주세요" message="촬영지 장면 ID가 없어 카메라를 안전하게 시작할 수 없어요."><button type="button" className="ui-button secondary" onClick={() => go('filming-locations')}>촬영지 찾기</button></BlockingAlert>;
  }

  return <>
    <SceneCameraRedirectNotice />
    <SceneReferenceGate
      status={referenceStatus === 'idle' ? 'checking' : referenceStatus}
      error={state.error?.message}
      buttonRef={entryButtonRef}
      onRetry={() => prepareReference(normalizedId, { force: true })}
      onStart={() => startCamera(normalizedId, go)}
    />
  </>;
}

export function SceneCameraScreen({ id, go }) {
  const normalizedId = normalizeFilmingLocationId(id);
  const { state, referenceReady, capture, close, startCamera, dispatch } = useSceneCamera();
  const [controlsOpen, setControlsOpen] = useState(false);
  const stageRef = useRef(null);
  const gestureRef = useRef(null);
  const overlayRef = useRef(state.overlay);
  overlayRef.current = state.overlay;
  if (!gestureRef.current) {
    gestureRef.current = createOverlayGesture({
      getOverlay: () => overlayRef.current,
      getBounds: () => stageRef.current?.getBoundingClientRect(),
      onPatch: (patch) => dispatch({ type: 'SET_OVERLAY', patch }),
    });
  }

  useEffect(() => {
    if (!normalizedId || state.filmingLocationId !== normalizedId || !state.reference) {
      go('scene-detail', normalizedId, { replace: true });
      return undefined;
    }
    return undefined;
  }, [go, normalizedId, state.filmingLocationId, state.reference]);

  const cssVariables = useMemo(() => {
    if (!state.reference) return {};
    const plan = createSceneGeometry({ sourceWidth: state.reference.width, sourceHeight: state.reference.height, stageWidth: 1080, stageHeight: 1440, overlay: state.overlay });
    return geometryToCssVars(plan);
  }, [state.overlay, state.reference]);

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gestureRef.current.pointerDown(event);
  };

  const onPointerEnd = (event) => {
    gestureRef.current.pointerUp(event);
  };

  const handleClose = () => {
    close();
    go('scene-detail', normalizedId);
  };

  const handleCapture = async () => {
    const captured = await capture();
    if (captured) go('shot-result', normalizedId);
  };

  const canCapture = state.flowState === 'camera-ready' && referenceReady;
  const canRestart = referenceReady && !['preparing', 'camera-ready', 'capturing'].includes(state.flowState);
  return <section className="phone scene-camera-screen" aria-labelledby="scene-camera-title">
    <header className="scene-camera-header camera-safe-top">
      <button type="button" aria-label="카메라 닫기" onClick={handleClose}><X aria-hidden="true" size={22} strokeWidth={2} /></button>
      <AutoFocusHeading id="scene-camera-title">장면 구도 맞추기</AutoFocusHeading>
      <button type="button" aria-label="촬영 도움말 및 참고 장면 조절" aria-expanded={controlsOpen} aria-controls="scene-camera-help" onClick={() => setControlsOpen((open) => !open)}><CircleHelp aria-hidden="true" size={22} strokeWidth={2} /></button>
    </header>
    <div className="scene-camera-workspace">
      <div
        ref={stageRef}
        className="scene-camera-stage"
        style={cssVariables}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => gestureRef.current.pointerMove(event)}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <SceneCameraVideo className="scene-camera-video" />
        {state.reference && state.overlay.visible && <img className="scene-camera-overlay" src={state.reference.url} alt="" draggable="false" aria-hidden="true" />}
      </div>
      {state.reference && <article className="scene-camera-reference-card" aria-label="촬영 참고 장면">
        <img src={state.reference.url} alt={state.reference.altText} />
        <div><strong>참고 장면</strong><span>같은 위치와 시선으로 맞춰보세요</span><small>참고 이미지 · 장면 1</small></div>
      </article>}
      <section id="scene-camera-help" className="scene-camera-help-panel" aria-label="촬영 도움말 및 참고 장면 조절" hidden={!controlsOpen}>
        <p className="scene-camera-instruction"><strong>같은 시선으로 장면을 다시 담아보세요.</strong><span>참고 이미지를 드래그하거나 아래 버튼과 슬라이더로 위치, 크기, 불투명도를 조절할 수 있어요.</span></p>
        <OverlayControls overlay={state.overlay} onPatch={(patch) => dispatch({ type: 'SET_OVERLAY', patch })} onReset={() => dispatch({ type: 'RESET_OVERLAY' })} />
      </section>
      {state.error
        ? <BlockingAlert className="scene-camera-status" title="카메라를 준비하지 못했어요" message={state.error.message}>{canRestart && <button type="button" onClick={() => startCamera(normalizedId, () => {})}>카메라 다시 켜기</button>}</BlockingAlert>
        : <div className={`scene-camera-status${canCapture ? ' is-ready' : ''}`} role="status" aria-live="polite">{canCapture ? '카메라가 준비됐어요.' : canRestart ? '카메라가 꺼져 있어요. 다시 켜려면 버튼을 눌러주세요.' : '카메라 화면을 준비하고 있어요.'}{canRestart && <button type="button" onClick={() => startCamera(normalizedId, () => {})}>카메라 다시 켜기</button>}</div>}
    </div>
    <div className="scene-camera-shutter camera-safe-bottom">
      <span className="scene-camera-mode">장면 촬영</span>
      <button type="button" className="scene-camera-capture" aria-label={state.flowState === 'capturing' ? '장면 담는 중' : '현재 화면 촬영'} disabled={!canCapture || state.flowState === 'capturing'} onClick={handleCapture} />
      <span className="scene-camera-lens" aria-label="카메라 렌즈 배율 1배">1× 렌즈</span>
    </div>
  </section>;
}

export function SceneShotResultScreen({ id, go }) {
  const normalizedId = normalizeFilmingLocationId(id);
  const { state, dispatch, close, retake, shareCapture, downloadFile } = useSceneCamera();
  const [handoff, setHandoff] = useState({ status: 'idle', file: null, message: '' });

  const routeCapture = state.filmingLocationId === normalizedId ? state.captured : null;
  if (!normalizedId || !routeCapture || !state.reference) return <SceneResultRouteGuard id={normalizedId} captured={routeCapture} go={go} />;

  const handleClose = () => {
    close();
    go('scene-detail', normalizedId);
  };

  const handleShare = async () => {
    setHandoff({ status: 'working', file: null, message: '공유할 이미지를 만들고 있어요.' });
    try {
      const result = await shareCapture();
      if (result.status === 'shared') setHandoff({ status: 'shared', file: result.file, message: '공유를 완료했어요.' });
      else if (result.status === 'cancelled') setHandoff({ status: 'cancelled', file: result.file, message: '공유를 취소했어요. 결과는 그대로 유지돼요.' });
      else setHandoff({ status: 'download-available', file: result.file, message: result.error ? '공유하지 못했어요. 원하면 파일로 다운로드할 수 있어요.' : '이 브라우저에서는 파일 공유 대신 다운로드할 수 있어요.' });
    } catch {
      setHandoff({ status: 'error', file: null, message: '내보내기 이미지를 만들지 못했어요. 다시 시도해주세요.' });
    }
  };

  const handleDownload = () => {
    const result = downloadFile(handoff.file);
    setHandoff((current) => ({ ...current, status: result.status, message: result.status === 'download-started' ? '다운로드를 시작했어요.' : '다운로드를 시작하지 못했어요. 브라우저 다운로드 설정을 확인해주세요.' }));
  };

  return <section className="phone scene-result-screen" aria-labelledby="scene-result-title">
    <header className="scene-camera-header camera-safe-top"><button type="button" aria-label="결과 닫기" onClick={handleClose}>×</button><AutoFocusHeading id="scene-result-title">촬영 결과 비교</AutoFocusHeading><span aria-hidden="true" /></header>
    <main className="scene-result-scroll">
      <p className="scene-result-instruction">슬라이더를 움직여 참고 장면과 촬영 결과를 비교해보세요.</p>
      <BeforeAfterComparison referenceUrl={state.reference.url} referenceAlt={state.reference.altText} captureUrl={state.captured.objectUrl} value={state.comparison} onChange={(value) => dispatch({ type: 'SET_COMPARISON', value })} />
      <p className="scene-reference-attribution">참고 장면: {state.reference.attribution}</p>
      <fieldset className="scene-export-mode"><legend>내보내기 방식</legend><label><input type="radio" name="scene-export" value="split" checked={state.exportMode === 'split'} onChange={() => dispatch({ type: 'SET_EXPORT_MODE', value: 'split' })} /> 50:50 나란히</label><label><input type="radio" name="scene-export" value="overlay" checked={state.exportMode === 'overlay'} onChange={() => dispatch({ type: 'SET_EXPORT_MODE', value: 'overlay' })} /> 겹쳐서</label></fieldset>
      <div className="scene-result-actions camera-safe-bottom"><button type="button" className="ui-button primary" onClick={handleShare} disabled={handoff.status === 'working'}>공유</button><button type="button" className="ui-button secondary" onClick={() => retake(normalizedId, go)}>다시 촬영</button></div>
      {handoff.status === 'error'
        ? <BlockingAlert className="scene-result-status" title="결과를 내보내지 못했어요" message={handoff.message} />
        : <div className="scene-result-status" role="status" aria-live="polite">{handoff.message}{handoff.status === 'download-available' && <button type="button" className="ui-button secondary" onClick={handleDownload}>PNG 다운로드</button>}</div>}
    </main>
  </section>;
}
