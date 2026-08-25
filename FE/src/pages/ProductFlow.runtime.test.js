import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const productFlowSource = await readFile(new URL('./ProductFlow.jsx', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('keeps MapHome filter and sheet runtime dependencies defined after integration', () => {
  for (const expectedDefinition of [
    'const MAP_FILTER_ICONS =',
    'const [activeMapFilterKeys, setActiveMapFilterKeys] = useState([])',
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

test('keeps selected map filters softly sky blue without adding a check glyph', () => {
  const mapHomeSource = productFlowSource.match(/function MapHome\([\s\S]*?\n}\n\nfunction ExploreReveal/)?.[0];

  assert.ok(mapHomeSource, 'MapHome source should be present');
  assert.match(
    stylesSource,
    /\.map-home-screen \.map-filter-chip\.is-active\s*\{[^}]*border:\s*1px solid transparent;[^}]*color:\s*#2f7fac;[^}]*background:\s*linear-gradient\(180deg, #edf8ff 0%, #d9effc 100%\);[^}]*box-shadow:\s*inset 0 1px 0 rgba\(255,255,255,\.78\), 0 4px 12px rgba\(48,137,190,\.14\);/s,
  );
  assert.doesNotMatch(mapHomeSource, /map-filter-chip[\s\S]{0,240}<Check/);
});

test('threads the sanitized course preview failure into the compare results', () => {
  assert.equal(productFlowSource.includes('failure={coursePreview?.failure}'), true);
});

test('preserves the Explore scroll position while visiting a detail route', () => {
  for (const expectedReference of [
    'const exploreSession = {',
    'scrollTop: 0,',
    'createDeferredScrollRestoration(exploreSession.scrollTop)',
    'scrollRestorationRef.current.restore(scroll)',
    'scrollRestorationRef.current.capture(scrollRef.current?.scrollTop)',
    'if (capturedScrollTop !== null) exploreSession.scrollTop = capturedScrollTop',
    'className="page-scroll explore-scroll" ref={scrollRef} onScroll={handleScroll}',
  ]) {
    assert.equal(productFlowSource.includes(expectedReference), true, `missing Explore scroll restoration reference: ${expectedReference}`);
  }
});

test('searches the complete Explore catalog through server APIs instead of loaded card arrays', () => {
  const exploreSource = productFlowSource.match(/function ExploreScreen\([\s\S]*?\n}\n\nfunction EmptySearch/)?.[0];

  assert.ok(exploreSource, 'ExploreScreen source should be present');
  assert.match(exploreSource, /searchExploreCatalog\(normalized/);
  assert.match(exploreSource, /fetchPlaces/);
  assert.match(exploreSource, /fetchFilmingWorks/);
  assert.match(exploreSource, /fetchEvents/);
  assert.match(exploreSource, /장소, 작품, 행사명을 검색해보세요/);
  assert.doesNotMatch(exploreSource, /filterSearchItems\(filmingWorks\.items/);
  assert.doesNotMatch(exploreSource, /filterSearchItems\(popups\.items/);
});

test('renders Explore catalog search results with the shared full-list rows', () => {
  const exploreSource = productFlowSource.match(/function ExploreScreen\([\s\S]*?\n}\n\nfunction EmptySearch/)?.[0];

  assert.ok(exploreSource, 'ExploreScreen source should be present');
  assert.match(exploreSource, /catalogSearch\.places\.map\(\(place\) => <PlaceRow/);
  assert.match(exploreSource, /catalogSearch\.works\.map\(\(work\) => <FilmingWorkCard/);
  assert.match(exploreSource, /catalogSearch\.events\.map\(\(event\) => <EventListItem/);

  const activeSearchBranch = exploreSource.match(/: isSearchActive \? \([\s\S]*?\n        \) : loadError/)?.[0];
  assert.ok(activeSearchBranch, 'active Explore search branch should be present');
  assert.doesNotMatch(activeSearchBranch, /<ExploreCoverflow/);
});

test('keeps the Explore trend shelf mounted for loading, empty, and error states', () => {
  const exploreSource = productFlowSource.match(/function ExploreScreen\([\s\S]*?\n}\n\nfunction EmptySearch/)?.[0];

  assert.ok(exploreSource, 'ExploreScreen source should be present');
  assert.doesNotMatch(exploreSource, /displayedTrendPlaces\.length > 0 && <ExploreReveal/);
  assert.match(exploreSource, /<ExploreReveal delay=\{0\.06\}>[\s\S]*?<PlaceTrendSection/);
});

test('shows event inquiry with the visit facts and omits organizer presentation', () => {
  const eventDetailSource = productFlowSource.match(/function EventDetail\([\s\S]*?\n}\n\nfunction mediaContentToRowProps/)?.[0];

  assert.ok(eventDetailSource, 'EventDetail source should be present');
  assert.match(eventDetailSource, /event-visit-summary[\s\S]*?<small>요금<\/small>[\s\S]*?<small>문의<\/small>/);
  assert.doesNotMatch(eventDetailSource, /displayEvent\.orgName/);
  assert.doesNotMatch(eventDetailSource, /주최·문의/);
});

test('renders add and remove basket feedback as the same compact centered pill', () => {
  const basketActionSource = productFlowSource.match(/function PlaceBasketAction\([\s\S]*?\n}\n\nfunction KakaoPlaceActions/)?.[0];

  assert.ok(basketActionSource, 'PlaceBasketAction source should be present');
  assert.match(basketActionSource, /place-basket-success-toast-icon/);
  assert.match(basketActionSource, /const \[basketNoticeType, setBasketNoticeType\] = useState\('added'\)/);
  assert.match(basketActionSource, /setBasketNoticeType\('removed'\)[\s\S]*?successNotice\.show\(\)/);
  assert.match(basketActionSource, /setBasketNoticeType\('added'\)[\s\S]*?successNotice\.show\(\)/);
  assert.match(basketActionSource, /basketNoticeType === 'removed' \? <Minus/);
  assert.match(basketActionSource, /basketNoticeType === 'removed' \? '코스 담기를 취소했어요' : '코스에 담았어요'/);
  assert.doesNotMatch(basketActionSource, /<small>코스 장바구니<\/small>/);
  assert.match(basketActionSource, /scale: 0\.98/);
  assert.doesNotMatch(productFlowSource, /import \{ createPortal \} from 'react-dom';/);
  assert.doesNotMatch(basketActionSource, /createPortal\(/);

  assert.match(stylesSource, /\.place-basket-action\s*\{[^}]*position:\s*relative;/s);
  assert.match(stylesSource, /\.place-basket-success-toast\s*\{[^}]*position:\s*absolute;[^}]*right:\s*50%;[^}]*bottom:\s*calc\(100% \+ 12px\);/s);
  assert.match(stylesSource, /\.place-basket-success-toast-surface\s*\{[^}]*width:\s*max-content;[^}]*min-height:\s*50px;[^}]*border-radius:\s*999px;/s);
  assert.match(stylesSource, /\.place-basket-success-toast-icon\s*\{/);
  assert.doesNotMatch(stylesSource, /\.place-basket-success-toast\s*>\s*span\s*\{[^}]*var\(--color-success\)/s);
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
