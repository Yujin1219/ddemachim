import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const productFlowSource = await readFile(new URL('./ProductFlow.jsx', import.meta.url), 'utf8');

test('keeps MapHome filter and sheet runtime dependencies defined after integration', () => {
  for (const expectedDefinition of [
    'const MAP_FILTER_ICONS =',
    'const didDragNearbySheetRef = useRef(false)',
    'const activeMapFilters = MAP_HOME_FILTERS.filter(',
    "const activeMapFilterKey = activeMapFilterKeys.join(',')",
  ]) {
    assert.match(productFlowSource, new RegExp(expectedDefinition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const removedReference of [
    'setCategorySourcePlaces(',
    'setIsNearbySheetCollapsed(',
    'setActiveMapFilter(',
    'hotPlaces.filter(',
  ]) {
    assert.equal(productFlowSource.includes(removedReference), false);
  }
});

test('threads the sanitized course preview failure into the compare results', () => {
  assert.equal(productFlowSource.includes('failure={coursePreview?.failure}'), true);
});

test('renders the AI guide as an API-backed, composition-safe chat surface', () => {
  for (const expectedReference of [
    'message, history, currentLocation, previousResponseId, signal: controller.signal,',
    'setPreviousResponseId(result?.responseId || null)',
    'navigator.geolocation.getCurrentPosition(',
    'slice(-AI_GUIDE_HISTORY_LIMIT)',
    'role: role.toUpperCase()',
    'event.nativeEvent?.isComposing',
    'getAiGuideErrorPresentation(requestError)',
    'error.technical',
    'aria-live="polite"',
    'disabled={!draft.trim() || isLoading}',
  ]) {
    assert.equal(productFlowSource.includes(expectedReference), true, `missing AI guide reference: ${expectedReference}`);
  }
});
