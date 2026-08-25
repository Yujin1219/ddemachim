export const initialMapHomeInteraction = Object.freeze({
  isMapFocused: false,
  isSheetCollapsed: false,
});

const MAP_ROUTE_FIT_TOP = 120;
const MAP_ROUTE_FIT_SIDE = 28;
const MAP_ROUTE_SHEET_VIEWPORT_RATIO = 0.44;
const MAP_ROUTE_SHEET_MAX_HEIGHT = 360;
const MAP_BOTTOM_NAV_HEIGHT = 72;
const MAP_ROUTE_FIT_GUTTER = 16;

export function mapHomeRouteFitPadding(viewportHeight) {
  const numericHeight = Number(viewportHeight);
  const safeViewportHeight = Number.isFinite(numericHeight) && numericHeight > 0
    ? numericHeight
    : 844;
  const routeSheetHeight = Math.ceil(Math.min(
    safeViewportHeight * MAP_ROUTE_SHEET_VIEWPORT_RATIO,
    MAP_ROUTE_SHEET_MAX_HEIGHT,
  ));

  return [
    MAP_ROUTE_FIT_TOP,
    MAP_ROUTE_FIT_SIDE,
    routeSheetHeight + MAP_BOTTOM_NAV_HEIGHT + MAP_ROUTE_FIT_GUTTER,
    MAP_ROUTE_FIT_SIDE,
  ];
}

export function mapHomeRouteFitKey({
  routeSelectionKey = '',
  routeRequested = false,
  routeStatus = 'idle',
  routeMode = 'WALK',
} = {}) {
  if (!routeRequested || !routeSelectionKey) return '';
  return `${routeSelectionKey}|route:${routeMode}|${routeStatus}`;
}

export function mapHomePlaceCameraState({
  routeRequested = false,
  selectedPlaceKey = '',
} = {}) {
  return {
    fitPlaceMarkers: !routeRequested,
    focusedPlaceKey: routeRequested ? '' : selectedPlaceKey,
    followUserLocation: !routeRequested,
  };
}

export function createInitialMapHomeInteraction(viewportHeight) {
  return {
    ...initialMapHomeInteraction,
    isSheetCollapsed: Number.isFinite(Number(viewportHeight)) && Number(viewportHeight) <= 640,
  };
}

export function subscribeToMapHomeViewport(target, dispatch) {
  if (!target?.addEventListener || !target?.removeEventListener || typeof dispatch !== 'function') {
    return () => {};
  }

  const handleViewportChange = () => {
    dispatch({ type: 'VIEWPORT_RESIZED', viewportHeight: target.innerHeight });
  };

  target.addEventListener('resize', handleViewportChange);
  target.addEventListener('orientationchange', handleViewportChange);

  return () => {
    target.removeEventListener('resize', handleViewportChange);
    target.removeEventListener('orientationchange', handleViewportChange);
  };
}

export function shouldCollapseMapSheet(current, { offsetY = 0, velocityY = 0 } = {}) {
  if (velocityY > 280 || offsetY >= 28) return true;
  if (velocityY < -280 || offsetY <= -28) return false;
  return current;
}

export function mapHomeInteractionReducer(state, action) {
  if (action.type === 'VIEWPORT_RESIZED') {
    const isShortViewport = Number.isFinite(Number(action.viewportHeight))
      && Number(action.viewportHeight) <= 640;
    if (!isShortViewport || state.isSheetCollapsed) return state;
    return { ...state, isSheetCollapsed: true };
  }
  if (action.type === 'MAP_FOCUSED') return { ...state, isMapFocused: true };
  if (action.type === 'SEARCH_RESTORED') {
    return { ...state, isMapFocused: false, isSheetCollapsed: true };
  }
  if (action.type === 'CROWDING_SELECTED') {
    return { ...state, isMapFocused: true, isSheetCollapsed: true };
  }
  if (action.type === 'PLACE_SELECTED') {
    return { isMapFocused: true, isSheetCollapsed: false };
  }
  if (action.type === 'SHEET_TOGGLED') {
    const isSheetCollapsed = !state.isSheetCollapsed;
    return {
      ...state,
      isMapFocused: isSheetCollapsed ? state.isMapFocused : true,
      isSheetCollapsed,
    };
  }
  if (action.type === 'SHEET_DRAG_ENDED') {
    const isSheetCollapsed = shouldCollapseMapSheet(state.isSheetCollapsed, {
      offsetY: action.offsetY,
      velocityY: action.velocityY,
    });
    return {
      ...state,
      isMapFocused: isSheetCollapsed ? state.isMapFocused : true,
      isSheetCollapsed,
    };
  }
  return state;
}
