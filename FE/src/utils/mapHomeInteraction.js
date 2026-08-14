export const initialMapHomeInteraction = Object.freeze({
  isMapFocused: false,
  isSheetCollapsed: false,
});

export function shouldCollapseMapSheet(current, { offsetY = 0, velocityY = 0 } = {}) {
  if (velocityY > 280 || offsetY >= 28) return true;
  if (velocityY < -280 || offsetY <= -28) return false;
  return current;
}

export function mapHomeInteractionReducer(state, action) {
  if (action.type === 'MAP_FOCUSED') return { ...state, isMapFocused: true };
  if (action.type === 'SEARCH_RESTORED') return { ...state, isMapFocused: false };
  if (action.type === 'PLACE_SELECTED') {
    return { isMapFocused: true, isSheetCollapsed: false };
  }
  if (action.type === 'SHEET_TOGGLED') {
    return { ...state, isSheetCollapsed: !state.isSheetCollapsed };
  }
  if (action.type === 'SHEET_DRAG_ENDED') {
    return {
      ...state,
      isSheetCollapsed: shouldCollapseMapSheet(state.isSheetCollapsed, {
        offsetY: action.offsetY,
        velocityY: action.velocityY,
      }),
    };
  }
  return state;
}
