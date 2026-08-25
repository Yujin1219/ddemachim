// The reference and camera layers share the same cover frame, so their default
// scale must match exactly. Users can still pinch to adjust it when needed.
export const DEFAULT_OVERLAY = Object.freeze({ x: 0, y: 0, scale: 1, opacity: 0.45, visible: true, mode: 'image' });

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));

function overlayDefaults(reference) {
  return {
    ...DEFAULT_OVERLAY,
    ...(reference?.defaultOverlay ?? {}),
  };
}

export function createSceneSession() {
  return {
    filmingLocationId: null,
    reference: null,
    overlay: { ...DEFAULT_OVERLAY },
    captured: null,
    comparison: 50,
    exportMode: 'split',
    flowState: 'idle',
    token: 0,
    error: null,
    notice: null,
  };
}

function isStale(state, action) {
  return action.token != null && action.token !== state.token;
}

export function sceneCameraReducer(state, action) {
  if (action.type === 'PREPARE_CAMERA') return { ...state, token: action.token ?? state.token + 1, flowState: 'preparing', error: null };
  if (isStale(state, action)) return state;
  switch (action.type) {
    case 'BEGIN_SCENE':
      return {
        ...createSceneSession(),
        notice: state.notice,
        filmingLocationId: action.id,
        reference: action.reference ? Object.freeze({ ...action.reference }) : null,
        overlay: overlayDefaults(action.reference),
        token: state.token + 1,
        flowState: action.reference ? 'preparing' : 'error',
        error: action.reference ? null : { code: 'missing-reference', message: '사용할 수 있는 참고 장면이 아직 없어요.' },
      };
    case 'SET_OVERLAY': {
      const patch = action.patch ?? {};
      return {
        ...state,
        overlay: {
          x: clamp(patch.x ?? state.overlay.x, -0.5, 0.5),
          y: clamp(patch.y ?? state.overlay.y, -0.5, 0.5),
          scale: clamp(patch.scale ?? state.overlay.scale, 0.5, 2),
          opacity: clamp(patch.opacity ?? state.overlay.opacity, 0.1, 1),
          visible: patch.visible ?? state.overlay.visible,
          mode: (patch.mode ?? state.overlay.mode) === 'image' ? 'image' : 'outline',
        },
      };
    }
    case 'RESET_OVERLAY': return { ...state, overlay: overlayDefaults(state.reference) };
    case 'SET_COMPARISON': return { ...state, comparison: Math.round(clamp(action.value, 0, 100)) };
    case 'SET_EXPORT_MODE': return { ...state, exportMode: action.value === 'overlay' ? 'overlay' : 'split' };
    case 'REFERENCE_READY': return { ...state, flowState: 'idle', error: null };
    case 'CAMERA_READY': return { ...state, flowState: 'camera-ready', error: null };
    case 'CAPTURING': return { ...state, flowState: 'capturing', error: null };
    case 'CAPTURED': return { ...state, captured: action.captured, comparison: 50, flowState: 'result-ready', error: null };
    case 'ERROR': return { ...state, flowState: 'error', error: action.error };
    case 'NOTICE': return { ...state, notice: action.notice };
    case 'CLEAR_NOTICE': return { ...state, notice: null };
    case 'RETAKE':
      if (action.id !== state.filmingLocationId) return state;
      return { ...state, captured: null, comparison: 50, exportMode: 'split', flowState: 'idle', error: null, token: state.token + 1 };
    case 'CLOSE': return createSceneSession();
    default: return state;
  }
}
