import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CalendarDays, Camera, Check, ChevronLeft, ChevronRight, CircleDollarSign, CircleHelp, Clapperboard, Clock3, Coffee, ExternalLink, Flame, Heart, Image as ImageIcon, Landmark, LocateFixed, MapPin, Minus, MoreHorizontal, Phone, Plus, RefreshCw, Search, SearchX, SendHorizontal, ShoppingBasket, Trash2, Trees, UserRound, Utensils, X } from 'lucide-react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import CourseActionButton from '../components/CourseActionButton';
import PlaceReviewPreview from '../components/PlaceReviewPreview';
import PlaceTrendSection, { getPlaceTrendCardProps, getPlaceTrendSearchText, getVisiblePlaceTrends } from '../components/PlaceTrendSection.js';
import SelectedPlaceRoutePanel, { selectedPlaceDetailTarget } from '../components/SelectedPlaceRoutePanel.jsx';
import VWorldMap from '../components/VWorldMap';
import { PLACE_REVIEW_ITEMS, PLACE_REVIEW_SUMMARY } from '../components/placeReviewPreviewModel.js';
import {
  addKakaoPlaceToCourseBasket,
  addPlaceToCourseBasket,
  clearAuth,
  completeCourse,
  createCourse,
  deleteCourseBasketPlace,
  fetchCourse,
  fetchCourseBasketPlaces,
  fetchEvent,
  fetchEvents,
  fetchFilmingWorks,
  fetchKakaoPlaces,
  fetchMapPlaces,
  fetchMockCrowdingGrids,
  fetchMyProfile,
  fetchMediaContent,
  fetchMediaContents,
  fetchMediaFilmingLocations,
  fetchPlace,
  fetchPlaceFilmingLocations,
  fetchPlaceTrends,
  fetchPlaces,
  getAccessToken,
  getAiGuideErrorPresentation,
  getUser,
  login,
  replanCourse,
  saveAuth,
  saveUser,
  sendAiGuideMessage,
  startCourse,
  signup,
} from '../api/client';
import {
  basketHasKakaoPlace,
  basketHasUserPlace,
  consumeAuthReturnRoute,
  getKakaoPlaceUrl,
  isDuplicateBasketError,
  mergeBasketItem,
  mergeBasketItems,
  storeAuthReturnRoute,
} from '../courseBasket';
import {
  ArrivalMotion,
  BrandLoading,
  CrowdMotion,
  MapPlacePulse,
  NearbyMotion,
  RouteMotion,
} from '../components/MotionAssets';
import CourseHome from '../components/CourseHome';
import CoursePreviewResults from '../components/CoursePreviewResults.js';
import DetailTabs from '../components/DetailTabs.jsx';
import {
  createCourseConditionDefaults,
  formatCourseDateLabel,
  formatCourseTimeLabel,
  normalizeCourseStartPlace,
} from '../components/courseConditionsModel.js';
import {
  buildCoursePreviewPlaces,
  reconcileCourseStopSettings,
  updateCourseStopSetting,
} from '../components/courseStopSettings.js';
import { buildCoursePreviewRequest, normalizeCoursePreview } from '../components/coursePreviewModel.js';
import { CongestionBadge, CongestionPointBadge, getMockCongestionAccessibleLabel } from '../components/CongestionInfo';
import ScrollOnboarding from '../components/ScrollOnboarding';
import { useMockCrowdingAtPoint } from '../utils/mockCrowdingStore.js';
import { getSearchCoordinates, mapKakaoPlaceToMapCard, mapKakaoPlaceToSearchRow } from '../utils/placeSearch';
import { findNearbyFilmingPlace } from '../utils/filmingProximity.js';
import {
  buildKakaoTaxiHref,
  normalizeRouteCoordinate,
  routeModeSelectionReducer,
  routeOptionByMode,
  shouldLocateForDestinationSelection,
} from '../utils/routeComparison.js';
import { useRouteComparison } from '../hooks/useRouteComparison.js';
import { useCoursePreview } from '../hooks/useCoursePreview.js';
import { useCurrentLocation } from '../hooks/useCurrentLocation.js';
import { renderAiGuideMarkdown, scrollAiGuideToLatest } from '../utils/aiGuidePresentation.js';
import {
  createInitialMapHomeInteraction,
  mapHomeInteractionReducer,
  subscribeToMapHomeViewport,
} from '../utils/mapHomeInteraction.js';
import {
  MAP_HOME_FILTERS,
  eventToMapMarker,
  mapEventsForFilter,
  mapFilterApiParams,
  tagMapItemsForFilter,
  toggleMapFilterSelection,
} from '../utils/mapHomeFilters.js';
import { SceneCameraProvider } from '../sceneCamera/SceneCameraSession.js';
import { SceneCameraScreen, SceneDetailCameraPanel, SceneShotResultScreen } from '../sceneCamera/SceneCameraScreens.jsx';
import { SceneDetailHeading } from '../sceneCamera/ui.js';
import { createSceneNavigationTarget, sceneRouteMotion } from '../sceneCamera/flow.js';
import { guardSceneRouteHash } from '../sceneCamera/routes.js';

const routeGroups = {
  auth: ['splash', 'intro', 'login', 'signup', 'onboarding', 'onboarding-schedule', 'onboarding-permissions'],
  discovery: ['map', 'explore', 'place', 'event-detail', 'search', 'search-empty', 'saved', 'trending', 'filming-locations', 'popups', 'live-talk', 'ai-guide'],
  course: ['course-home', 'course-conditions', 'course-place-times', 'basket', 'basket-natural', 'basket-glass', 'compare', 'route-map', 'saved-course-preview'],
  travel: ['progress', 'arrival', 'navigation', 'reroute', 'reroute-applied', 'transit', 'taxi', 'nearby', 'nearby-added', 'nearby-arrival', 'active-course', 'next-stop', 'gps-error', 'taxi-handoff', 'offline', 'closed-place', 'stop-course'],
  filming: ['onsite', 'filming-work', 'filming-content', 'nearby-filming', 'camera', 'scene-list', 'scene-detail', 'shot-result', 'photo-saved', 'image-missing', 'filming-restricted', 'report'],
  record: ['complete', 'record', 'saved-courses', 'record-detail', 'write-review', 'reviews', 'review-detail'],
  my: ['my', 'location-permission', 'notifications', 'profile-edit', 'privacy', 'app-permissions', 'support', 'loading', 'server-error'],
};

const routes = new Set(Object.values(routeGroups).flat());
const rootRoutes = { map: 'map', explore: 'explore', assistant: 'ai-guide', course: 'course-home', my: 'my' };
const images = {
  cafe: '/assets/figma/explore-cafe.jpeg',
  mapPlace: '/assets/figma/map-place.jpeg',
  scene: '/assets/figma/explore-scene.jpeg',
  popup: '/assets/figma/explore-popup.png',
  detail: '/assets/figma/place-detail.jpeg',
  onsite: '/assets/figma/onsite-media.png',
  completePhoto: '/assets/figma/complete-photo.png',
  myMap: '/assets/figma/my-map.png',
};

const EXPLORE_PAGE_SIZE = 6;
const AI_GUIDE_HISTORY_LIMIT = 12;
const AI_GUIDE_GREETING = '안녕하세요! 장소, 분위기, 일정에 맞는 여행을 함께 찾아볼게요.';
const KAKAO_MAP_TARGET_KEY = 'ddemachim:kakao-map-target';
const ANGUK_STATION_CENTER = Object.freeze([126.9854, 37.5766]);
const MAP_HOME_DISCOVERY_BOUNDS = Object.freeze({
  minLat: 37.50,
  maxLat: 37.62,
  minLng: 126.90,
  maxLng: 127.12,
});

function writeKakaoMapTarget(place) {
  try {
    window.sessionStorage.setItem(KAKAO_MAP_TARGET_KEY, JSON.stringify(place));
  } catch {
    // The map still opens even when session storage is unavailable.
  }
}

function consumeKakaoMapTarget() {
  try {
    const storedTarget = window.sessionStorage.getItem(KAKAO_MAP_TARGET_KEY);
    window.sessionStorage.removeItem(KAKAO_MAP_TARGET_KEY);
    const target = JSON.parse(storedTarget || 'null');
    const longitude = Number(target?.longitude);
    const latitude = Number(target?.latitude);
    if (!target?.providerPlaceId || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    return { ...target, longitude, latitude, externalSource: 'KAKAO', id: `kakao:${target.providerPlaceId}` };
  } catch {
    return null;
  }
}

function SearchIcon() {
  return <Search aria-hidden="true" size={20} strokeWidth={2} />;
}

const PLACE_TREND_MOCK_FIXTURE = {
  status: 'TRENDING',
  interestChangePercent: 240,
  updatedAt: '2026-08-13',
};

function PlaceTrendSummary({ trend }) {
  const changePercent = trend?.interestChangePercent;
  if (typeof changePercent === 'number' && Number.isFinite(changePercent) && changePercent > 0) {
    const multiplier = 1 + (changePercent / 100);
    const formattedMultiplier = new Intl.NumberFormat('ko-KR', {
      maximumFractionDigits: multiplier >= 10 ? 0 : 1,
    }).format(multiplier);
    return <>이 장소가 요즘 약 <strong className="place-trend-multiplier">{formattedMultiplier}배</strong> 더 주목받고 있어요.</>;
  }
  if (trend?.status === 'TRENDING') return <>이 장소가 요즘 더 많은 관심을 받고 있어요.</>;
  if (trend?.status === 'WATCH') return <>이 장소가 요즘 꾸준히 주목받고 있어요.</>;
  return <>이 장소의 기본 정보를 확인해보세요.</>;
}

function readHash() {
  const guardedScene = guardSceneRouteHash(window.location.hash);
  if (guardedScene) {
    if (guardedScene.replaceHash) window.history.replaceState(null, '', guardedScene.replaceHash);
    return { screen: guardedScene.screen, id: guardedScene.id };
  }
  const [candidate, hashId] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { screen: routes.has(candidate) ? candidate : 'map', id: hashId || null };
}

/** place/media 응답을 카드·행 컴포넌트가 쓰는 { name, meta, image, badge } 모양으로 바꾼다. */
function placeToCardProps(place) {
  return {
    id: place.id,
    name: place.name,
    meta: [place.categoryLabel, place.roadAddress].filter(Boolean).join(' · '),
    image: place.imageUrl || images.cafe,
    badge: place.categoryLabel,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

const FILMING_CONTENT_TYPE_LABELS = {
  DRAMA: '드라마',
  VARIETY: '예능',
  MOVIE: '영화',
};

function positiveCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : null;
}

function filmingWorkCount(place) {
  return [place.filmingWorkCount, place.filmingWorksCount, place.filmingContentCount]
    .map(positiveCount)
    .find(Boolean) ?? null;
}

function filmingPlaceToCardProps(place) {
  const contentLabel = (place.filmingContentTypes ?? [])
    .map((type) => FILMING_CONTENT_TYPE_LABELS[type])
    .filter(Boolean)
    .join(' · ') || '촬영 콘텐츠 정보 없음';
  const contextLabel = [contentLabel, place.categoryLabel].filter(Boolean).join(' · ');
  return {
    ...placeToCardProps(place),
    image: place.imageUrl || images.popup,
    hasThumbnail: Boolean(place.imageUrl),
    badge: contextLabel,
    labels: { content: contentLabel, category: place.categoryLabel },
    meta: place.roadAddress || place.district,
    addressLabel: place.roadAddress || place.district || null,
    filmingWorkCount: filmingWorkCount(place),
  };
}

const TMDB_POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w342';
const TMDB_PROFILE_BASE_URL = 'https://image.tmdb.org/t/p/w185';

function tmdbPosterUrl(posterPath) {
  if (!posterPath) return null;
  if (/^https?:\/\//i.test(posterPath)) return posterPath;
  return `${TMDB_POSTER_BASE_URL}/${String(posterPath).replace(/^\/+/, '')}`;
}

function tmdbProfileUrl(profilePath) {
  const normalizedPath = String(profilePath ?? '').trim();
  if (!normalizedPath) return null;
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return `${TMDB_PROFILE_BASE_URL}/${normalizedPath.replace(/^\/+/, '')}`;
}

function normalizeMediaCredits(credits) {
  if (!Array.isArray(credits)) return [];

  return credits
    .map((credit, sourceIndex) => ({ credit, sourceIndex }))
    .filter(({ credit }) => {
      const role = String(credit?.role ?? '').toUpperCase();
      return Boolean(String(credit?.name ?? '').trim()) && (role === 'DIRECTOR' || role === 'CAST');
    })
    .map(({ credit, sourceIndex }) => ({
      ...credit,
      name: String(credit.name).trim(),
      role: String(credit.role).toUpperCase(),
      characterNameKo: String(credit.characterNameKo ?? '').trim() || null,
      characterName: String(credit.characterName ?? '').trim() || null,
      sourceIndex,
    }))
    .sort((left, right) => {
      const roleOrder = (role) => (role === 'DIRECTOR' ? 0 : 1);
      const roleDifference = roleOrder(left.role) - roleOrder(right.role);
      if (roleDifference !== 0) return roleDifference;
      if (left.role !== 'CAST') return left.sourceIndex - right.sourceIndex;

      const leftCastOrder = left.castOrder === null || left.castOrder === undefined || left.castOrder === ''
        ? Number.MAX_SAFE_INTEGER
        : Number(left.castOrder);
      const rightCastOrder = right.castOrder === null || right.castOrder === undefined || right.castOrder === ''
        ? Number.MAX_SAFE_INTEGER
        : Number(right.castOrder);
      return (Number.isFinite(leftCastOrder) ? leftCastOrder : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(rightCastOrder) ? rightCastOrder : Number.MAX_SAFE_INTEGER)
        || left.sourceIndex - right.sourceIndex;
    })
    .slice(0, 12)
    .map(({ sourceIndex, ...credit }) => credit);
}

function formatReleaseYear(releaseDate) {
  const year = String(releaseDate ?? '').match(/\d{4}/)?.[0];
  return year || null;
}

function filmingWorkTypeLabel(work) {
  const contentTypeLabels = (work.contentTypes ?? [])
    .map((type) => FILMING_CONTENT_TYPE_LABELS[type])
    .filter(Boolean);
  if (contentTypeLabels.length) return [...new Set(contentTypeLabels)].join(' · ');
  const mediaType = String(work.mediaType ?? '').toLowerCase();
  if (mediaType === 'movie') return FILMING_CONTENT_TYPE_LABELS.MOVIE;
  if (mediaType === 'variety') return FILMING_CONTENT_TYPE_LABELS.VARIETY;
  if (mediaType === 'drama' || mediaType === 'tv' || mediaType === 'series') return FILMING_CONTENT_TYPE_LABELS.DRAMA;
  return '콘텐츠 유형 확인 중';
}

function filmingWorkToCardProps(work) {
  const representativePlaces = (work.representativePlaces ?? [])
    .filter((place) => place?.placeName)
    .slice(0, 2);
  const filmingPlaceCount = Number.isInteger(Number(work.filmingPlaceCount))
    ? Number(work.filmingPlaceCount)
    : null;
  const otherPlaceCount = filmingPlaceCount === null
    ? Math.max(0, (work.representativePlaces?.length ?? 0) - representativePlaces.length)
    : Math.max(0, filmingPlaceCount - representativePlaces.length);

  return {
    id: work.mediaId,
    title: work.title,
    typeLabel: filmingWorkTypeLabel(work),
    releaseYear: formatReleaseYear(work.releaseDate),
    filmingPlaceCount,
    representativePlaces,
    otherPlaceCount,
    posterUrl: tmdbPosterUrl(work.posterPath),
  };
}

function filmingWorkToExploreCardProps(work) {
  const normalizedWork = filmingWorkToCardProps(work);
  const meta = normalizedWork.filmingPlaceCount === null
    ? '촬영 장소를 확인해보세요'
    : `촬영 장소 ${normalizedWork.filmingPlaceCount}곳`;

  return {
    id: normalizedWork.id,
    name: normalizedWork.title,
    image: normalizedWork.posterUrl || images.onsite,
    badge: [normalizedWork.typeLabel, normalizedWork.releaseYear].filter(Boolean).join(' · '),
    meta,
    showCongestion: false,
  };
}

function formatEventTitle(title) {
  const trimmedTitle = String(title ?? '').trim();
  const displayTitle = trimmedTitle.replace(/^(?:\[[^\]]*\]\s*)+/, '').trim();
  return displayTitle || trimmedTitle;
}

function eventToRowProps(event) {
  return {
    ...event,
    id: event.id,
    placeId: event.placeId,
    startDate: event.startDate,
    endDate: event.endDate,
    useFee: event.useFee,
    applyDate: event.applyDate,
    eventTime: event.eventTime,
    eventStartTime: event.eventStartTime,
    eventEndTime: event.eventEndTime,
    eventType: event.eventType,
    venueName: event.venueName,
    placeName: event.placeName,
    name: formatEventTitle(event.title),
    meta: [event.venueName || event.placeName, formatDateRange(event.startDate, event.endDate)].filter(Boolean).join(' · '),
    image: event.mainImage || null,
    isEvent: true,
  };
}

function eventToCardProps(event) {
  return {
    ...eventToRowProps(event),
    badge: event.eventType || '행사',
  };
}

function hasNextPage(page, size) {
  if (typeof page?.last === 'boolean') return !page.last;
  if (Number.isFinite(page?.totalPages) && Number.isFinite(page?.number)) return page.number + 1 < page.totalPages;
  return (page?.content?.length ?? 0) >= size;
}

function appendUniqueItems(current, next) {
  const seen = new Set(current.map((item) => item.id ?? item.name));
  return [...current, ...next.filter((item) => {
    const key = item.id ?? item.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

function formatKoreanDate(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(date);
}

function formatDateRange(startDate, endDate) {
  const start = formatKoreanDate(startDate);
  const end = formatKoreanDate(endDate);
  if (start && end && start !== end) return `${start} - ${end}`;
  return start || end || null;
}

const SEOUL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function currentSeoulDateTime(now = new Date()) {
  const parts = SEOUL_DATE_TIME_FORMATTER.formatToParts(now).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function normalizeEventTime(value) {
  const time = String(value ?? '').trim();
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return [hour, minute, second].map((part) => String(part).padStart(2, '0')).join(':');
}

function currentEventState(event) {
  const startDate = String(event?.startDate ?? '').trim() || null;
  const endDate = String(event?.endDate ?? '').trim() || null;
  if (!startDate && !endDate) return '상태 확인 중';

  const { date: currentDate, time: currentTime } = currentSeoulDateTime();
  if (endDate && currentDate > endDate) return '종료';
  if (!startDate) return '상태 확인 중';
  if (currentDate < startDate) return '예정';

  const startTime = normalizeEventTime(event?.eventStartTime);
  if (startDate && currentDate === startDate && startTime && currentTime < startTime) return '예정';

  const endTime = normalizeEventTime(event?.eventEndTime);
  if (endDate && currentDate === endDate && endTime && currentTime > endTime) return '종료';

  return '진행 중';
}

function formatCompactDateRange(startDate, endDate) {
  const formatCompact = (value) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.getMonth() + 1}.${date.getDate()}`;
  };
  const start = formatCompact(startDate);
  const end = formatCompact(endDate);
  if (start && end && start !== end) return `${start}-${end}`;
  return start || end || null;
}

function formatEventListTime(value) {
  return String(value ?? '').trim().replace(/\s*[~–—-]\s*/g, '-');
}

function eventStatusLabel(event) {
  const state = currentEventState(event);
  if (state === '진행 중' && event.endDate) return `${state} · ${formatKoreanDate(event.endDate)}까지`;
  if (state === '예정' && event.startDate) return `${state} · ${formatKoreanDate(event.startDate)} 시작`;
  return state;
}

function eventIsFree(event) {
  return String(event.useFee ?? '').includes('무료');
}

function eventDecisionLabels(event) {
  return [
    eventIsFree(event) ? '무료' : null,
    event.applyDate ? `신청일 ${formatKoreanDate(event.applyDate)}` : null,
    event.eventType || null,
  ].filter(Boolean);
}

function eventVenueLabel(event) {
  return event.venueName || event.placeName || '장소 정보 확인 중';
}

const eventCollectionSession = {
  events: [],
  activeFilter: '전체',
  activeSort: 'LATEST',
  coordinates: null,
  page: 0,
  hasMore: true,
  scrollTop: 0,
  hasError: false,
  sortError: null,
  hasLoaded: false,
};

function useHorizontalPagedList({ loadPage, mapItem, size = EXPLORE_PAGE_SIZE }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);
  const didLoadInitialPageRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setIsLoading(true);
    setError(false);
    try {
      const nextPage = page;
      const result = await loadPage({ page: nextPage, size });
      const nextItems = (result.content ?? []).map(mapItem);
      setItems((current) => appendUniqueItems(current, nextItems));
      setPage(nextPage + 1);
      setHasMore(hasNextPage(result, size));
    } catch (requestError) {
      console.error('탐색 목록을 불러오지 못했어요', requestError);
      setError(true);
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [hasMore, loadPage, mapItem, page, size]);

  useEffect(() => {
    if (didLoadInitialPageRef.current) return;
    didLoadInitialPageRef.current = true;
    loadMore();
  }, [loadMore]);

  return { items, hasMore, isLoading, error, loadMore };
}

function ExploreCoverflowCard({ place, onClick, index }) {
  const congestion = useMockCrowdingAtPoint(place.longitude, place.latitude);

  return (
    <button
      aria-label={`${place.name} 상세 보기`}
      className="trend-coverflow-card"
      data-coverflow-card
      onClick={onClick}
      type="button"
    >
      <span className="trend-coverflow-card-surface">
        {place.isEvent
          ? <EventImage event={place} />
          : <img src={place.image} alt="" loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />}
        {place.showCongestion !== false && <CongestionBadge congestion={congestion} className="congestion-badge-on-media" compact />}
        <span className="trend-coverflow-glass">
          {place.badge && <small>{place.badge}</small>}
          <strong>{place.name}</strong>
          <span>{place.meta}</span>
        </span>
      </span>
    </button>
  );
}

function ExploreCoverflow({
  items,
  isLoading,
  error,
  onRetry,
  onCardClick,
  emptyLabel,
  errorLabel,
  ariaLabel,
  hasMore = false,
  onLoadMore,
}) {
  const scrollerRef = useRef(null);
  const frameRef = useRef(null);
  const activeIndexRef = useRef(0);
  const didSetInitialCardRef = useRef(false);
  const requestedAtEndRef = useRef(false);
  const hasUserScrollIntentRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const updateDepth = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const cards = Array.from(scroller.querySelectorAll('[data-coverflow-card]'));
    const viewportCenter = scroller.scrollLeft + scroller.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const signedDistance = (cardCenter - viewportCenter) / (card.offsetWidth + 14);
      const clampedDistance = Math.max(-1.35, Math.min(1.35, signedDistance));
      const depth = Math.min(1, Math.abs(clampedDistance));
      const absoluteDistance = Math.abs(cardCenter - viewportCenter);
      if (absoluteDistance < nearestDistance) {
        nearestDistance = absoluteDistance;
        nearestIndex = index;
      }

      card.style.transform = reduceMotion
        ? 'translate3d(0, 0, 0) rotateY(0deg) scale(1)'
        : `translate3d(0, ${depth * 7}px, ${depth * -64}px) rotateY(${clampedDistance * -13}deg) scale(${1 - depth * 0.065})`;
      card.style.opacity = String(1 - depth * 0.18);
      card.style.zIndex = String(20 - Math.round(depth * 10));
    });

    cards.forEach((card, index) => card.toggleAttribute('data-active', index === nearestIndex));
    activeIndexRef.current = nearestIndex;
  }, [reduceMotion]);

  const scheduleDepthUpdate = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateDepth();
    });
  }, [updateDepth]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !items.length) return undefined;
    const cards = scroller.querySelectorAll('[data-coverflow-card]');
    if (!didSetInitialCardRef.current) {
      const initialIndex = Math.min(1, cards.length - 1);
      const initialCard = cards[initialIndex];
      scroller.scrollLeft = initialCard
        ? initialCard.offsetLeft - (scroller.clientWidth - initialCard.offsetWidth) / 2
        : 0;
      activeIndexRef.current = initialIndex;
      didSetInitialCardRef.current = true;
    }
    requestedAtEndRef.current = false;
    const frame = window.requestAnimationFrame(updateDepth);
    const resizeObserver = new ResizeObserver(scheduleDepthUpdate);
    resizeObserver.observe(scroller);
    return () => {
      window.cancelAnimationFrame(frame);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      resizeObserver.disconnect();
    };
  }, [items.length, scheduleDepthUpdate, updateDepth]);

  const markUserScrollIntent = () => {
    hasUserScrollIntentRef.current = true;
  };

  const handleScroll = () => {
    scheduleDepthUpdate();
    const scroller = scrollerRef.current;
    if (!scroller || !hasMore || isLoading || !hasUserScrollIntentRef.current || typeof onLoadMore !== 'function') return;
    const distanceToEnd = scroller.scrollWidth - scroller.scrollLeft - scroller.clientWidth;
    if (distanceToEnd > 220) {
      requestedAtEndRef.current = false;
      return;
    }
    if (requestedAtEndRef.current) return;
    requestedAtEndRef.current = true;
    onLoadMore();
  };

  const handleKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !items.length) return;
    event.preventDefault();
    markUserScrollIntent();
    const current = activeIndexRef.current;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowRight'
          ? Math.min(items.length - 1, current + 1)
          : Math.max(0, current - 1);
    const scroller = scrollerRef.current;
    const card = scroller?.querySelectorAll('[data-coverflow-card]')[nextIndex];
    if (!scroller || !card) return;
    scroller.scrollTo({
      left: card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    card.focus({ preventScroll: true });
  };

  if (!items.length && !isLoading && !error) return <p className="explore-inline-state">{emptyLabel}</p>;
  if (error && !items.length) return <div className="collection-inline-error explore-inline-error" role="alert"><span>{errorLabel}</span>{typeof onRetry === 'function' && <button type="button" onClick={onRetry}>다시 시도</button>}</div>;

  return (
    <div className="trend-coverflow-shell">
      <div
        aria-label={ariaLabel}
        className="trend-coverflow"
        onKeyDown={handleKeyDown}
        onPointerDown={markUserScrollIntent}
        onScroll={handleScroll}
        onTouchStart={markUserScrollIntent}
        onWheel={markUserScrollIntent}
        ref={scrollerRef}
        role="region"
      >
        {items.map((item, index) => (
          <ExploreCoverflowCard
            index={index}
            key={item.id ?? `${item.name}-${index}`}
            onClick={() => onCardClick(item)}
            place={item}
          />
        ))}
        {error && items.length > 0 && <div className="collection-inline-error explore-inline-error" role="alert"><span>{errorLabel}</span>{typeof onRetry === 'function' && <button type="button" onClick={onRetry}>다시 시도</button>}</div>}
        {isLoading && <span className="horizontal-loading-card" aria-label="목록 불러오는 중" />}
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, tone = 'primary', disabled = false, className = '', type = 'button', ...buttonProps }) {
  return <button className={`ui-button ${tone} ${className}`} disabled={disabled} onClick={onClick} type={type} {...buttonProps}>{children}</button>;
}

function PlaceBasketAction({ placeId, basketItems, onAdded, onAuthRequired, onRefresh }) {
  const [status, setStatus] = useState('idle');
  const requestControllerRef = useRef(null);
  const hasPlaceId = placeId !== undefined && placeId !== null && String(placeId).trim() !== '';
  const isAdded = status === 'success' || basketHasUserPlace(basketItems, placeId);

  useEffect(() => {
    setStatus('idle');
    return () => {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    };
  }, [placeId]);

  const handleAdd = async () => {
    if (status === 'loading' || isAdded) return;

    if (!hasPlaceId) {
      setStatus('success');
      return;
    }

    if (!getAccessToken()) {
      onAuthRequired?.({ screen: 'place', id: placeId });
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setStatus('loading');

    try {
      const item = await addPlaceToCourseBasket(placeId, { signal: controller.signal });
      if (!controller.signal.aborted) {
        onAdded?.(item);
        setStatus('success');
      }
    } catch (error) {
      if (error?.name !== 'AbortError' && !controller.signal.aborted) {
        if (error?.status === 401) {
          onAuthRequired?.({ screen: 'place', id: placeId });
        } else if (isDuplicateBasketError(error)) {
          setStatus('success');
          onRefresh?.();
        } else {
          console.error('장소를 코스에 담지 못했어요', error);
          setStatus('error');
        }
      }
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
    }
  };

  const buttonLabel = {
    idle: '코스에 담기',
    loading: '담는 중…',
    success: '코스에 담았어요',
    error: '다시 담기',
  }[isAdded ? 'success' : status];

  return (
    <div className="place-basket-action">
      <CourseActionButton aria-busy={status === 'loading' || undefined} disabled={status === 'loading' || isAdded} onClick={handleAdd}>
        {buttonLabel}
      </CourseActionButton>
      {status === 'error' && <span className="place-basket-feedback error" role="alert">코스에 담지 못했어요. 다시 시도해주세요.</span>}
    </div>
  );
}

function KakaoPlaceActions({ place, basketItems, onAdded, onAuthRequired, onRefresh, hideMapLink = false }) {
  const [status, setStatus] = useState('idle');
  const requestControllerRef = useRef(null);
  const isAdded = status === 'success' || basketHasKakaoPlace(basketItems, place?.providerPlaceId);
  const placeUrl = getKakaoPlaceUrl(place);

  useEffect(() => {
    setStatus('idle');
    return () => {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    };
  }, [place?.providerPlaceId]);

  const handleAdd = async () => {
    if (status === 'loading' || isAdded) return;
    if (!getAccessToken()) {
      onAuthRequired?.({ screen: 'map' });
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setStatus('loading');

    try {
      const item = await addKakaoPlaceToCourseBasket(place, { signal: controller.signal });
      if (!controller.signal.aborted) {
        onAdded?.(item);
        setStatus('success');
      }
    } catch (error) {
      if (error?.name !== 'AbortError' && !controller.signal.aborted) {
        if (error?.status === 401) {
          onAuthRequired?.({ screen: 'map' });
        } else if (isDuplicateBasketError(error)) {
          setStatus('success');
          onRefresh?.();
        } else {
          console.error('카카오 장소를 코스에 담지 못했어요', error);
          setStatus('error');
        }
      }
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
    }
  };

  const buttonLabel = isAdded
    ? '코스에 담았어요'
    : status === 'loading'
      ? '담는 중…'
      : status === 'error'
        ? '다시 시도'
        : '코스에 담기';

  return (
    <div className="kakao-place-actions">
      <div className={`kakao-place-action-row${hideMapLink ? ' is-single' : ''}`}>
        <CourseActionButton
          aria-busy={status === 'loading' || undefined}
          aria-describedby={status === 'error' ? 'kakao-basket-error' : undefined}
          disabled={status === 'loading' || isAdded}
          onClick={handleAdd}
        >
          {buttonLabel}
        </CourseActionButton>
        {!hideMapLink && <a className="ui-button secondary kakao-map-link" href={placeUrl} target="_blank" rel="noopener noreferrer">
          <span>카카오맵에서 보기</span>
          <ExternalLink aria-hidden="true" size={17} strokeWidth={2} />
        </a>}
      </div>
      <p className="kakao-place-feedback" id="kakao-basket-error" aria-live="polite">
        {status === 'error' ? '코스에 담지 못했어요. 다시 시도해주세요.' : ''}
      </p>
    </div>
  );
}

function IconButton({ label, children, onClick, className = '' }) {
  const icons = { 이전: ChevronLeft, 더보기: MoreHorizontal, 저장: Heart, 저장됨: Heart, '장소 저장': Heart, '장소 저장 취소': Heart, 닫기: X, 도움말: CircleHelp };
  const Icon = icons[label];
  const isSaved = label === '저장됨' || label === '장소 저장 취소';
  return <button className={`icon-button ${className}`} onClick={onClick} type="button" aria-label={label} title={label}>{Icon ? <Icon aria-hidden="true" size={20} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} /> : children}</button>;
}

function BackHeader({ title, onBack, action, actionLabel = '더보기' }) {
  return <header className="screen-header">
    <IconButton label="이전" onClick={onBack}>‹</IconButton>
    <h1>{title}</h1>
    {action ? <IconButton label={actionLabel} onClick={action}>•••</IconButton> : <span className="header-space" />}
  </header>;
}

function SearchField({ value, onChange, onSubmit, placeholder, autoFocus = false, inputRef, onKeyDown }) {
  return (
    <form className="search-field" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <button className="search-field-icon" type="submit" aria-label="검색"><SearchIcon /></button>
      <input aria-label={placeholder} autoFocus={autoFocus} ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} />
      {value && <button type="button" className="clear-search" aria-label="검색어 지우기" onClick={() => onChange('')}><X aria-hidden="true" size={14} strokeWidth={2.4} /></button>}
    </form>
  );
}

function Chip({ children, active = false, onClick, tone = '', current = false }) {
  const className = `ui-chip ${active ? 'is-active' : ''} ${tone}`;
  return onClick ? <button type="button" className={className} onClick={onClick} aria-pressed={active} aria-current={current ? 'true' : undefined}>{children}</button> : <span className={className}>{children}</span>;
}

function StatusBanner({ tone = 'blue', title, copy, action, onAction }) {
  return <section className={`status-banner ${tone}`}>
    <div><strong>{title}</strong>{copy && <p>{copy}</p>}</div>
    {action && (onAction ? <button onClick={onAction} type="button">{action}</button> : <span className="status-banner-note">{action}</span>)}
  </section>;
}

function PlaceRow({ place, onClick, action, onAction, compactSearch = false, hideMeta = false }) {
  const isKakaoResult = place.externalSource === 'KAKAO';
  const media = place.image === images.myMap
    ? <VWorldMap ariaLabel={`${place.name} 코스 지도`} interactive={false} style={{ width: 64, height: 64, flex: '0 0 auto', borderRadius: 12, overflow: 'hidden' }} />
    : isKakaoResult
      ? null
    : <img src={place.image} alt="" loading="lazy" decoding="async" />;
  const topLabel = place.labels
    ? <div className="place-row-labels"><span>{place.labels.content}</span>{place.labels.category && <span>{place.labels.category}</span>}</div>
    : place.badge && <span className="small-badge">{place.badge}</span>;
  const topLine = place.showCongestion && !isKakaoResult
    ? <div className="place-row-congestion-line">{topLabel}<CongestionPointBadge compact={compactSearch} longitude={place.longitude} latitude={place.latitude} className="place-row-congestion-badge" /></div>
    : topLabel;
  const content = <>{media}<div className="place-row-copy">{topLine}<h3>{place.name}</h3>{!hideMeta && <p>{place.meta}</p>}</div></>;
  const className = `place-row${isKakaoResult ? ' is-kakao-result' : ''}${compactSearch ? ' is-compact-search-result' : ''}`;
  if (onClick && !action) return <button className={className} onClick={onClick} type="button">{content}<ChevronRight className="row-next" aria-hidden="true" size={20} /></button>;
  return <article className={className}>{content}{action && <button className="row-action" onClick={onAction} type="button">{action}</button>}</article>;
}

function EventImage({ event, className = '' }) {
  if (event.image) {
    return <img className={className} src={event.image} alt={`${event.name} 대표 이미지`} loading="lazy" decoding="async" />;
  }

  return (
    <span className={`event-image-placeholder ${className}`} role="img" aria-label={`${event.name} 대표 이미지 없음`}>
      <CalendarDays aria-hidden="true" size={22} strokeWidth={1.8} />
      <small>이미지 없음</small>
    </span>
  );
}

function EventListItem({ event, onClick }) {
  const dateLabel = formatCompactDateRange(event.startDate, event.endDate) || '일정 정보 없음';
  const timeLabel = formatEventListTime(event.eventTime);
  const venueLabel = eventVenueLabel(event);
  const decisionLabels = eventDecisionLabels(event);
  const congestion = useMockCrowdingAtPoint(event.longitude, event.latitude);
  const congestionLabel = getMockCongestionAccessibleLabel(congestion);
  const accessibleLabel = [eventStatusLabel(event), event.name, [dateLabel, timeLabel].filter(Boolean).join(' · '), venueLabel, congestionLabel, ...decisionLabels].filter(Boolean).join(' · ');

  return (
    <button className="event-list-item" type="button" onClick={onClick} aria-label={`${accessibleLabel} 상세 보기`}>
      <span className="event-list-media"><EventImage event={event} /></span>
      <span className="event-list-copy">
        <span className="event-list-topline">
          <span className={`event-status-label event-status-${currentEventState(event) === '진행 중' ? 'active' : currentEventState(event) === '종료' ? 'ended' : 'upcoming'}`}>{eventStatusLabel(event)}</span>
          <CongestionBadge congestion={congestion} compact />
        </span>
        <strong className="event-list-title">{event.name}</strong>
        <span className="event-list-schedule">
          <span><CalendarDays aria-hidden="true" size={15} strokeWidth={1.9} /><small>일정</small><b>{dateLabel}</b></span>
          {timeLabel && <span><Clock3 aria-hidden="true" size={15} strokeWidth={1.9} /><small>시간</small><b>{timeLabel}</b></span>}
        </span>
        <span className="event-list-venue"><MapPin aria-hidden="true" size={15} strokeWidth={1.9} /><span>{venueLabel}</span></span>
        {decisionLabels.length > 0 && <span className="event-decision-labels">{decisionLabels.map((label) => <span key={label}>{label}</span>)}</span>}
      </span>
      <ChevronRight className="event-list-next" aria-hidden="true" size={18} strokeWidth={2} />
    </button>
  );
}

function PlaceCard({ place, onClick, index = 0 }) {
  const entryTilt = index % 2 ? 'rotateY(2.5deg)' : 'rotateY(-2.5deg)';
  const hoverTilt = index % 2 ? 'rotateY(-1.2deg)' : 'rotateY(1.2deg)';
  const congestion = useMockCrowdingAtPoint(place.longitude, place.latitude);

  return (
    <motion.button
      className="place-card-v3 motion-place-card"
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, transform: `perspective(1000px) translateY(20px) rotateX(4deg) ${entryTilt} translateZ(-18px) scale(.985)` }}
      animate={{ opacity: 1, transform: 'perspective(1000px) translateY(0px) rotateX(0deg) rotateY(0deg) translateZ(0px) scale(1)' }}
      whileHover={{ transform: `perspective(1000px) translateY(-6px) rotateX(2deg) ${hoverTilt} translateZ(14px) scale(1.01)` }}
      whileTap={{ transform: 'perspective(1000px) translateY(0px) rotateX(0deg) rotateY(0deg) translateZ(0px) scale(.975)' }}
      transition={{ duration: 0.28, delay: index * 0.06, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="place-card-image">
        {place.image === images.myMap ? <VWorldMap ariaLabel={`${place.name} 코스 지도`} interactive={false} style={{ width: '100%', height: '100%' }} /> : place.isEvent ? <EventImage event={place} /> : <img src={place.image} alt="" loading="lazy" decoding="async" />}
        <CongestionBadge congestion={congestion} className="congestion-badge-on-media" compact />
      </div>
      <div className="place-card-copy">
        {place.badge && <span className="place-card-kicker">{place.badge}</span>}
        <h3>{place.name}</h3>
        <p>{place.meta}</p>
      </div>
    </motion.button>
  );
}

function ScreenSection({ title, subtitle, action, onAction, children }) {
  return <section className="content-section">
    <div className="section-title-row"><h2>{title}</h2>{action && (onAction ? <button type="button" onClick={onAction}>{action}</button> : <span className="section-action-note">{action}</span>)}</div>
    {subtitle && <p className="section-subtitle">{subtitle}</p>}
    {children}
  </section>;
}

function MapStage({ children, variant = 'home', mapProps = {} }) {
  const mapLabel = variant === 'navigation' ? '경로 안내 지도' : variant === 'complete' ? '완료한 코스 지도' : '서울과 주변 지도';
  return <div className={`map-stage ${variant}`}><VWorldMap ariaLabel={mapLabel} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} {...mapProps} />{children}</div>;
}

function BottomSheet({ children, className = '', animated = false }) {
  const sheetClassName = `bottom-sheet ${className} ${animated ? 'motion-depth-sheet' : ''}`;
  const sheetMotion = {
    initial: { opacity: 0, transform: 'perspective(1000px) translateY(42px) rotateX(-6deg) translateZ(-24px) scale(.985)' },
    animate: { opacity: 1, transform: 'perspective(1000px) translateY(0px) rotateX(0deg) translateZ(0px) scale(1)' },
    transition: { duration: 0.28, delay: 0.08, ease: [0.23, 1, 0.32, 1] },
  };

  if (animated) {
    return <motion.section className={sheetClassName} {...sheetMotion}><span className="sheet-handle" />{children}</motion.section>;
  }

  return <section className={sheetClassName}><span className="sheet-handle" />{children}</section>;
}

function DetailContentSheet({ children, className = '' }) {
  const sheetClassName = ['detail-content-sheet', className].filter(Boolean).join(' ');
  return <div className={sheetClassName}>{children}</div>;
}

function DetailHeroControls({ onBack, onSave, saveLabel = '장소 저장' }) {
  return (
    <div className="detail-controls">
      <IconButton label="이전" onClick={onBack}><ChevronLeft aria-hidden="true" size={20} strokeWidth={2} /></IconButton>
      {onSave && <IconButton label={saveLabel} onClick={onSave}><Heart aria-hidden="true" size={19} strokeWidth={2} /></IconButton>}
    </div>
  );
}

const AUTH_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateAuthForm(values, isSignup) {
  const errors = {};
  const email = values.email.trim();
  if (!email) errors.email = '이메일을 입력해주세요.';
  else if (!AUTH_EMAIL_PATTERN.test(email)) errors.email = '올바른 이메일 주소를 입력해주세요.';
  if (!values.password) errors.password = '비밀번호를 입력해주세요.';
  else if (values.password.length < 8) errors.password = '비밀번호는 8자 이상 입력해주세요.';
  if (isSignup) {
    if (!values.nickname.trim()) errors.nickname = '닉네임을 입력해주세요.';
    else if (values.nickname.trim().length > 30) errors.nickname = '닉네임은 30자 이하로 입력해주세요.';
    if (!values.requiredTerms) errors.requiredTerms = '필수 약관에 동의해주세요.';
  }
  return errors;
}

function AuthField({ id, label, error, ...inputProps }) {
  const errorId = `${id}-error`;
  return <label className={`field-label ${error ? 'has-error' : ''}`} htmlFor={id}>
    {label}
    <input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...inputProps} />
    {error && <span className="field-error" id={errorId} role="alert">{error}</span>}
  </label>;
}

function AuthForm({ screen, go, onLoginSuccess }) {
  const isSignup = screen === 'signup';
  const [form, setForm] = useState({ email: '', password: '', nickname: '', requiredTerms: false, marketingTerms: false });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, type, value, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setServerError('');
  };

  const handleAllTermsChange = ({ target: { checked } }) => {
    setForm((current) => ({ ...current, requiredTerms: checked, marketingTerms: checked }));
    setFieldErrors((current) => ({ ...current, requiredTerms: undefined }));
    setServerError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    const errors = validateAuthForm(form, isSignup);
    setFieldErrors(errors);
    setServerError('');
    if (Object.keys(errors).length) return;
    setIsSubmitting(true);
    try {
      const result = isSignup
        ? await signup({ email: form.email.trim(), password: form.password, nickname: form.nickname.trim() })
        : await login({ email: form.email.trim(), password: form.password });
      saveAuth(result);
      if (isSignup) go('onboarding');
      else if (onLoginSuccess) onLoginSuccess();
      else go('map');
    } catch (error) {
      setServerError(error instanceof Error ? error.message : '요청을 처리하지 못했어요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return <section className="phone standard-screen auth-form-screen"><main className="page-scroll form-scroll auth-form-scroll" aria-busy={isSubmitting}>
    <IconButton label="이전" className="auth-back" onClick={() => go('intro')} />
    <div className="form-heading"><h2 id="auth-form-title">{isSignup ? '때마침을 시작해볼까요?' : '다시 만나서 반가워요'}</h2><p>{isSignup ? '가입 후 관심 장소와 알림을 설정할 수 있어요.' : '저장한 코스와 여행 기록을 이어서 확인하세요.'}</p></div>
    <form className="auth-form" aria-labelledby="auth-form-title" noValidate onSubmit={handleSubmit}>
      <AuthField id="auth-email" name="email" label="이메일" type="email" value={form.email} onChange={handleChange} error={fieldErrors.email} placeholder="이메일을 입력해주세요" autoComplete="email" disabled={isSubmitting} />
      <AuthField id="auth-password" name="password" label="비밀번호" type="password" value={form.password} onChange={handleChange} error={fieldErrors.password} placeholder={isSignup ? '8자 이상 입력해주세요' : '비밀번호를 입력해주세요'} autoComplete={isSignup ? 'new-password' : 'current-password'} disabled={isSubmitting} />
      {!isSignup && <button type="button" className="forgot-password" disabled={isSubmitting}>비밀번호 찾기</button>}
      {isSignup && <><AuthField id="auth-nickname" name="nickname" label="닉네임" value={form.nickname} onChange={handleChange} error={fieldErrors.nickname} placeholder="사용할 닉네임을 입력해주세요" disabled={isSubmitting} /><div className="terms-group"><label className="check-row all-check"><input type="checkbox" checked={form.requiredTerms && form.marketingTerms} onChange={handleAllTermsChange} disabled={isSubmitting} /> 전체 동의</label><label className={`check-row ${fieldErrors.requiredTerms ? 'has-error' : ''}`}><input name="requiredTerms" type="checkbox" checked={form.requiredTerms} onChange={handleChange} disabled={isSubmitting} /> [필수] 이용약관 및 개인정보처리방침</label><label className="check-row"><input name="marketingTerms" type="checkbox" checked={form.marketingTerms} onChange={handleChange} disabled={isSubmitting} /> [선택] 장소 추천과 이벤트 알림</label>{fieldErrors.requiredTerms && <span className="field-error terms-error" role="alert">{fieldErrors.requiredTerms}</span>}</div></>}
      {serverError && <p className="auth-server-error" role="alert">{serverError}</p>}
      <ActionButton type="submit" disabled={isSubmitting}>{isSubmitting ? (isSignup ? '가입 중...' : '로그인 중...') : (isSignup ? '회원가입' : '로그인')}</ActionButton>
      {!isSignup && <><div className="divider-text"><span />또는<span /></div><div className="social-actions"><ActionButton className="auth-kakao" disabled>카카오로 계속하기</ActionButton><ActionButton tone="secondary" disabled>Apple로 계속하기</ActionButton></div></>}
      <p className="form-foot">{isSignup ? '이미 계정이 있나요?' : '계정이 없나요?'} <button onClick={() => go(isSignup ? 'login' : 'signup')} type="button" disabled={isSubmitting}>{isSignup ? '로그인' : '회원가입'}</button></p>
    </form>
  </main></section>;
}

function useUserLocation() {
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => setUserLocation([coords.longitude, coords.latitude]),
      () => setUserLocation(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return userLocation;
}

function DetailMapSection({ title, meta, ariaLabel, places, userLocation, placeMarkerLabel }) {
  const mapPlaces = useMemo(
    () => (places ?? []).filter((place) => Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude))),
    [places],
  );
  const mapCenter = useMemo(() => {
    if (!mapPlaces.length) return [126.978, 37.5665];
    return [
      mapPlaces.reduce((sum, place) => sum + Number(place.longitude), 0) / mapPlaces.length,
      mapPlaces.reduce((sum, place) => sum + Number(place.latitude), 0) / mapPlaces.length,
    ];
  }, [mapPlaces]);
  const loadMapPlaces = useCallback(() => Promise.resolve(mapPlaces), [mapPlaces]);
  const placeRequestKey = mapPlaces
    .map((place) => `${place.id ?? place.name}-${place.latitude}-${place.longitude}`)
    .join('|');

  if (!mapPlaces.length) return null;

  return (
    <section className="filming-work-map-section">
      <header>
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </header>
      <div className="filming-work-map-preview">
        <VWorldMap
          ariaLabel={ariaLabel}
          center={mapCenter}
          zoom={14.5}
          interactive
          loadPlacesInBounds={loadMapPlaces}
          placeMarkerLabel={placeMarkerLabel}
          clusterPlaces={false}
          fitPlaceMarkers
          fitUserLocation
          userLocation={userLocation}
          placeRequestKey={placeRequestKey}
        />
      </div>
    </section>
  );
}

function AuthScreen({ screen, go, onLoginSuccess }) {
  const [themes, setThemes] = useState(['촬영지', '요즘 뜨는 곳']);
  const [pace, setPace] = useState('여유롭게');
  const [tripTime, setTripTime] = useState('5시간');
  const [permissions, setPermissions] = useState(['위치', '알림']);
  if (screen === 'splash') {
    return <section className="phone auth-screen splash-screen"><div className="splash-orbit" /><div className="splash-brand">ㅌ</div><h1>때마침</h1><p>걷기 좋은 순간, 도착하는 여행</p><div className="splash-progress"><span /></div><button className="full-screen-hit" onClick={() => go('intro')} aria-label="서비스 시작" /></section>;
  }
  if (screen === 'intro') {
    return <ScrollOnboarding go={go} />;
  }
  if (screen === 'login' || screen === 'signup') {
    return <AuthForm screen={screen} go={go} onLoginSuccess={onLoginSuccess} />;
  }
  const step = screen === 'onboarding' ? 1 : screen === 'onboarding-schedule' ? 2 : 3;
  const goNext = () => go(screen === 'onboarding' ? 'onboarding-schedule' : screen === 'onboarding-schedule' ? 'onboarding-permissions' : 'map');
  return <section className="phone standard-screen onboarding-screen onboarding-v3"><main className="page-scroll onboarding-scroll"><div className="onboarding-progress"><strong>{step} / 3</strong><span><i style={{ transform: `scaleX(${step / 3})` }} /></span></div>{screen === 'onboarding' && <><div className="onboarding-copy"><h1>어떤 장소를 좋아하세요?</h1><p>관심 있는 테마를 고르면 첫 코스를 더 잘 추천할 수 있어요.</p></div><div className="onboarding-topic-list">{[['촬영지', '영화와 드라마 속 장면'], ['요즘 뜨는 곳', '저장과 사진 반응이 빠른 장소'], ['팝업·전시', '이번 주에만 만날 수 있는 공간'], ['골목·산책', '천천히 걷기 좋은 서울의 길'], ['카페·디저트', '메뉴와 공간이 함께 좋은 곳']].map(([name, copy]) => { const selected = themes.includes(name); return <button type="button" className={selected ? 'selected' : ''} key={name} onClick={() => setThemes((current) => selected ? current.filter((item) => item !== name) : [...current, name])}><i /><span><strong>{name}</strong><small>{copy}</small></span></button>; })}</div></>}{screen === 'onboarding-schedule' && <><div className="onboarding-copy"><h1>오늘 여행은 어떤 느낌이 좋아요?</h1><p>일정 밀도와 사용할 수 있는 시간을 알려주세요.</p></div><section className="onboarding-group"><h2>일정 밀도</h2><div className="onboarding-density-grid">{[['여유롭게', '장소마다 충분히 머물고 싶어요'], ['촘촘하게', '더 많은 장소를 방문하고 싶어요']].map(([name, copy]) => <button type="button" className={pace === name ? 'selected' : ''} key={name} onClick={() => setPace(name)}><strong>{name}</strong><small>{copy}</small></button>)}</div></section><section className="onboarding-group"><h2>여행 시간</h2><div className="onboarding-duration-grid">{[['3시간', '가볍게 반나절 걷기'], ['5시간', '점심부터 저녁 전까지'], ['하루 종일', '여유 있는 서울 여행']].map(([name, copy]) => <button type="button" className={tripTime === name ? 'selected' : ''} key={name} onClick={() => setTripTime(name)}><strong>{name}</strong><small>{copy}</small></button>)}</div></section></>}{screen === 'onboarding-permissions' && <><div className="onboarding-copy"><h1>필요한 순간에 알려드릴게요</h1><p>권한은 해당 기능을 사용할 때만 요청해요.</p></div><div className="onboarding-permission-list">{[['위치', '길 안내와 도착 감지에 사용'], ['알림', '혼잡 변화와 주변 장소 안내'], ['카메라', '촬영 장면 구도 맞추기'], ['사진', '방문 인증 사진 저장']].map(([name, copy]) => { const selected = permissions.includes(name); return <button type="button" className={selected ? 'selected' : ''} key={name} onClick={() => setPermissions((current) => selected ? current.filter((item) => item !== name) : [...current, name])}><i>{selected ? '✓' : ''}</i><span><strong>{name}</strong><small>{copy}</small></span></button>; })}</div><button type="button" className="onboarding-later" onClick={goNext}>나중에 설정<span>MY에서 언제든 변경 가능</span></button></>}</main><div className="sticky-actions"><ActionButton onClick={goNext}>{screen === 'onboarding-permissions' ? '때마침 시작' : '다음'}</ActionButton></div></section>;
}

const MAP_FILTER_ICONS = {
  ALL: MapPin,
  FILMING: Clapperboard,
  HOT: Flame,
  EVENT: CalendarDays,
  RESTAURANT: Utensils,
  CAFE_DESSERT: Coffee,
};

const FILMING_COLLECTION_FILTERS = [
  { label: '전체', contentType: null },
  { label: '드라마', contentType: 'DRAMA' },
  { label: '예능', contentType: 'VARIETY' },
  { label: '영화', contentType: 'MOVIE' },
];

const FILMING_COLLECTION_PAGE_SIZE = 12;

function normalizeMapCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function normalizeMapTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => normalizeMapCode(typeof tag === 'string' ? tag : tag?.code)).filter(Boolean);
  }
  return normalizeMapCode(tags) ? [normalizeMapCode(tags)] : [];
}

function MapHome({ go, basketState, onBasketAdded, onBasketRefresh, onAuthRequired }) {
  const initialSelectionRef = useRef(null);
  if (!initialSelectionRef.current) {
    const kakaoPlace = consumeKakaoMapTarget();
    initialSelectionRef.current = kakaoPlace
      ? { place: kakaoPlace, isSheetOpen: true }
      : { place: null, isSheetOpen: false };
  }
  const [selectedPlace, setSelectedPlace] = useState(initialSelectionRef.current.place);
  const [isPlaceSheetOpen, setIsPlaceSheetOpen] = useState(initialSelectionRef.current.isSheetOpen);
  const [isInlineSearchOpen, setIsInlineSearchOpen] = useState(false);
  const inlineSearchInputRef = useRef(null);
  const inlineSearch = usePlaceSearch({ includeMedia: false });
  const [isRouteRequested, setIsRouteRequested] = useState(false);
  const [routeModeSelection, dispatchRouteModeSelection] = useReducer(routeModeSelectionReducer, {
    activeMode: 'WALK',
    manuallySelected: false,
  });
  const activeRouteMode = routeModeSelection.activeMode;
  const [activeMapFilterKeys, setActiveMapFilterKeys] = useState([]);
  const reduceMotion = useReducedMotion();
  const [activeEvents, setActiveEvents] = useState([]);
  const [eventStatus, setEventStatus] = useState('loading');
  const [loadedMapFilterKey, setLoadedMapFilterKey] = useState(null);
  const [visibleMapItemCount, setVisibleMapItemCount] = useState(0);
  const [mapHomeInteraction, dispatchMapHomeInteraction] = useReducer(
    mapHomeInteractionReducer,
    typeof window === 'undefined' ? null : window.innerHeight,
    (viewportHeight) => ({
      ...createInitialMapHomeInteraction(viewportHeight),
      isMapFocused: Boolean(selectedPlace),
    }),
  );
  const { isMapFocused } = mapHomeInteraction;
  const selectedDestination = normalizeRouteCoordinate(selectedPlace
    ? { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude }
    : null);
  const routeDestination = isRouteRequested ? selectedDestination : null;
  const {
    location,
    status: locationStatus,
    errorCode: locationErrorCode,
    locate,
  } = useCurrentLocation({ auto: false });
  const {
    data: routeData,
    status: routeStatus,
    retry: retryRoute,
  } = useRouteComparison({ origin: location, destination: routeDestination });
  const routeSelectionKey = selectedPlace && isRouteRequested
    ? `${selectedPlace.externalSource || 'INTERNAL'}:${selectedPlace.id}`
    : '';
  const routeSelectionKeyRef = useRef(routeSelectionKey);
  const routeDataIsCurrent = routeSelectionKeyRef.current === routeSelectionKey;
  const effectiveRouteData = routeDataIsCurrent ? routeData : null;
  const effectiveRouteStatus = routeDataIsCurrent
    ? routeStatus
    : locationStatus === 'ready' ? 'loading' : 'idle';
  const selectedRoute = routeOptionByMode(effectiveRouteData, activeRouteMode);
  const activeMapFilters = MAP_HOME_FILTERS.filter(
    (filter) => filter.key !== 'ALL' && activeMapFilterKeys.includes(filter.key),
  );
  const activeMapFilterKey = activeMapFilterKeys.join(',');

  useEffect(() => subscribeToMapHomeViewport(window, dispatchMapHomeInteraction), []);

  useEffect(() => {
    if (!isInlineSearchOpen) return undefined;
    inlineSearchInputRef.current?.focus();
    return undefined;
  }, [isInlineSearchOpen]);

  useEffect(() => {
    routeSelectionKeyRef.current = routeSelectionKey;
  }, [routeSelectionKey]);

  useEffect(() => {
    if (effectiveRouteStatus !== 'ready') return;
    dispatchRouteModeSelection({ type: 'ROUTES_READY', routeData: effectiveRouteData });
  }, [effectiveRouteData, effectiveRouteStatus, routeSelectionKey]);

  useEffect(() => {
    if (shouldLocateForDestinationSelection(locationStatus, routeDestination)) locate();
  }, [locate, routeSelectionKey]);

  useEffect(() => {
    const controller = new AbortController();
    setEventStatus('loading');
    fetchEvents({ status: 'ONGOING', size: 200, signal: controller.signal })
      .then((page) => {
        if (controller.signal.aborted) return;
        setActiveEvents(page.content ?? []);
        setEventStatus('ready');
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setActiveEvents([]);
        setEventStatus('error');
      });
    return () => controller.abort();
  }, []);

  const selectedPlaceCard = selectedPlace?.externalSource === 'KAKAO'
    ? {
        ...mapKakaoPlaceToMapCard(selectedPlace),
        image: images.mapPlace,
      }
    : selectedPlace
      ? {
          ...placeToCardProps({ ...selectedPlace, imageUrl: selectedPlace.imageUrl || images.mapPlace }),
          showCongestion: true,
        }
      : null;
  const selectedPlaceBasketId = selectedPlace?.externalSource === 'EVENT'
    ? selectedPlace.placeId
    : selectedPlace?.id;
  const eventVenueBasketPlace = selectedPlace?.externalSource === 'EVENT' && !selectedPlaceBasketId
    ? {
        providerPlaceId: String(selectedPlace.eventId ?? selectedPlace.id).replace(/^event:/, ''),
        name: selectedPlace.name,
        categoryName: '전시·행사',
        categoryGroupCode: 'EVENT',
        roadAddress: selectedPlace.roadAddress,
        longitude: selectedPlace.longitude,
        latitude: selectedPlace.latitude,
      }
    : null;
  const selectedPlaceDetail = selectedPlace?.externalSource === 'EVENT'
    ? { screen: 'event-detail', id: selectedPlace.eventId ?? selectedPlace.id }
    : selectedPlace?.externalSource === 'KAKAO' || !selectedPlace || !selectedPlaceBasketId
      ? null
      : { screen: 'place', id: selectedPlaceBasketId };
  const selectMapFilter = (option) => {
    setActiveMapFilterKeys((current) => toggleMapFilterSelection(current, option.key));
    setSelectedPlace(null);
    setIsPlaceSheetOpen(false);
    setIsRouteRequested(false);
    setLoadedMapFilterKey(null);
  };
  const selectPlace = (place) => {
    setSelectedPlace(place);
    setIsPlaceSheetOpen(true);
    setIsRouteRequested(false);
    dispatchRouteModeSelection({ type: 'PLACE_CHANGED' });
    dispatchMapHomeInteraction({ type: 'PLACE_SELECTED' });
  };
  const openInlineSearch = () => setIsInlineSearchOpen(true);
  const closeInlineSearch = () => {
    setIsInlineSearchOpen(false);
    inlineSearch.resetSearch();
  };
  const submitInlineSearch = () => {
    const normalizedQuery = inlineSearch.query.trim();
    if (!normalizedQuery) return;
    inlineSearch.runSearch(normalizedQuery);
  };
  const handleInlineSearchKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeInlineSearch();
  };
  const openInlineKakaoPlaceOnMap = (place) => {
    selectPlace(place);
    closeInlineSearch();
  };
  const openInlinePlaceOnMap = (place) => {
    selectPlace(place);
    closeInlineSearch();
  };
  const handleLocate = useCallback(() => locate().then((nextLocation) => {
    if (!nextLocation) return null;
    window.dispatchEvent(new CustomEvent('vworld:user-location', {
      detail: [nextLocation.longitude, nextLocation.latitude],
    }));
    return nextLocation;
  }), [locate]);
  const isInsideMapBounds = (item, bounds) => {
    const latitude = Number(item?.latitude);
    const longitude = Number(item?.longitude);
    return Number.isFinite(latitude)
      && Number.isFinite(longitude)
      && latitude >= bounds.minLat
      && latitude <= bounds.maxLat
      && longitude >= bounds.minLng
      && longitude <= bounds.maxLng;
  };
  const activeFilterHasError = activeMapFilterKeys.some((filterKey) => (
    filterKey === 'EVENT' && eventStatus === 'error'
  ));
  const activeFilterIsLoading = activeMapFilterKeys.some((filterKey) => (
    filterKey === 'EVENT' && eventStatus === 'loading'
  ));
  const activeFilterEmpty = activeMapFilterKeys.length > 0
    && !activeFilterHasError
    && !activeFilterIsLoading
    && loadedMapFilterKey === activeMapFilterKey
    && visibleMapItemCount === 0;
  const activeFilterLabel = activeMapFilters.map((filter) => filter.label).join(', ');

  return (
    <section
      className="phone map-home-screen"
      data-map-focused={isMapFocused || undefined}
    >
      <MapStage
        mapProps={{
          center: selectedPlace ? [selectedPlace.longitude, selectedPlace.latitude] : ANGUK_STATION_CENTER,
          zoom: selectedPlace ? 17 : 15,
          loadPlacesInBounds: async (bounds) => {
            const loadItemsForBounds = async (targetBounds) => {
              const groups = await Promise.all(activeMapFilters.map(async (filter) => {
              const placesInBounds = filter.key === 'HOT'
                ? (await fetchPlaceTrends({ limit: Math.min(targetBounds.limit ?? 50, 50) }))
                    .filter((place) => isInsideMapBounds(place, targetBounds))
                    .map((place) => ({ ...place, id: place.placeId ?? place.id }))
                : await fetchMapPlaces({
                    ...targetBounds,
                    limit: targetBounds.limit,
                    ...mapFilterApiParams(filter),
                  });
              const eventMarkers = mapEventsForFilter(activeEvents, filter.key)
                .filter((event) => isInsideMapBounds(event, targetBounds))
                .map(eventToMapMarker);
              return tagMapItemsForFilter([...placesInBounds, ...eventMarkers], filter.key);
              }));
              return groups.flat();
            };
            const itemsInViewport = await loadItemsForBounds(bounds);
            const items = itemsInViewport.length || !activeMapFilters.length
              ? itemsInViewport
              : await loadItemsForBounds({ ...MAP_HOME_DISCOVERY_BOUNDS, limit: bounds.limit });
            const visibleItems = [];
            const visibleItemKeys = new Set();
            items.forEach((item) => {
              const itemKey = `${item.externalSource || 'INTERNAL'}:${item.id}`;
              if (visibleItemKeys.has(itemKey)) return;
              visibleItemKeys.add(itemKey);
              visibleItems.push(item);
            });
            if (selectedPlace) {
              const selectedItemKey = `${selectedPlace.externalSource || 'INTERNAL'}:${selectedPlace.id}`;
              if (!visibleItemKeys.has(selectedItemKey)) visibleItems.push(selectedPlace);
            }
            return visibleItems;
          },
          // The marker ring uses the same scored grid as the map layer so its
          // category icon and current congestion remain visually distinct.
          loadCongestionInBounds: fetchMockCrowdingGrids,
          showCongestionAreas: false,
          fitPlaceMarkers: true,
          placeLimit: 180,
          placeMarkerFilterKey: activeMapFilterKey,
          selectedPlaceKey: selectedPlace ? `${selectedPlace.externalSource || 'INTERNAL'}:${selectedPlace.id}` : '',
          focusedPlaceKey: selectedPlace ? `${selectedPlace.externalSource || 'INTERNAL'}:${selectedPlace.id}` : '',
          placeRequestKey: `${activeMapFilterKey}:${activeEvents.length}:${routeSelectionKey}`,
          routeLegs: selectedRoute?.status === 'AVAILABLE' ? selectedRoute.legs : [],
          routeMode: activeRouteMode,
          routeFitKey: selectedPlace ? `${selectedPlace.externalSource || 'INTERNAL'}:${selectedPlace.id}` : '',
          routeFitCoordinates: routeDestination && location
            ? [[location.longitude, location.latitude], [routeDestination.longitude, routeDestination.latitude]]
            : [],
          userLocation: location ? [location.longitude, location.latitude] : null,
          onMapClick: () => {
            if (isInlineSearchOpen) closeInlineSearch();
            setIsPlaceSheetOpen(false);
            setIsRouteRequested(false);
            dispatchMapHomeInteraction({ type: 'MAP_FOCUSED' });
          },
          onPlacesChange: (places) => {
            setVisibleMapItemCount(places.length);
            setLoadedMapFilterKey(activeMapFilterKey);
          },
          onPlaceClick: (place) => {
            selectPlace(place);
          },
        }}
      >
        {!isMapFocused && <div className="map-top-fade" />}
        {!isMapFocused
          ? <>
              <motion.header
                className="map-home-header"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 440, damping: 38 }}
              >
                <p>안국동 · 내 주변</p>
                <h1>오늘, 어디로 걸어볼까요?</h1>
              </motion.header>
              <motion.div
                className="map-home-controls"
                aria-label="지도 검색 및 필터"
                onKeyDown={isInlineSearchOpen ? handleInlineSearchKeyDown : undefined}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 440, damping: 38, delay: 0.03 }}
              >
                {isInlineSearchOpen ? <>
                  <div className="map-inline-search-bar">
                    <SearchField
                      value={inlineSearch.query}
                      onChange={inlineSearch.setQuery}
                      onSubmit={submitInlineSearch}
                      onKeyDown={handleInlineSearchKeyDown}
                      inputRef={inlineSearchInputRef}
                      placeholder="장소·지역·테마 검색"
                    />
                  </div>
                  <MapInlineSearchPanel
                    query={inlineSearch.query}
                    searched={inlineSearch.searched}
                    isSearching={inlineSearch.isSearching}
                    searchError={inlineSearch.searchError}
                    placeResults={inlineSearch.placeResults}
                    kakaoResults={inlineSearch.kakaoResults}
                    kakaoSearchUnavailable={inlineSearch.kakaoSearchUnavailable}
                    onInternalPlaceSelect={openInlinePlaceOnMap}
                    onKakaoPlaceSelect={openInlineKakaoPlaceOnMap}
                    onRetry={submitInlineSearch}
                  />
                </> : <>
                  <button className="map-search-trigger" onClick={openInlineSearch} type="button"><span><SearchIcon /></span>장소·지역·테마 검색</button>
                  <div className="map-category-heading">
                    <strong>장소 카테고리</strong>
                    <span>복수 선택 가능</span>
                  </div>
                  <div className="map-filter-bar" aria-label="장소 카테고리">
                    {MAP_HOME_FILTERS.filter((item) => item.key !== 'ALL').map((item) => {
                      const FilterIcon = MAP_FILTER_ICONS[item.key];
                      const selected = activeMapFilterKeys.includes(item.key);
                      return (
                        <button
                          className={`map-filter-chip is-${item.tone}${selected ? ' is-active' : ''}`}
                          key={item.key}
                          onClick={() => selectMapFilter(item)}
                          type="button"
                          aria-pressed={selected}
                        >
                          <FilterIcon aria-hidden="true" size={16} strokeWidth={2} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </>}
              </motion.div>
            </>
          : <motion.div
              className="map-focused-controls"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 480, damping: 34 }}
            >
              <button
                className="map-search-restore"
                type="button"
                aria-label="검색 및 필터 펼치기"
                onClick={() => dispatchMapHomeInteraction({ type: 'SEARCH_RESTORED' })}
              >
                <SearchIcon />
              </button>
              {activeMapFilters.length > 0 && (
                <div className="map-filter-bar map-filter-bar-compact" aria-label="선택한 장소 카테고리">
                  {activeMapFilters.map((item) => {
                    const FilterIcon = MAP_FILTER_ICONS[item.key];
                    return (
                      <button
                        className={`map-filter-chip is-${item.tone} is-active`}
                        key={item.key}
                        onClick={() => selectMapFilter(item)}
                        type="button"
                        aria-pressed="true"
                      >
                        <FilterIcon aria-hidden="true" size={15} strokeWidth={2} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>}
        {!selectedPlace && !isInlineSearchOpen && (
          <aside
            className="map-congestion-legend"
            aria-label="혼잡도 색상 안내: 초록은 여유, 주황은 보통, 빨강은 붐빔"
          >
            <strong>혼잡도</strong>
            <span><i className="is-relaxed" aria-hidden="true" />여유</span>
            <span><i className="is-moderate" aria-hidden="true" />보통</span>
            <span><i className="is-crowded" aria-hidden="true" />붐빔</span>
          </aside>
        )}
        {(activeFilterHasError || activeFilterEmpty) && (
          <p className="map-filter-status" role="status">
            {activeFilterHasError
              ? `${activeFilterLabel} 중 일부 정보를 불러오지 못했어요`
              : `현재 표시할 ${activeFilterLabel}이 없어요`}
          </p>
        )}
        <MapPlacePulse />
        <button
          className={`map-location-button ${locationStatus === 'ready' ? 'is-located' : ''}`}
          type="button"
          aria-label="현재 위치로 이동"
          aria-pressed={locationStatus === 'ready'}
          aria-busy={locationStatus === 'locating' || undefined}
          onClick={handleLocate}
        >
          <LocateFixed aria-hidden="true" size={20} strokeWidth={2.2} />
        </button>
        <AnimatePresence initial={false}>
          {selectedPlace && isPlaceSheetOpen && !isInlineSearchOpen && <motion.section key={`${selectedPlace.externalSource || 'INTERNAL'}:${selectedPlace.id}`} className={`bottom-sheet map-nearby-sheet motion-depth-sheet${isRouteRequested ? ' has-selected-route' : ''}`} initial={{ opacity: 0, transform: 'translateY(42px)' }} animate={{ opacity: 1, transform: 'translateY(0)' }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(100%)' }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
          <div className="map-sheet-content">
            <PlaceRow place={selectedPlaceCard} onClick={selectedPlaceDetail ? () => go(selectedPlaceDetail.screen, selectedPlaceDetail.id) : undefined} />
            {!isRouteRequested && <section className="map-place-choice" aria-label="선택한 장소 작업">
              <div className="map-place-choice-actions">
                {selectedPlace.externalSource === 'KAKAO'
                  ? <KakaoPlaceActions place={selectedPlace} basketItems={basketState?.items} onAdded={onBasketAdded} onAuthRequired={onAuthRequired} onRefresh={onBasketRefresh} hideMapLink />
                  : selectedPlaceBasketId
                    ? <PlaceBasketAction placeId={selectedPlaceBasketId} basketItems={basketState?.items} onAdded={onBasketAdded} onAuthRequired={onAuthRequired} onRefresh={onBasketRefresh} />
                    : <KakaoPlaceActions place={eventVenueBasketPlace} basketItems={basketState?.items} onAdded={onBasketAdded} onAuthRequired={onAuthRequired} onRefresh={onBasketRefresh} hideMapLink />}
                <ActionButton tone="secondary" onClick={() => setIsRouteRequested(true)}>현재 위치에서 길찾기</ActionButton>
              </div>
            </section>}
            {isRouteRequested && <>
                <button className="map-route-back" type="button" onClick={() => setIsRouteRequested(false)}>‹ 장소 선택으로 돌아가기</button>
                <SelectedPlaceRoutePanel
                  selectedPlace={selectedPlace}
                  location={location}
                  locationStatus={locationStatus}
                  locationErrorCode={locationErrorCode}
                  routeStatus={effectiveRouteStatus}
                  routeData={effectiveRouteData}
                  activeMode={activeRouteMode}
                  originLabel="현재 위치"
                  onModeChange={(mode) => dispatchRouteModeSelection({ type: 'MODE_SELECTED', mode })}
                  onResolvedModeChange={(mode) => dispatchRouteModeSelection({ type: 'MODE_RESOLVED', mode })}
                  onRetryLocation={locate}
                  onRetryRoute={retryRoute}
                  taxiHref={activeRouteMode === 'TAXI' ? buildKakaoTaxiHref(routeDestination) : null}
                /></>}
          </div>
          </motion.section>}
        </AnimatePresence>
      </MapStage>
      <BottomNav active="map" onNavigate={(tab) => go(rootRoutes[tab])} />
    </section>
  );
}

function ExploreReveal({ children, delay = 0 }) {
  return (
    <motion.div
      className="explore-reveal"
      initial={{ opacity: 0, transform: 'perspective(1000px) translateY(22px) rotateX(4deg) translateZ(-18px)' }}
      animate={{ opacity: 1, transform: 'perspective(1000px) translateY(0px) rotateX(0deg) translateZ(0px)' }}
      transition={{ duration: 0.28, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}

function ExploreScreen({ go }) {
  const [query, setQuery] = useState('');
  const [trendPlaces, setTrendPlaces] = useState([]);
  const [visibleTrendCount, setVisibleTrendCount] = useState(EXPLORE_PAGE_SIZE);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState(false);
  const trendRequestRef = useRef(null);
  const loadPlaceTrends = useCallback(async () => {
    trendRequestRef.current?.abort();
    const requestController = new AbortController();
    trendRequestRef.current = requestController;
    setVisibleTrendCount(EXPLORE_PAGE_SIZE);
    setTrendLoading(true);
    setTrendError(false);
    try {
      const result = await fetchPlaceTrends({ limit: 50, signal: requestController.signal });
      if (requestController.signal.aborted || trendRequestRef.current !== requestController) return;
      setTrendPlaces(Array.isArray(result) ? result : []);
    } catch (error) {
      if (error?.name === 'AbortError' || requestController.signal.aborted) return;
      if (trendRequestRef.current !== requestController) return;
      console.error('탐색 트렌드를 불러오지 못했어요', error);
      setTrendError(true);
    } finally {
      if (trendRequestRef.current !== requestController) return;
      trendRequestRef.current = null;
      setTrendLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaceTrends();
    return () => {
      trendRequestRef.current?.abort();
      trendRequestRef.current = null;
    };
  }, [loadPlaceTrends]);

  const loadFilmingWorks = useCallback(
    ({ page, size }) => fetchFilmingWorks({ page, size }),
    [],
  );
  const loadPopupEvents = useCallback(
    ({ page, size }) => fetchEvents({ status: 'ONGOING', page, size }),
    [],
  );
  const filmingWorks = useHorizontalPagedList({ loadPage: loadFilmingWorks, mapItem: filmingWorkToExploreCardProps });
  const popups = useHorizontalPagedList({ loadPage: loadPopupEvents, mapItem: eventToCardProps });
  const visibleTrendPlaces = getVisiblePlaceTrends(trendPlaces);
  const displayedTrendPlaces = visibleTrendPlaces.slice(0, visibleTrendCount);
  const trendHasMore = visibleTrendCount < visibleTrendPlaces.length;
  const loadMoreTrendPlaces = useCallback(() => {
    setVisibleTrendCount((current) => Math.min(current + EXPLORE_PAGE_SIZE, visibleTrendPlaces.length));
  }, [visibleTrendPlaces.length]);

  const normalized = query.trim().toLowerCase();
  const trendSearchItems = getVisiblePlaceTrends(trendPlaces)
    .map((place) => ({ name: place?.name || '', meta: getPlaceTrendSearchText(place) }));
  const exploreItems = [
    ...trendSearchItems,
    ...filmingWorks.items,
    ...popups.items,
  ];
  const hasQueryResult = exploreItems.some((item) => `${item?.name || ''} ${item?.meta || ''}`.toLowerCase().includes(normalized));
  const loadError = filmingWorks.error && popups.error;
  return (
    <section className="phone standard-screen tab-screen">
      <main className="page-scroll explore-scroll">
        <motion.header
          className="tab-heading"
          initial={{ opacity: 0, transform: 'perspective(1000px) translateY(-12px) rotateX(-3deg) translateZ(-14px)' }}
          animate={{ opacity: 1, transform: 'perspective(1000px) translateY(0px) rotateX(0deg) translateZ(0px)' }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        >
          <SearchField value={query} onChange={setQuery} onSubmit={() => go(normalized ? 'search' : 'search')} placeholder="장소, 메뉴, 작품을 검색해보세요" />
        </motion.header>
        {loadError ? (
          <p className="search-empty">데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
        ) : normalized && !hasQueryResult ? (
          <EmptySearch query={query} onClear={() => setQuery('')} />
        ) : (
          <>
            <ExploreReveal delay={0.06}>
              <PlaceTrendSection
                error={trendError}
                isLoading={trendLoading}
                onPlaceSelect={(place) => go('place', place.placeId)}
                onRetry={loadPlaceTrends}
                onViewAll={() => go('trending')}
                renderCards={({ places, isLoading, error, onRetry, onPlaceSelect }) => {
                  const cardItems = places.map((place) => getPlaceTrendCardProps(place, images.cafe));
                  return <ExploreCoverflow
                    items={cardItems}
                    hasMore={trendHasMore}
                    isLoading={isLoading}
                    error={error}
                    onRetry={onRetry}
                    onLoadMore={loadMoreTrendPlaces}
                    onCardClick={(card) => {
                      const selectedPlace = places.find((place) => (place.placeId ?? place.id) === card.id);
                      if (selectedPlace) onPlaceSelect?.(selectedPlace);
                    }}
                    ariaLabel="요즘 주목받는 장소"
                    emptyLabel="아직 주목할 만한 장소가 없어요."
                    errorLabel="트렌드 정보를 불러오지 못했어요."
                  />;
                }}
                renderSection={({ title, subtitle, action, onAction, children }) => (
                  <ScreenSection title={title} subtitle={subtitle} action={action} onAction={onAction}>{children}</ScreenSection>
                )}
                trends={displayedTrendPlaces}
              />
            </ExploreReveal>
            <ExploreReveal delay={0.12}>
              <ScreenSection title="장면 속으로" subtitle="서울의 촬영지를 품은 작품" action="전체보기" onAction={() => go('filming-locations')}>
                <ExploreCoverflow
                  ariaLabel="촬영 작품"
                  emptyLabel="촬영 작품이 아직 없어요"
                  error={filmingWorks.error}
                  errorLabel="촬영 작품을 불러오지 못했어요."
                  hasMore={filmingWorks.hasMore}
                  isLoading={filmingWorks.isLoading}
                  items={filmingWorks.items}
                  onCardClick={(work) => go('filming-work', work.id)}
                  onLoadMore={filmingWorks.loadMore}
                  onRetry={filmingWorks.loadMore}
                />
              </ScreenSection>
            </ExploreReveal>
            <ExploreReveal delay={0.18}>
              <ScreenSection title="지금 열리는 행사" subtitle="지금 참여할 수 있는 행사와 프로그램을 모았어요." action="더보기" onAction={() => go('popups')}>
                <ExploreCoverflow
                  ariaLabel="지금 열리는 행사"
                  emptyLabel="행사가 아직 없어요"
                  error={popups.error}
                  errorLabel="행사를 불러오지 못했어요."
                  hasMore={popups.hasMore}
                  isLoading={popups.isLoading}
                  items={popups.items}
                  onCardClick={(event) => go('event-detail', event.id)}
                  onLoadMore={popups.loadMore}
                  onRetry={popups.loadMore}
                />
              </ScreenSection>
            </ExploreReveal>
          </>
        )}
      </main>
      <BottomNav active="explore" onNavigate={(tab) => go(rootRoutes[tab])} />
    </section>
  );
}

function EmptySearch({ query, onClear }) {
  return <section className="empty-search"><div className="empty-search-icon"><SearchX aria-hidden="true" size={28} strokeWidth={1.8} /></div><h2>검색 결과가 없어요</h2><p>{query ? `'${query}'` : '입력한'}와 일치하는 장소를 찾지 못했어요.</p><button type="button" onClick={onClear}>검색어 지우기</button></section>;
}

const WEEKDAY_LABEL = ['월', '화', '수', '목', '금', '토', '일'];

function formatOperatingTime(value) {
  if (typeof value !== 'string') return '?';
  const matched = value.match(/^(\d{1,2}:\d{2})/);
  return matched ? matched[1] : value;
}

function formatOperatingHours(hours) {
  if (!hours || hours.length === 0) return null;
  const entries = hours
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((h) => ({
      day: Number(h.dayOfWeek),
      schedule: h.closed ? '휴무' : `${formatOperatingTime(h.openTime)}-${formatOperatingTime(h.closeTime)}`,
    }))
    .filter((entry) => Number.isInteger(entry.day) && WEEKDAY_LABEL[entry.day]);
  if (!entries.length) return null;

  const groups = [];
  for (const entry of entries) {
    const previous = groups.at(-1);
    if (previous && previous.schedule === entry.schedule && previous.endDay + 1 === entry.day) {
      previous.endDay = entry.day;
    } else {
      groups.push({ startDay: entry.day, endDay: entry.day, schedule: entry.schedule });
    }
  }
  return groups
    .map(({ startDay, endDay, schedule }) => `${WEEKDAY_LABEL[startDay]}${startDay === endDay ? '' : `-${WEEKDAY_LABEL[endDay]}`} ${schedule}`)
    .join(' · ');
}

function filmingMediaLabel(mediaContent) {
  if (!mediaContent) return '작품 정보 확인 중';
  const mediaType = mediaContent.mediaType === 'movie'
    ? '영화'
    : mediaContent.mediaType === 'variety'
      ? '예능'
      : '드라마';
  return [mediaType, formatReleaseYear(mediaContent.releaseDate)].filter(Boolean).join(' · ');
}

function supportsSceneReenactment(filmingLocation) {
  const contentType = String(filmingLocation?.contentType ?? filmingLocation?.mediaContent?.mediaType ?? '').trim().toUpperCase();
  return contentType === 'DRAMA' || contentType === 'MOVIE';
}

function FilmingSceneSection({ filmingLocations, go, withHeading = true }) {
  if (!filmingLocations.length) return null;

  const sceneList = (
    <div className="place-filming-scene-list">
        {filmingLocations.map((item) => {
          const title = item.mediaContent?.title || '작품 정보 확인 중';
          const description = item.sceneDescription || '장면 설명을 준비 중이에요.';
          const sceneImage = tmdbPosterUrl(item.sceneImageUrl || item.imageUrl || item.mediaContent?.posterPath);
          return (
            <article className="place-filming-scene-card" key={item.id}>
              <div className="place-filming-scene-media">
                {sceneImage && <img src={sceneImage} alt={`${title} 장면 참고`} loading="lazy" decoding="async" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling.hidden = false; }} />}
                <span className="place-filming-scene-media-fallback" hidden={Boolean(sceneImage)} aria-hidden="true"><Clapperboard size={25} strokeWidth={1.7} /><small>장면 이미지 준비 중</small></span>
              </div>
              <div className="place-filming-scene-copy">
                <strong>{title}</strong>
                <span>{filmingMediaLabel(item.mediaContent)}</span>
                <p>{description}</p>
                {supportsSceneReenactment(item) && <button type="button" onClick={() => go('scene-detail', item.id)}><Camera aria-hidden="true" size={17} strokeWidth={1.9} />이 장면 따라 찍기 <ChevronRight aria-hidden="true" size={17} strokeWidth={2} /></button>}
              </div>
            </article>
          );
        })}
    </div>
  );

  return withHeading
    ? <ScreenSection title="이 장소에서 촬영된 장면" action={`${filmingLocations.length}개`}>{sceneList}</ScreenSection>
    : sceneList;
}

function PlaceDescriptionSection({ description }) {
  const descriptionRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
    const measureOverflow = () => {
      const element = descriptionRef.current;
      if (!element) return;
      const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight) || 20;
      setCanExpand(element.scrollHeight > lineHeight * 3 + 1);
    };
    const frame = window.requestAnimationFrame(measureOverflow);
    window.addEventListener('resize', measureOverflow);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureOverflow);
    };
  }, [description]);

  if (!description) return null;

  return (
    <ScreenSection title="장소 소개">
      <div className="why-card place-why-card place-description-card">
        <p ref={descriptionRef} className={`place-description-text${isExpanded ? ' is-expanded' : ''}`}>{description}</p>
        {canExpand && <button type="button" aria-expanded={isExpanded} onClick={() => setIsExpanded((current) => !current)}>{isExpanded ? '접기' : '더보기'}</button>}
      </div>
    </ScreenSection>
  );
}

function formatMenuPrice(price) {
  return Number.isFinite(price) ? `${price.toLocaleString('ko-KR')}원` : '가격 정보 없음';
}

function PlaceInfoTab({ place, hoursLabel, userLocation }) {
  const address = place.roadAddress || place.lotAddress || '주소 정보 없음';
  const placeMap = [{
    id: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
  }];
  const hasMap = Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude));

  return (
    <div className="place-info-tab">
      <div className="place-info-list">
        {hoursLabel && <div><Clock3 aria-hidden="true" size={18} /><span><small>운영시간</small><strong>{hoursLabel}</strong></span></div>}
        <div><MapPin aria-hidden="true" size={18} /><span><small>주소</small><strong>{address}</strong></span></div>
        {place.phone && <div><Phone aria-hidden="true" size={18} /><span><small>문의</small><strong>{place.phone}</strong></span></div>}
        {place.website && <a href={place.website} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={18} /><span><small>웹사이트</small><strong>공식 정보 확인하기</strong></span></a>}
      </div>
      <PlaceDescriptionSection description={place.description} />
      {hasMap && <section className="event-location-section place-location-section">
        <div className="event-location-heading"><div><h2>장소 위치</h2><p>{address}</p></div></div>
        <DetailMapSection title="" ariaLabel={`${place.name} 장소 지도`} places={placeMap} userLocation={userLocation} />
      </section>}
    </div>
  );
}

function PlaceMenuTab({ menus }) {
  return (
    <section className="place-menu-tab" aria-label="메뉴 목록">
      <header><div><h2>메뉴</h2><p>매장에서 제공하는 메뉴와 가격이에요.</p></div><span>{menus.length}개</span></header>
      <div className="place-menu-list">
        {menus.map((menu) => (
          <article key={menu.id}>
            {menu.imageUrl ? <img src={menu.imageUrl} alt="" loading="lazy" /> : <span className="place-menu-image-fallback"><Utensils aria-hidden="true" size={18} /></span>}
            <div><strong>{menu.name}</strong><span>{formatMenuPrice(menu.price)}</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PlaceFilmingTab({ filmingLocations, go }) {
  return (
    <section className="place-filming-tab" aria-label="촬영지 정보">
      <header><div><h2>이곳에서 촬영된 장면</h2><p>작품 속 장면을 보고 같은 구도로 촬영해보세요.</p></div></header>
      <FilmingSceneSection filmingLocations={filmingLocations} go={go} withHeading={false} />
    </section>
  );
}

function PlaceDetail({ go, placeId, basketState, onBasketAdded, onBasketRefresh, onAuthRequired }) {
  const [place, setPlace] = useState(null);
  const [placeTrend, setPlaceTrend] = useState(null);
  const [filmingLocations, setFilmingLocations] = useState([]);
  const [activeTab, setActiveTab] = useState('info');
  const [status, setStatus] = useState(placeId ? 'loading' : 'mock');
  const reduceMotion = useReducedMotion();
  const userLocation = useUserLocation();

  useEffect(() => {
    if (!placeId) {
      setStatus('mock');
      setPlaceTrend(null);
      setFilmingLocations([]);
      return undefined;
    }
    let cancelled = false;
    setActiveTab('info');
    setStatus('loading');
    setPlaceTrend(null);
    setFilmingLocations([]);
    Promise.allSettled([
      fetchPlace(placeId),
      fetchPlaceFilmingLocations(placeId),
      fetchPlaceTrends({ limit: PLACE_TREND_COLLECTION_LIMIT }),
    ])
      .then(([placeResult, filmingResult, trendsResult]) => {
        if (cancelled) return;
        if (placeResult.status === 'fulfilled') {
          setPlace(placeResult.value);
          setStatus('ready');
        } else {
          throw placeResult.reason;
        }
        if (filmingResult.status === 'fulfilled') {
          setFilmingLocations(filmingResult.value ?? []);
        } else {
          console.error('촬영지 장면 정보를 불러오지 못했어요', filmingResult.reason);
        }
        if (trendsResult.status === 'fulfilled') {
          const matchingTrend = (Array.isArray(trendsResult.value) ? trendsResult.value : [])
            .find((trendPlace) => String(trendPlace?.placeId ?? trendPlace?.id) === String(placeId));
          setPlaceTrend(matchingTrend?.trend ?? null);
        } else {
          console.error('장소 트렌드 정보를 불러오지 못했어요', trendsResult.reason);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('장소 상세를 불러오지 못했어요', error);
          setStatus('error');
        }
      });
    return () => { cancelled = true; };
  }, [placeId]);

  if (status === 'mock') {
    return (
      <section className="phone standard-screen place-detail-screen">
        <main className="page-scroll">
          <div className="detail-hero"><img src={images.detail} alt="도토리가든 외관" /><DetailHeroControls onBack={() => go('explore')} /></div>
          <DetailContentSheet className="detail-content detail-content-v3">
            <p className="eyebrow">안국 · 카페</p>
            <h1>도토리가든</h1>
            <p className="detail-meta">매일 10:00-21:00</p>
            <div className="chip-row"><Chip active>지금 여유</Chip><Chip>도보 8분</Chip></div>
            <p className="place-detail-summary"><PlaceTrendSummary trend={PLACE_TREND_MOCK_FIXTURE} /></p>
            <ScreenSection title="방문자 후기"><PlaceReviewPreview onViewAll={() => go('reviews')} summary={PLACE_REVIEW_SUMMARY} reviews={PLACE_REVIEW_ITEMS} /></ScreenSection>
          </DetailContentSheet>
        </main>
        <div className="sticky-actions split place-actions"><PlaceBasketAction placeId={placeId} basketItems={basketState?.items} onAdded={onBasketAdded} onAuthRequired={onAuthRequired} onRefresh={onBasketRefresh} /><ActionButton tone="secondary" onClick={() => go('write-review')}>후기 남기기</ActionButton></div>
      </section>
    );
  }

  if (status === 'loading') {
    return <section className="phone standard-screen place-detail-screen"><main className="page-scroll centered-state"><BrandLoading /><h1>장소 정보를 불러오고 있어요</h1></main></section>;
  }

  if (status === 'error' || !place) {
    return <section className="phone standard-screen place-detail-screen"><BackHeader title="장소" onBack={() => go('explore')} /><main className="page-scroll centered-state"><h1>정보를 불러오지 못했어요</h1><p>잠시 후 다시 시도해주세요.</p></main></section>;
  }

  const heroImage = place.imageUrl || images.detail;
  const hoursLabel = formatOperatingHours(place.operatingHours) || place.operatingHoursRaw || null;
  const menus = Array.isArray(place.menus) ? place.menus : [];
  const tabs = [
    { id: 'info', label: '정보' },
    ...(menus.length ? [{ id: 'menu', label: '메뉴', count: menus.length }] : []),
    ...(filmingLocations.length ? [{ id: 'filming', label: '촬영지', count: filmingLocations.length }] : []),
    { id: 'review', label: '후기', count: PLACE_REVIEW_SUMMARY.reviewCount },
  ];

  const tabContent = {
    info: <PlaceInfoTab place={place} hoursLabel={hoursLabel} userLocation={userLocation} />,
    menu: <PlaceMenuTab menus={menus} />,
    review: <PlaceReviewPreview onViewAll={() => go('reviews')} summary={PLACE_REVIEW_SUMMARY} reviews={PLACE_REVIEW_ITEMS} />,
    filming: <PlaceFilmingTab filmingLocations={filmingLocations} go={go} />,
  }[activeTab] ?? null;

  return (
    <section className="phone standard-screen place-detail-screen">
      <main className="page-scroll">
        <div className="detail-hero"><img src={heroImage} alt={`${place.name} 외관`} /><DetailHeroControls onBack={() => go('explore')} /></div>
        <DetailContentSheet className="detail-content detail-content-v3 place-detail-content">
          <p className="eyebrow place-detail-eyebrow"><span className="place-detail-eyebrow-text">{[place.district, place.categoryLabel].filter(Boolean).join(' · ')}</span><CongestionPointBadge longitude={place.longitude} latitude={place.latitude} /></p>
          <h1>{place.name}</h1>
          <p className="place-detail-summary"><PlaceTrendSummary trend={placeTrend ?? place.trend} /></p>
          <DetailTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} ariaLabel="장소 상세 정보" idPrefix="place-tab" />
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="place-detail-tab-panel"
            id={`place-tab-panel-${activeTab}`}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            key={activeTab}
            role="tabpanel"
            aria-labelledby={`place-tab-${activeTab}`}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
          >
            {tabContent}
          </motion.div>
        </DetailContentSheet>
      </main>
      <div className="sticky-actions split place-actions"><PlaceBasketAction placeId={placeId} basketItems={basketState?.items} onAdded={onBasketAdded} onAuthRequired={onAuthRequired} onRefresh={onBasketRefresh} /><ActionButton tone="secondary" onClick={() => go('write-review')}>후기 남기기</ActionButton></div>
    </section>
  );
}

function EventDetail({ go, eventId, basketState, onBasketAdded, onBasketRefresh, onAuthRequired }) {
  const [event, setEvent] = useState(null);
  const [status, setStatus] = useState(eventId ? 'loading' : 'error');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState('info');
  const userLocation = useUserLocation();

  useEffect(() => {
    if (!eventId) {
      setStatus('error');
      return undefined;
    }
    let cancelled = false;
    const requestController = new AbortController();
    setStatus('loading');
    setActiveTab('info');
    setEvent(null);
    fetchEvent(eventId, { signal: requestController.signal })
      .then((result) => {
        if (cancelled) return;
        setEvent(result);
        setStatus('ready');
      })
      .catch((error) => {
        if (!cancelled && error.name !== 'AbortError') {
          console.error('행사 상세를 불러오지 못했어요', error);
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
      requestController.abort();
    };
  }, [eventId, retryAttempt]);

  if (status === 'loading') {
    return <section className="phone standard-screen event-detail-screen"><BackHeader title="이번 주 행사" onBack={() => go('popups')} /><main className="page-scroll centered-state"><BrandLoading /><h2>행사 정보를 불러오고 있어요</h2></main></section>;
  }

  if (status === 'error' || !event) {
    return <section className="phone standard-screen event-detail-screen"><BackHeader title="이번 주 행사" onBack={() => go('popups')} /><main className="page-scroll centered-state"><h2>정보를 불러오지 못했어요</h2><p>행사 정보를 가져오지 못했어요. 다시 시도하거나 목록으로 돌아가세요.</p><ActionButton onClick={() => setRetryAttempt((current) => current + 1)}><RefreshCw aria-hidden="true" size={17} strokeWidth={2} />다시 시도</ActionButton><ActionButton tone="secondary" onClick={() => go('popups')}>목록으로 돌아가기</ActionButton></main></section>;
  }

  const displayEvent = eventToRowProps(event);
  const dateLabel = formatDateRange(displayEvent.startDate, displayEvent.endDate) || '일정 정보 확인 중';
  const venueLabel = eventVenueLabel(displayEvent);
  const stateLabel = currentEventState(displayEvent);
  const eventMapPlaces = [{
    id: displayEvent.placeId ?? `event-${displayEvent.id}`,
    name: displayEvent.placeName || venueLabel,
    latitude: displayEvent.latitude,
    longitude: displayEvent.longitude,
  }];
  const officialUrl = displayEvent.detailUrl || displayEvent.homepageUrl || null;
  const contactNumber = String(displayEvent.inquiry ?? '').match(/[+\d][\d\s()-]{6,}\d/)?.[0]?.replace(/[^\d+]/g, '') ?? null;
  const viewingAudience = displayEvent.useTarget || '누구나 관람 가능';
  const openExternal = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const tabs = [
    { id: 'info', label: '기본 정보' },
    { id: 'review', label: '후기', count: PLACE_REVIEW_SUMMARY.reviewCount },
  ];

  return (
    <section className="phone standard-screen event-detail-screen has-sticky-action">
      <main className="page-scroll">
        <div className={`detail-hero event-detail-hero ${displayEvent.mainImage ? '' : 'is-placeholder'}`}>
          <EventImage event={displayEvent} className="event-detail-media" />
          <DetailHeroControls onBack={() => go('popups')} />
          {officialUrl && <button className="event-official-link" type="button" onClick={() => openExternal(officialUrl)}><ExternalLink aria-hidden="true" size={13} strokeWidth={2} />공식 정보</button>}
        </div>
        <div className="detail-content detail-content-v3 event-detail-content">
          <div className="event-status-row">
            <span className="event-state-badge">{stateLabel}</span>
            {displayEvent.eventType && <span className="event-type-label">{displayEvent.eventType}</span>}
            <CongestionPointBadge longitude={displayEvent.longitude} latitude={displayEvent.latitude} />
          </div>
          <h1>{displayEvent.name}</h1>
          <p className="event-detail-venue">{venueLabel}</p>
          <DetailTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} ariaLabel="행사 상세 정보" idPrefix="event-tab" />
          <div className="event-detail-tab-panel" id={`event-tab-panel-${activeTab}`} role="tabpanel" aria-labelledby={`event-tab-${activeTab}`}>
            {activeTab === 'info' ? <>
              <div className="event-visit-summary" aria-label="방문 정보">
                <div><CalendarDays aria-hidden="true" size={19} strokeWidth={1.8} /><span><small>일정</small><strong>{dateLabel}</strong></span></div>
                <div><Clock3 aria-hidden="true" size={19} strokeWidth={1.8} /><span><small>시간</small><strong>{displayEvent.eventTime || '시간 정보 없음'}</strong></span></div>
                <div><MapPin aria-hidden="true" size={19} strokeWidth={1.8} /><span><small>장소</small><strong>{venueLabel}</strong></span></div>
                <div><CircleDollarSign aria-hidden="true" size={19} strokeWidth={1.8} /><span><small>요금</small><strong>{displayEvent.useFee || '요금 정보 확인 중'}</strong></span></div>
              </div>
              <section className="event-detail-section event-viewing-guide">
                <h2>관람 안내</h2>
                <div className="event-guide-row">
                  <span className="event-guide-icon"><UserRound aria-hidden="true" size={18} strokeWidth={1.8} /></span>
                  <span><strong>{viewingAudience}</strong><small>별도 예약 없이 방문할 수 있어요.</small></span>
                </div>
              </section>
              {(displayEvent.orgName || displayEvent.inquiry) && <section className="event-detail-section event-contact-section"><h2>주최·문의</h2><div className="event-detail-list">{displayEvent.orgName && <p><span>주최</span><b>{displayEvent.orgName}</b></p>}{displayEvent.inquiry && <p><span>문의</span>{contactNumber ? <a href={`tel:${contactNumber}`}><b>{displayEvent.inquiry}</b><em><Phone aria-hidden="true" size={14} strokeWidth={2} />전화하기</em></a> : <b>{displayEvent.inquiry}</b>}</p>}</div></section>}
              <section className="event-location-section">
                <div className="event-location-heading"><div><h2>행사 장소</h2><p>{venueLabel}</p></div>{displayEvent.placeId && <button type="button" onClick={() => go('place', displayEvent.placeId)}>장소 보기<ChevronRight aria-hidden="true" size={16} strokeWidth={2} /></button>}</div>
                <DetailMapSection title="" ariaLabel={`${displayEvent.name} 행사 장소 지도`} places={eventMapPlaces} userLocation={userLocation} />
              </section>
            </> : <ScreenSection title="방문자 후기"><PlaceReviewPreview onViewAll={() => go('reviews')} summary={PLACE_REVIEW_SUMMARY} reviews={PLACE_REVIEW_ITEMS} /></ScreenSection>}
          </div>
        </div>
      </main>
      <div className="sticky-actions event-actions split">
        {displayEvent.placeId
          ? <PlaceBasketAction placeId={displayEvent.placeId} basketItems={basketState?.items} onAdded={onBasketAdded} onAuthRequired={onAuthRequired} onRefresh={onBasketRefresh} />
          : <CourseActionButton onClick={() => go('map')}>코스에 담기</CourseActionButton>}
        <ActionButton tone="secondary" onClick={() => go('write-review')}>후기 남기기</ActionButton>
      </div>
    </section>
  );
}

function mediaContentToRowProps(media) {
  return {
    id: media.id,
    name: media.title,
    meta: [media.mediaType === 'movie' ? '영화' : '드라마', media.releaseDate].filter(Boolean).join(' · '),
    image: images.onsite,
  };
}

function usePlaceSearch({ initialQuery = '', includeMedia = true } = {}) {
  const [query, setQuery] = useState(initialQuery);
  const [placeResults, setPlaceResults] = useState([]);
  const [kakaoResults, setKakaoResults] = useState([]);
  const [mediaResults, setMediaResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [kakaoSearchUnavailable, setKakaoSearchUnavailable] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const searchControllerRef = useRef(null);

  useEffect(() => () => searchControllerRef.current?.abort(), []);

  const normalizeIdentity = (value) => String(value ?? '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');

  const runSearch = useCallback(async (keyword) => {
    const normalizedKeyword = String(keyword ?? '').trim();
    if (!normalizedKeyword) return;
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setSearched(true);
    setIsSearching(true);
    setSearchError(false);
    setKakaoSearchUnavailable(false);
    const placesRequest = fetchPlaces({ keyword: normalizedKeyword, size: 20, signal: controller.signal });
    const mediaRequest = includeMedia
      ? fetchMediaContents({ size: 20, signal: controller.signal })
      : Promise.resolve({ content: [] });
    const kakaoRequest = getSearchCoordinates({ signal: controller.signal })
      .then((coordinates) => {
        if (controller.signal.aborted) {
          throw controller.signal.reason || new DOMException('Search aborted', 'AbortError');
        }
        return fetchKakaoPlaces(normalizedKeyword, { ...(coordinates || {}), signal: controller.signal });
      });
    const [placesResult, mediaResult, kakaoResult] = await Promise.allSettled([
      placesRequest,
      mediaRequest,
      kakaoRequest,
    ]);
    if (controller.signal.aborted) return;

    try {
      const internalPlaces = placesResult.status === 'fulfilled' ? placesResult.value.content ?? [] : [];
      setPlaceResults(internalPlaces.map((place) => ({ ...placeToCardProps(place), roadAddress: place.roadAddress, lotAddress: place.lotAddress, showCongestion: true })));
      setMediaResults(
        (mediaResult.status === 'fulfilled' ? mediaResult.value.content ?? [] : [])
          .filter((media) => !normalizedKeyword || media.title.toLowerCase().includes(normalizedKeyword.toLowerCase()))
          .map(mediaContentToRowProps),
      );
      if (kakaoResult.status === 'fulfilled') {
        const internalKeys = new Set(internalPlaces.flatMap((place) => {
          const name = normalizeIdentity(place.name);
          return [place.roadAddress, place.lotAddress]
            .filter(Boolean)
            .map((address) => `${name}|${normalizeIdentity(address)}`);
        }));
        setKakaoResults(kakaoResult.value
          .filter((place) => {
            const name = normalizeIdentity(place.name);
            return ![place.roadAddress, place.lotAddress]
              .filter(Boolean)
              .some((address) => internalKeys.has(`${name}|${normalizeIdentity(address)}`));
          })
          .map(mapKakaoPlaceToSearchRow));
      } else {
        setKakaoResults([]);
        setKakaoSearchUnavailable(true);
      }
      setSearchError(placesResult.status === 'rejected' && kakaoResult.status === 'rejected');
    } finally {
      setIsSearching(false);
      if (searchControllerRef.current === controller) searchControllerRef.current = null;
    }
  }, [includeMedia]);

  const resetSearch = useCallback(() => {
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    setQuery('');
    setPlaceResults([]);
    setKakaoResults([]);
    setMediaResults([]);
    setSearched(false);
    setIsSearching(false);
    setKakaoSearchUnavailable(false);
    setSearchError(false);
  }, []);

  return {
    query,
    setQuery,
    placeResults,
    kakaoResults,
    mediaResults,
    searched,
    isSearching,
    kakaoSearchUnavailable,
    searchError,
    runSearch,
    resetSearch,
  };
}

function MapInlineSearchPanel({ query, searched, isSearching, searchError, placeResults, kakaoResults, kakaoSearchUnavailable, onInternalPlaceSelect, onKakaoPlaceSelect, onRetry }) {
  const placeResultCount = placeResults.length + kakaoResults.length;
  if (!searched) return <div className="map-inline-search-panel map-inline-search-hint" role="status">검색어를 입력하고 Enter를 눌러 장소를 찾아보세요.</div>;
  if (isSearching) return <div className="map-inline-search-panel map-inline-search-state" role="status" aria-live="polite"><span className="map-inline-search-spinner" aria-hidden="true" />장소를 찾고 있어요…</div>;
  if (searchError) return <div className="map-inline-search-panel map-inline-search-state" role="alert"><strong>검색 결과를 불러오지 못했어요.</strong><span>잠시 후 다시 시도해주세요.</span><button type="button" onClick={onRetry}>다시 검색</button></div>;
  if (placeResultCount === 0) return <div className="map-inline-search-panel map-inline-search-state" role="status"><strong>검색 결과가 없어요.</strong><span>{query ? `'${query}'와 일치하는 장소를 찾지 못했어요.` : '다른 검색어를 입력해주세요.'}</span></div>;
  return (
    <div className="map-inline-search-panel" aria-label={`${query} 검색 결과`} aria-live="polite">
      <div className="map-inline-search-summary"><strong>'{query}' 검색 결과</strong><span>{kakaoSearchUnavailable ? '때마침 장소만 보여드려요' : '때마침과 카카오에서 찾았어요'}</span></div>
      <div className="map-inline-search-results">
        {placeResults.length > 0 && <>
          <p className="search-source-label">때마침 장소</p>
          {placeResults.map((place) => <PlaceRow compactSearch hideMeta key={place.id} place={place} onClick={() => onInternalPlaceSelect(place)} />)}
        </>}
        {kakaoResults.length > 0 && <>
          <p className="search-source-label">카카오 검색 결과</p>
          {kakaoResults.map((place) => <PlaceRow compactSearch hideMeta key={place.id} place={place} onClick={() => onKakaoPlaceSelect(place)} />)}
        </>}
        {kakaoSearchUnavailable && <p className="search-source-status">카카오 장소 검색은 현재 사용할 수 없어요.</p>}
      </div>
    </div>
  );
}

function SearchResults({ screen, go }) {
  const {
    query,
    setQuery,
    placeResults,
    kakaoResults,
    mediaResults,
    searched,
    isSearching,
    kakaoSearchUnavailable,
    runSearch,
  } = usePlaceSearch({ initialQuery: screen === 'search-empty' ? '없는 장소' : '' });
  const [activeTab, setActiveTab] = useState('장소');
  const courseResults = [{ name: '안국동 궁궐 산책', meta: '3곳 · 2시간 10분 · 도보 중심', image: images.myMap, badge: '추천 코스' }, { name: '드라마 속 종로', meta: '4곳 · 3시간 30분 · 촬영지', image: images.popup, badge: '촬영지 코스' }];
  const resultSets = { 코스: courseResults, 콘텐츠: mediaResults };

  const submit = () => {
    if (!query.trim()) { go('search-empty'); return; }
    runSearch(query.trim());
    go('search');
  };

  const placeResultCount = placeResults.length + kakaoResults.length;
  const isEmptyResult = searched && !isSearching && screen === 'search' && activeTab === '장소' && placeResultCount === 0;

  const openKakaoPlaceOnMap = (place) => {
    writeKakaoMapTarget(place);
    go('map');
  };

  if (screen === 'search-empty') return <section className="phone standard-screen search-screen"><BackHeader title="검색" onBack={() => go('explore')} /><main className="page-scroll"><div className="search-page-field"><SearchField value={query} onChange={setQuery} onSubmit={submit} placeholder="장소·지역·테마 검색" autoFocus /></div><EmptySearch query={query} onClear={() => setQuery('')} /></main></section>;
  const resultSummary = isSearching ? '장소를 찾고 있어요' : kakaoSearchUnavailable ? '때마침 장소만 보여드려요' : '때마침과 카카오에서 찾았어요';
  return <section className="phone standard-screen search-screen"><BackHeader title="검색" onBack={() => go('explore')} /><main className="page-scroll" aria-busy={isSearching}><div className="search-page-field"><SearchField value={query} onChange={setQuery} onSubmit={submit} placeholder="장소·지역·테마 검색" autoFocus /></div>{searched && <div className="search-result-copy"><strong>'{query}' 검색 결과</strong><span>{resultSummary}</span></div>}{isEmptyResult ? <EmptySearch query={query} onClear={() => setQuery('')} /> : <><div className="result-tabs">{[['장소', placeResultCount], ['코스', courseResults.length], ['콘텐츠', mediaResults.length]].map(([name, count]) => <Chip active={activeTab === name} key={name} onClick={() => setActiveTab(name)}>{name} {count}</Chip>)}</div>{activeTab === '장소' ? <div className="search-result-list">{placeResults.length > 0 && <><p className="search-source-label">때마침 장소</p>{placeResults.map((place) => <PlaceRow key={place.id} place={place} onClick={() => go('place', place.id)} />)}</>}{kakaoResults.length > 0 && <><p className="search-source-label">카카오 검색 결과</p>{kakaoResults.map((place) => <PlaceRow key={place.id} place={place} onClick={() => openKakaoPlaceOnMap(place)} />)}</>}{kakaoSearchUnavailable && <p className="search-source-status">카카오 장소 검색은 현재 사용할 수 없어요.</p>}</div> : <div className="search-result-list">{resultSets[activeTab].map((place, index) => <PlaceRow key={place.id ?? `${place.name}-${index}`} place={place} onClick={() => go(activeTab === '코스' ? 'route-map' : 'place', place.id)} />)}</div>}</>}</main></section>;
}

function SavedConfirmation({ go }) {
  return <section className="phone standard-screen saved-detail-screen"><main className="page-scroll"><div className="detail-hero"><img src={images.detail} alt="도토리가든 외관" /><div className="detail-controls"><IconButton label="이전" onClick={() => go('place')}>‹</IconButton><IconButton label="장소 저장 취소" onClick={() => go('my')}>♥</IconButton></div></div><div className="detail-content detail-content-v3"><p className="eyebrow">안국 · 카페</p><h1>도토리가든</h1><p className="detail-meta">매일 10:00-21:00</p><div className="chip-row"><Chip active>지금 여유</Chip><Chip>도보 8분</Chip></div></div></main><section className="save-confirmation-toast" role="status"><span>✓</span><div><strong>저장한 장소에 추가했어요</strong><small>MY에서 언제든 다시 볼 수 있어요.</small></div><button type="button" onClick={() => go('my')}>보기</button></section><div className="sticky-actions split place-actions"><ActionButton onClick={() => go('course-conditions')}>코스에 추가</ActionButton><ActionButton tone="secondary" onClick={() => go('explore')}>탐색 계속</ActionButton></div></section>;
}

function FilmingPlaceMedia({ place }) {
  if (place.hasThumbnail) {
    return <img src={place.image} alt="" loading="lazy" decoding="async" />;
  }

  return (
    <span className="filming-place-card-media-fallback" aria-hidden="true">
      <ImageIcon size={24} strokeWidth={1.8} />
      <span>사진 준비 중</span>
    </span>
  );
}

function FilmingPlaceCard({ place, onClick }) {
  const contentLabel = place.labels?.content || '촬영 콘텐츠 정보 없음';
  const categoryLabel = place.labels?.category;
  const workCountLabel = place.filmingWorkCount ? `${place.filmingWorkCount}개 작품에 나온 장소` : null;
  const metadata = [contentLabel, categoryLabel].filter(Boolean);
  const congestion = useMockCrowdingAtPoint(place.longitude, place.latitude);
  const congestionAccessibleLabel = getMockCongestionAccessibleLabel(congestion);
  const congestionLabel = congestionAccessibleLabel ? `, ${congestionAccessibleLabel}` : '';

  return (
    <button
      className="filming-place-card"
      type="button"
      onClick={onClick}
      aria-label={`${place.name}${congestionLabel} 촬영지 장소 상세 보기`}
    >
      <span className="filming-place-card-media">
        <FilmingPlaceMedia place={place} />
        <CongestionBadge congestion={congestion} className="congestion-badge-on-media" compact />
      </span>
      <span className="filming-place-card-body">
        <span className="filming-place-card-meta">
          {metadata.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </span>
        <strong className="filming-place-card-name">{place.name}</strong>
        <span className="filming-place-card-address">
          <MapPin aria-hidden="true" size={14} strokeWidth={1.9} />
          <span>{place.addressLabel || '주소 정보 없음'}</span>
        </span>
        {workCountLabel && <span className="filming-place-card-work-count">{workCountLabel}</span>}
      </span>
      <ChevronRight className="filming-place-card-next" aria-hidden="true" size={20} strokeWidth={1.8} />
    </button>
  );
}

function FilmingWorkCard({ work, onClick }) {
  const placeNames = work.representativePlaces.map((place) => place.placeName);
  const placePreview = [placeNames.join(' · '), work.otherPlaceCount > 0 ? `외 ${work.otherPlaceCount}곳` : null]
    .filter(Boolean)
    .join(' ');
  const meta = [work.typeLabel, work.releaseYear].filter(Boolean).join(' · ');

  return (
    <button
      className="filming-work-card"
      type="button"
      onClick={onClick}
      aria-label={`${work.title} 촬영 장소 보기`}
    >
      <span className="filming-work-poster">
        {work.posterUrl
          ? <img src={work.posterUrl} alt="" loading="lazy" decoding="async" />
          : <span className="filming-work-poster-fallback" aria-hidden="true"><Clapperboard size={26} strokeWidth={1.7} /><small>포스터 준비 중</small></span>}
      </span>
      <span className="filming-work-body">
        <span className="filming-work-meta">{meta || '작품 정보 확인 중'}</span>
        <strong>{work.title}</strong>
        <span className="filming-work-count">촬영 장소 {work.filmingPlaceCount ?? work.representativePlaces.length}곳</span>
        <span className="filming-work-places">{placePreview || '장소 정보를 준비하고 있어요'}</span>
      </span>
      <ChevronRight className="filming-work-next" aria-hidden="true" size={20} strokeWidth={1.8} />
    </button>
  );
}

function FilmingPlaceLoading() {
  return (
    <div className="filming-place-skeletons" role="status" aria-label="촬영지 장소를 불러오는 중">
      {[0, 1, 2].map((item) => (
        <div className="filming-place-skeleton" aria-hidden="true" key={item}>
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function FilmingLocationsCollection({ go }) {
  const scrollRef = useRef(null);
  const placeLoadingRef = useRef(false);
  const workLoadingRef = useRef(false);
  const placePageRef = useRef(0);
  const workPageRef = useRef(0);
  const placeHasMoreRef = useRef(true);
  const workHasMoreRef = useRef(true);
  const placeFilterRef = useRef(FILMING_COLLECTION_FILTERS[0]);
  const workFilterRef = useRef(FILMING_COLLECTION_FILTERS[0]);
  const placeQueryKeyRef = useRef(null);
  const workQueryKeyRef = useRef(null);
  const placeControllerRef = useRef(null);
  const workControllerRef = useRef(null);
  const scrollPositionsRef = useRef({ works: 0, places: 0 });
  const [activeView, setActiveView] = useState('works');
  const [placeFilter, setPlaceFilter] = useState(FILMING_COLLECTION_FILTERS[0]);
  const [workFilter, setWorkFilter] = useState(FILMING_COLLECTION_FILTERS[0]);
  const [places, setPlaces] = useState([]);
  const [works, setWorks] = useState([]);
  const [placeHasMore, setPlaceHasMore] = useState(true);
  const [workHasMore, setWorkHasMore] = useState(true);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [workLoading, setWorkLoading] = useState(false);
  const [placeError, setPlaceError] = useState(false);
  const [workError, setWorkError] = useState(false);

  const loadPlaces = useCallback(async ({ pageNumber = placePageRef.current, reset = false } = {}) => {
    if (placeLoadingRef.current || (!reset && !placeHasMoreRef.current)) return;
    placeLoadingRef.current = true;
    placeControllerRef.current?.abort();
    const requestController = new AbortController();
    placeControllerRef.current = requestController;
    setPlaceLoading(true);
    setPlaceError(false);
    try {
      const result = await fetchPlaces({
        district: '종로구',
        tag: 'FILMING_LOCATION',
        filmingContentType: placeFilterRef.current.contentType,
        page: pageNumber,
        size: FILMING_COLLECTION_PAGE_SIZE,
        signal: requestController.signal,
      });
      const nextPlaces = (result.content ?? []).map(filmingPlaceToCardProps);
      setPlaces((current) => reset ? nextPlaces : appendUniqueItems(current, nextPlaces));
      const nextPage = pageNumber + 1;
      const nextHasMore = hasNextPage(result, FILMING_COLLECTION_PAGE_SIZE);
      placePageRef.current = nextPage;
      placeHasMoreRef.current = nextHasMore;
      setPlaceHasMore(nextHasMore);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('촬영지 장소를 불러오지 못했어요', error);
      setPlaceError(true);
    } finally {
      placeLoadingRef.current = false;
      setPlaceLoading(false);
    }
  }, []);

  const loadWorks = useCallback(async ({ pageNumber = workPageRef.current, reset = false } = {}) => {
    if (workLoadingRef.current || (!reset && !workHasMoreRef.current)) return;
    workLoadingRef.current = true;
    workControllerRef.current?.abort();
    const requestController = new AbortController();
    workControllerRef.current = requestController;
    setWorkLoading(true);
    setWorkError(false);
    try {
      const result = await fetchFilmingWorks({
        contentType: workFilterRef.current.contentType,
        page: pageNumber,
        size: FILMING_COLLECTION_PAGE_SIZE,
        signal: requestController.signal,
      });
      const nextWorks = (result.content ?? []).map(filmingWorkToCardProps);
      setWorks((current) => reset ? nextWorks : appendUniqueItems(current, nextWorks));
      const nextPage = pageNumber + 1;
      const nextHasMore = hasNextPage(result, FILMING_COLLECTION_PAGE_SIZE);
      workPageRef.current = nextPage;
      workHasMoreRef.current = nextHasMore;
      setWorkHasMore(nextHasMore);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('촬영 작품을 불러오지 못했어요', error);
      setWorkError(true);
    } finally {
      workLoadingRef.current = false;
      setWorkLoading(false);
    }
  }, []);

  useEffect(() => {
    const filter = activeView === 'works' ? workFilter : placeFilter;
    const queryKey = filter.contentType || 'ALL';
    if (activeView === 'works') {
      workFilterRef.current = filter;
      if (workQueryKeyRef.current !== queryKey) {
        workQueryKeyRef.current = queryKey;
        workPageRef.current = 0;
        workHasMoreRef.current = true;
        setWorks([]);
        setWorkHasMore(true);
        loadWorks({ pageNumber: 0, reset: true });
        scrollPositionsRef.current.works = 0;
      }
    } else {
      placeFilterRef.current = filter;
      if (placeQueryKeyRef.current !== queryKey) {
        placeQueryKeyRef.current = queryKey;
        placePageRef.current = 0;
        placeHasMoreRef.current = true;
        setPlaces([]);
        setPlaceHasMore(true);
        loadPlaces({ pageNumber: 0, reset: true });
        scrollPositionsRef.current.places = 0;
      }
    }
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollPositionsRef.current[activeView];
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, loadPlaces, loadWorks, placeFilter, workFilter]);

  useEffect(() => () => {
    placeControllerRef.current?.abort();
    workControllerRef.current?.abort();
    placeLoadingRef.current = false;
    workLoadingRef.current = false;
    placeQueryKeyRef.current = null;
    workQueryKeyRef.current = null;
  }, []);

  const handleScroll = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    scrollPositionsRef.current[activeView] = scroll.scrollTop;
    const distanceToBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
    if (scroll.scrollTop <= 0 || distanceToBottom >= 320) return;
    if (activeView === 'works' && !workLoading && workHasMore) loadWorks({ pageNumber: workPageRef.current });
    if (activeView === 'places' && !placeLoading && placeHasMore) loadPlaces({ pageNumber: placePageRef.current });
  };

  const activeFilter = activeView === 'works' ? workFilter : placeFilter;
  const items = activeView === 'works' ? works : places;
  const isLoading = activeView === 'works' ? workLoading : placeLoading;
  const hasError = activeView === 'works' ? workError : placeError;
  const hasMore = activeView === 'works' ? workHasMore : placeHasMore;
  const retry = () => activeView === 'works'
    ? loadWorks({ pageNumber: works.length ? workPageRef.current : 0, reset: !works.length })
    : loadPlaces({ pageNumber: places.length ? placePageRef.current : 0, reset: !places.length });

  return (
    <section className="phone standard-screen list-screen collection-screen-v3 filming-collection-screen">
      <BackHeader title="장면 속으로" onBack={() => go('explore')} />
      <main className="page-scroll filming-collection-scroll" ref={scrollRef} onScroll={handleScroll}>
        <DetailTabs
          activeTab={activeView}
          ariaLabel="촬영지 보기 방식"
          className="filming-collection-tabs"
          idPrefix="filming-view"
          onChange={setActiveView}
          tabs={[{ id: 'works', label: '작품별' }, { id: 'places', label: '장소별' }]}
        />
        <div id={`filming-view-panel-${activeView}`} role="tabpanel" aria-labelledby={`filming-view-${activeView}`}>
          <div className="collection-filters filming-filter-bar" role="group" aria-label="촬영 콘텐츠 종류 필터">
            {FILMING_COLLECTION_FILTERS.map((item) => (
              <Chip
                key={item.label}
                active={activeFilter.label === item.label}
                onClick={() => activeView === 'works' ? setWorkFilter(item) : setPlaceFilter(item)}
              >
                {item.label}
              </Chip>
            ))}
          </div>
          {hasError && !items.length ? (
            <section className="collection-state">
              <h2>{activeView === 'works' ? '작품을 불러오지 못했어요' : '촬영지를 불러오지 못했어요'}</h2>
              <p>잠시 후 다시 시도해주세요.</p>
              <ActionButton onClick={retry}>다시 불러오기</ActionButton>
            </section>
          ) : (
            <div className="collection-list filming-place-list">
              {activeView === 'works'
                ? works.map((work) => <FilmingWorkCard key={work.id} work={work} onClick={() => go('filming-work', work.id)} />)
                : places.map((place) => <FilmingPlaceCard key={place.id} place={place} onClick={() => go('place', place.id)} />)}
              {isLoading && !items.length && <FilmingPlaceLoading />}
              {!items.length && !isLoading && (
                <section className="collection-state compact">
                  <h2>해당 종류의 {activeView === 'works' ? '작품이' : '촬영지가'} 아직 없어요</h2>
                  <p>다른 필터를 선택해보세요.</p>
                </section>
              )}
              {hasError && items.length > 0 && (
                <section className="collection-inline-error" role="alert">
                  <p>목록을 더 불러오지 못했어요.</p>
                  <button type="button" onClick={retry}>다시 시도</button>
                </section>
              )}
              {isLoading && items.length > 0 && <div className="collection-loading filming-collection-loading" role="status">더 불러오는 중</div>}
              {!hasMore && items.length > 0 && <p className="collection-end">마지막 {activeView === 'works' ? '작품' : '촬영지'}까지 확인했어요</p>}
            </div>
          )}
        </div>
      </main>
    </section>
  );
}

const EVENT_COLLECTION_FILTERS = ['전체', '진행 중', '종료'];
const EVENT_COLLECTION_FILTER_STATUS = { 전체: undefined, '진행 중': 'ONGOING', 종료: 'ENDED' };
const EVENT_COLLECTION_SORTS = [
  { key: 'LATEST', label: '최신순' },
  { key: 'NEAREST', label: '가까운 순' },
];
const EVENT_COLLECTION_PAGE_SIZE = 12;

function EventsCollection({ go }) {
  const scrollRef = useRef(null);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);
  const pageRef = useRef(eventCollectionSession.page);
  const hasMoreRef = useRef(eventCollectionSession.hasMore);
  const requestControllerRef = useRef(null);
  const activeFilterRef = useRef(eventCollectionSession.activeFilter);
  const activeSortRef = useRef(eventCollectionSession.activeSort);
  const coordinatesRef = useRef(eventCollectionSession.coordinates);
  const geolocationRequestRef = useRef(0);
  const isMountedRef = useRef(true);
  const [activeFilter, setActiveFilter] = useState(eventCollectionSession.activeFilter);
  const [activeSort, setActiveSort] = useState(eventCollectionSession.activeSort);
  const [coordinates, setCoordinates] = useState(eventCollectionSession.coordinates);
  const [events, setEvents] = useState(eventCollectionSession.events);
  const [hasMore, setHasMore] = useState(eventCollectionSession.hasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(eventCollectionSession.hasError);
  const [sortError, setSortError] = useState(eventCollectionSession.sortError);
  const [isLocating, setIsLocating] = useState(false);

  const loadEvents = useCallback(async ({ pageNumber = pageRef.current, reset = false, filter = activeFilterRef.current, sort = activeSortRef.current, coordinates: requestedCoordinates = coordinatesRef.current } = {}) => {
    if (loadingRef.current || (!reset && !hasMoreRef.current)) return;
    if (
      sort === 'NEAREST'
      && (!requestedCoordinates
        || !Number.isFinite(requestedCoordinates.latitude)
        || !Number.isFinite(requestedCoordinates.longitude))
    ) {
      setSortError('현재 위치를 확인한 뒤 가까운 순을 사용할 수 있어요.');
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    loadingRef.current = true;
    requestControllerRef.current?.abort();
    const requestController = new AbortController();
    requestControllerRef.current = requestController;
    setIsLoading(true);
    setHasError(false);
    const requestedPage = reset ? 0 : pageNumber;
    const status = EVENT_COLLECTION_FILTER_STATUS[filter];
    if (reset) {
      pageRef.current = 0;
      hasMoreRef.current = true;
      setEvents([]);
      setHasMore(true);
    }
    try {
      const result = await fetchEvents({
        status,
        sortMode: sort,
        latitude: requestedCoordinates?.latitude,
        longitude: requestedCoordinates?.longitude,
        page: requestedPage,
        size: EVENT_COLLECTION_PAGE_SIZE,
        signal: requestController.signal,
      });
      const coordinatesMatch = sort !== 'NEAREST'
        || (coordinatesRef.current?.latitude === requestedCoordinates?.latitude
          && coordinatesRef.current?.longitude === requestedCoordinates?.longitude);
      if (requestId !== requestIdRef.current || activeFilterRef.current !== filter || activeSortRef.current !== sort || !coordinatesMatch) return;
      const nextEvents = (result.content ?? []).map(eventToCardProps);
      setEvents((current) => reset ? nextEvents : appendUniqueItems(current, nextEvents));
      const nextPage = requestedPage + 1;
      const nextHasMore = hasNextPage(result, EVENT_COLLECTION_PAGE_SIZE);
      pageRef.current = nextPage;
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
      eventCollectionSession.hasLoaded = true;
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('행사 목록을 불러오지 못했어요', error);
      if (requestId === requestIdRef.current) setHasError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, []);

  const resetCollection = ({ filter, sort, nextCoordinates }) => {
    const coordinatesForSort = sort === 'NEAREST' ? nextCoordinates : null;
    activeFilterRef.current = filter;
    activeSortRef.current = sort;
    coordinatesRef.current = coordinatesForSort;
    geolocationRequestRef.current += 1;
    requestIdRef.current += 1;
    loadingRef.current = false;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    pageRef.current = 0;
    hasMoreRef.current = true;
    eventCollectionSession.activeFilter = filter;
    eventCollectionSession.activeSort = sort;
    eventCollectionSession.coordinates = coordinatesForSort;
    eventCollectionSession.events = [];
    eventCollectionSession.page = 0;
    eventCollectionSession.hasMore = true;
    eventCollectionSession.hasError = false;
    eventCollectionSession.sortError = null;
    eventCollectionSession.hasLoaded = false;
    eventCollectionSession.scrollTop = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setActiveFilter(filter);
    setActiveSort(sort);
    setCoordinates(coordinatesForSort);
    setEvents([]);
    setHasMore(true);
    setHasError(false);
    setSortError(null);
    setIsLocating(false);
    setIsLoading(false);
    loadEvents({ pageNumber: 0, reset: true, filter, sort, coordinates: coordinatesForSort });
  };

  useEffect(() => {
    isMountedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = eventCollectionSession.scrollTop;
    });
    if (!eventCollectionSession.hasLoaded && !events.length) {
      loadEvents({ pageNumber: 0, reset: true, filter: activeFilterRef.current, sort: activeSortRef.current, coordinates: coordinatesRef.current });
    }
    return () => {
      eventCollectionSession.scrollTop = scrollRef.current?.scrollTop ?? eventCollectionSession.scrollTop;
      requestIdRef.current += 1;
      loadingRef.current = false;
      requestControllerRef.current?.abort();
      geolocationRequestRef.current += 1;
      isMountedRef.current = false;
      window.cancelAnimationFrame(frame);
    };
  }, [loadEvents]);

  useEffect(() => {
    eventCollectionSession.events = events;
    eventCollectionSession.activeFilter = activeFilter;
    eventCollectionSession.activeSort = activeSort;
    eventCollectionSession.coordinates = coordinates;
    eventCollectionSession.page = pageRef.current;
    eventCollectionSession.hasMore = hasMore;
    eventCollectionSession.hasError = hasError;
    eventCollectionSession.sortError = sortError;
  }, [activeFilter, activeSort, coordinates, events, hasError, hasMore, sortError]);

  const handleScroll = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    eventCollectionSession.scrollTop = scroll.scrollTop;
    if (isLoading || !hasMore) return;
    const distanceToBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
    if (scroll.scrollTop > 0 && distanceToBottom < 320) loadEvents({ pageNumber: pageRef.current });
  };

  const handleFilterChange = (filter) => {
    if (filter === activeFilterRef.current) return;
    resetCollection({ filter, sort: activeSortRef.current, nextCoordinates: coordinatesRef.current });
  };

  const handleSortChange = (sort) => {
    if (sort === activeSortRef.current || isLocating) return;
    if (sort === 'LATEST') {
      resetCollection({ filter: activeFilterRef.current, sort, nextCoordinates: null });
      return;
    }

    const requestNumber = geolocationRequestRef.current + 1;
    geolocationRequestRef.current = requestNumber;
    setSortError(null);
    setIsLocating(true);

    const showLocationError = (message) => {
      if (!isMountedRef.current || requestNumber !== geolocationRequestRef.current) return;
      setIsLocating(false);
      setSortError(message);
    };

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showLocationError('이 브라우저에서는 현재 위치를 확인할 수 없어요.');
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords: position }) => {
          if (!isMountedRef.current || requestNumber !== geolocationRequestRef.current) return;
          const nextCoordinates = { latitude: position.latitude, longitude: position.longitude };
          if (!Number.isFinite(nextCoordinates.latitude) || !Number.isFinite(nextCoordinates.longitude)) {
            showLocationError('현재 위치를 확인하지 못했어요. 다시 시도해주세요.');
            return;
          }
          resetCollection({ filter: activeFilterRef.current, sort, nextCoordinates });
        },
        (error) => {
          const message = error?.code === 1
            ? '위치 권한이 없어 가까운 순을 불러올 수 없어요.'
            : error?.code === 3
              ? '현재 위치 확인 시간이 초과됐어요.'
              : '현재 위치를 확인하지 못했어요.';
          showLocationError(`${message} 다시 시도해주세요.`);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    } catch (error) {
      showLocationError('현재 위치를 확인하지 못했어요. 다시 시도해주세요.');
    }
  };

  const handleEventClick = (eventId) => {
    eventCollectionSession.scrollTop = scrollRef.current?.scrollTop ?? 0;
    go('event-detail', eventId);
  };

  return (
    <section className="phone standard-screen list-screen collection-screen-v3 event-collection-screen">
      <BackHeader title="행사와 전시" onBack={() => go('explore')} />
      <main className="page-scroll event-collection-scroll" ref={scrollRef} onScroll={handleScroll}>
        <div className="collection-filters event-filter-bar" role="group" aria-label="행사 필터와 정렬">
          {EVENT_COLLECTION_FILTERS.map((item) => (
            <Chip key={item} active={activeFilter === item} current={activeFilter === item} onClick={() => handleFilterChange(item)}>{item}</Chip>
          ))}
          <div
            className="event-sort-row"
            role="group"
            aria-label="행사 정렬"
            aria-busy={isLocating ? 'true' : undefined}
            aria-describedby={sortError ? 'event-sort-error' : undefined}
          >
            {EVENT_COLLECTION_SORTS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={activeSort === item.key}
                disabled={isLocating && item.key !== activeSort}
                onClick={() => handleSortChange(item.key)}
              >
                <span className="event-sort-dot" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        {isLocating && <p className="event-sort-status" role="status" aria-live="polite">현재 위치를 확인하고 있어요.</p>}
        {sortError && (
          <div className="event-sort-error" id="event-sort-error" role="alert">
            <span>{sortError}</span>
            <button type="button" onClick={() => handleSortChange('NEAREST')}>다시 시도</button>
          </div>
        )}
        {hasError && !events.length ? (
          <section className="collection-state">
            <h2>행사를 불러오지 못했어요</h2>
            <p>잠시 후 다시 시도해주세요.</p>
            <ActionButton onClick={() => loadEvents({ pageNumber: 0, reset: true })}>다시 불러오기</ActionButton>
          </section>
        ) : (
          <div className="collection-list event-list">
            {events.map((event) => (
              <EventListItem key={event.id} event={event} onClick={() => handleEventClick(event.id)} />
            ))}
            {!events.length && isLoading && (
              <section className="collection-state compact" role="status" aria-live="polite">
                <span className="event-state-icon"><CalendarDays aria-hidden="true" size={22} /></span>
                <h2>행사를 불러오는 중이에요</h2>
                <p>잠시만 기다려주세요.</p>
              </section>
            )}
            {!events.length && !isLoading && (
              <section className="collection-state compact">
                <span className="event-state-icon"><Search aria-hidden="true" size={22} /></span>
                <h2>조건에 맞는 행사가 없어요</h2>
                <p>{activeFilter === '전체' ? '등록된 행사가 아직 없어요.' : '다른 필터를 선택해보세요.'}</p>
                {activeFilter !== '전체' && <ActionButton tone="secondary" onClick={() => handleFilterChange('전체')}>전체 행사 보기</ActionButton>}
              </section>
            )}
            {isLoading && events.length > 0 && <div className="collection-loading" role="status">불러오는 중</div>}
            {hasError && events.length > 0 && <div className="collection-inline-error" role="alert"><span>행사를 더 불러오지 못했어요.</span><button type="button" onClick={() => loadEvents({ pageNumber: pageRef.current })}>다시 시도</button></div>}
            {!hasMore && events.length > 0 && <p className="collection-end">마지막 행사까지 확인했어요</p>}
          </div>
        )}
      </main>
    </section>
  );
}

const PLACE_TREND_COLLECTION_FILTERS = [
  { label: '전체', status: null },
  { label: '많이 언급돼요', status: 'TRENDING' },
  { label: '관심이 이어져요', status: 'WATCH' },
];
const PLACE_TREND_COLLECTION_LIMIT = 20;

function PlaceTrendsCollection({ go }) {
  const requestControllerRef = useRef(null);
  const [trends, setTrends] = useState([]);
  const [status, setStatus] = useState('loading');
  const [activeFilter, setActiveFilter] = useState(PLACE_TREND_COLLECTION_FILTERS[0]);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    requestControllerRef.current?.abort();
    const requestController = new AbortController();
    requestControllerRef.current = requestController;
    setStatus('loading');
    setTrends([]);

    fetchPlaceTrends({ limit: PLACE_TREND_COLLECTION_LIMIT, signal: requestController.signal })
      .then((result) => {
        if (requestController.signal.aborted || requestControllerRef.current !== requestController) return;
        setTrends(Array.isArray(result) ? result : []);
        setStatus('ready');
      })
      .catch((error) => {
        if (error?.name === 'AbortError' || requestController.signal.aborted) return;
        if (requestControllerRef.current !== requestController) return;
        console.error('트렌드 장소 목록을 불러오지 못했어요', error);
        setStatus('error');
      });

    return () => {
      requestController.abort();
      if (requestControllerRef.current === requestController) requestControllerRef.current = null;
    };
  }, [retryAttempt]);

  const visibleTrends = getVisiblePlaceTrends(trends);
  const displayedTrends = activeFilter.status
    ? visibleTrends.filter((place) => place.trend?.status === activeFilter.status)
    : visibleTrends;
  const retry = () => setRetryAttempt((current) => current + 1);

  return (
    <section className="phone standard-screen list-screen collection-screen-v3 trend-collection-screen">
      <BackHeader title="요즘 이곳에서는" onBack={() => go('explore')} />
      <main className="page-scroll trend-collection-scroll" aria-busy={status === 'loading'}>
        <div className="collection-filters trend-filter-bar" role="group" aria-label="트렌드 상태 필터">
          {PLACE_TREND_COLLECTION_FILTERS.map((item) => (
            <Chip key={item.label} active={activeFilter.label === item.label} current={activeFilter.label === item.label} onClick={() => setActiveFilter(item)}>{item.label}</Chip>
          ))}
        </div>
        {status === 'error' ? (
          <section className="collection-state" role="alert">
            <h2>트렌드 장소를 불러오지 못했어요</h2>
            <p>잠시 후 다시 시도해주세요.</p>
            <ActionButton onClick={retry}>다시 불러오기</ActionButton>
          </section>
        ) : (
          <div className="collection-list trend-place-list">
            {displayedTrends.map((trendPlace) => {
              const place = getPlaceTrendCardProps(trendPlace, images.cafe);
              return <PlaceRow key={place.id} place={place} onClick={() => go('place', place.id)} />;
            })}
            {status === 'loading' && (
              <section className="collection-state compact" role="status" aria-live="polite">
                <span className="event-state-icon"><Search aria-hidden="true" size={22} /></span>
                <h2>트렌드 장소를 불러오는 중이에요</h2>
                <p>잠시만 기다려주세요.</p>
              </section>
            )}
            {status === 'ready' && !displayedTrends.length && (
              <section className="collection-state compact">
                <span className="event-state-icon"><SearchX aria-hidden="true" size={22} /></span>
                <h2>해당 상태의 장소가 아직 없어요</h2>
                <p>{activeFilter.status ? '다른 트렌드 상태를 선택해보세요.' : '공개된 트렌드 장소가 아직 없어요.'}</p>
                {activeFilter.status && <ActionButton tone="secondary" onClick={() => setActiveFilter(PLACE_TREND_COLLECTION_FILTERS[0])}>전체 트렌드 보기</ActionButton>}
              </section>
            )}
          </div>
        )}
      </main>
    </section>
  );
}

function CollectionScreen({ screen, go }) {
  if (screen === 'trending') {
    return <PlaceTrendsCollection go={go} />;
  }
  if (screen === 'filming-locations') {
    return <FilmingLocationsCollection go={go} />;
  }
  if (screen === 'popups') {
    return <EventsCollection go={go} />;
  }

}

function AiGuide({ go }) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(() => [{ id: 'ai-guide-greeting', role: 'assistant', content: AI_GUIDE_GREETING }]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [previousResponseId, setPreviousResponseId] = useState(null);
  const requestControllerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const isLoading = status === 'loading';

  useLayoutEffect(() => {
    scrollAiGuideToLatest(chatScrollRef.current);
  }, [messages.length, status]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => setCurrentLocation({ latitude: coords.latitude, longitude: coords.longitude }),
        () => setCurrentLocation(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
      );
    }
    return () => requestControllerRef.current?.abort();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isLoading) return;

    const history = messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .slice(-AI_GUIDE_HISTORY_LIMIT)
      .map(({ role, content }) => ({ role: role.toUpperCase(), content }));
    const userMessage = { id: `ai-guide-user-${Date.now()}`, role: 'user', content: message };
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setError('');
    setStatus('loading');

    try {
      const result = await sendAiGuideMessage({
        message, history, currentLocation, previousResponseId, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const answer = String(result?.answer ?? '').trim();
      if (!answer) throw new Error('AI 가이드가 답변을 보내지 못했어요.');
      const recommendedPlaceIds = [...new Set((Array.isArray(result?.recommendedPlaceIds) ? result.recommendedPlaceIds : [])
        .map(Number)
        .filter(Number.isSafeInteger)
        .filter((id) => id > 0))].slice(0, 6);
      const placeResponses = await Promise.allSettled(
        recommendedPlaceIds.map((placeId) => fetchPlace(placeId, { signal: controller.signal })),
      );
      if (controller.signal.aborted) return;
      const recommendedPlaces = placeResponses
        .filter((response) => response.status === 'fulfilled')
        .map((response) => response.value)
        .filter((place) => Number.isSafeInteger(Number(place?.id)));
      setPreviousResponseId(result?.responseId || null);
      setMessages((current) => [...current, {
        id: result?.responseId || `ai-guide-assistant-${Date.now()}`,
        role: 'assistant',
        content: answer,
        recommendedPlaces,
      }]);
      setStatus('idle');
    } catch (requestError) {
      if (requestError?.name === 'AbortError' || controller.signal.aborted) return;
      const errorPresentation = getAiGuideErrorPresentation(requestError);
      console.error('AI 가이드 요청 실패', {
        status: requestError?.status ?? null,
        code: requestError?.code ?? null,
        path: requestError?.path ?? '/v1/ai-guide/chats',
        message: requestError?.message,
        cause: requestError?.cause,
      });
      setError({ ...errorPresentation, requestMessage: message });
      setStatus('error');
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
    }
  };

  const handleInputKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <section className="phone standard-screen tab-screen ai-guide-screen">
      <main className="page-scroll ai-guide-scroll" aria-busy={isLoading}>
        <header className="tab-heading ai-guide-heading">
          <p className="eyebrow">AI 여행 도우미</p>
          <h1>어디로 갈지 같이 정해봐요</h1>
          <p className="section-subtitle">취향과 일정에 맞는 장소와 코스를 대화로 추천해드릴게요.</p>
        </header>
        <div ref={chatScrollRef} className="ai-guide-chat" role="log" aria-live="polite" aria-label="AI 가이드 대화">
          {messages.map((message) => {
            const linkedPlaceIds = new Set();
            const placeLinkForListItem = (itemText, itemKey) => {
              if (message.role !== 'assistant') return null;
              const normalizedItem = String(itemText).replace(/\*\*/g, '').toLocaleLowerCase('ko-KR');
              const place = message.recommendedPlaces?.find((candidate) => (
                !linkedPlaceIds.has(candidate.id)
                && normalizedItem.includes(String(candidate.name ?? '').toLocaleLowerCase('ko-KR'))
              ));
              if (!place) return null;
              linkedPlaceIds.add(place.id);
              return <div className="ai-guide-place-link" key={`${itemKey}-place-link`}>
                <PlaceRow place={placeToCardProps(place)} hideMeta onClick={() => go('place', place.id)} />
              </div>;
            };
            const markdown = renderAiGuideMarkdown(message.content, message.id, {
              renderListItemFooter: placeLinkForListItem,
            });
            const unlinkedPlaces = message.recommendedPlaces?.filter((place) => !linkedPlaceIds.has(place.id)) ?? [];
            return <div className="ai-guide-message-group" key={message.id}>
              <div className={`ai-guide-message ${message.role === 'user' ? 'user' : 'assistant'}`}>
                {markdown}
                {unlinkedPlaces.length > 0 && (
                  <section className="ai-guide-place-list" aria-label="AI 추천 장소">
                    {unlinkedPlaces.map((place) => <PlaceRow key={place.id} place={placeToCardProps(place)} hideMeta onClick={() => go('place', place.id)} />)}
                  </section>
                )}
              </div>
            </div>;
          })}
          {isLoading && <p className="ai-guide-message assistant ai-guide-loading" aria-label="AI 가이드가 답변을 작성하는 중">답변을 작성하고 있어요…</p>}
          {error && (
            <section id="ai-guide-error" className="ai-guide-error" role="alert">
              <strong>{error.title}</strong>
              <span>{error.message}</span>
              {error.technical && <small>{error.technical}</small>}
              <button
                type="button"
                onClick={() => {
                  setDraft(error.requestMessage || '');
                  setError('');
                }}
              >
                요청 다시 입력하기
              </button>
            </section>
          )}
        </div>
      </main>
      <form className="ai-guide-input" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="ai-guide-message">AI 가이드에게 보낼 메시지</label>
        <textarea
          id="ai-guide-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="예: 안국에서 조용한 카페를 추천해줘"
          rows={1}
          disabled={isLoading}
          aria-describedby={error ? 'ai-guide-error' : undefined}
        />
        <button type="submit" aria-label="메시지 보내기" disabled={!draft.trim() || isLoading}>
          <SendHorizontal aria-hidden="true" size={19} strokeWidth={2} />
        </button>
      </form>
      <BottomNav active="assistant" onNavigate={(tab) => go(rootRoutes[tab])} />
    </section>
  );
}

function LiveTalk() {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([{ text: '창덕궁 쪽은 입장 줄이 거의 없어요.', mine: false }, { text: '도토리가든은 지금 바로 들어갔어요!', mine: true }, { text: '북촌 골목은 오후보다 한산해요.', mine: false }]);
  const submit = (event) => { event.preventDefault(); const text = draft.trim(); if (!text) return; setMessages((current) => [...current, { text, mine: true }]); setDraft(''); };
  return <section className="phone standard-screen live-talk-screen"><main className="page-scroll"><header className="live-talk-heading"><CrowdMotion /><span>안국동 · 실시간</span><h1>내 주변 지금톡</h1><p>현장에 있는 사람들이 남긴 짧은 소식이에요.</p></header><div className="talk-presence"><i />지금 안국동에 6명이 있어요</div><div className="chat-list">{messages.map((message, index) => <p className={`chat-bubble ${message.mine ? 'mine' : 'other'}`} key={`${message.text}-${index}`}>{message.text}</p>)}</div></main><form className="talk-input" onSubmit={submit}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="지금 상황을 남겨보세요" /><button type="submit" aria-label="보내기" disabled={!draft.trim()}><SendHorizontal aria-hidden="true" size={19} strokeWidth={2} /></button></form></section>;
}

function CoursePlaceOverview({ items = [], className = '' }) {
  const places = items
    .map((item) => ({ id: item.id ?? item.placeId ?? item.placeName, name: item.placeName || item.name }))
    .filter((item) => item.name);
  if (places.length === 0) return null;

  return <section className={`course-place-overview${className ? ` ${className}` : ''}`} aria-label={`코스에 포함된 장소 ${places.length}곳`}>
    <header><strong>선택한 장소</strong><span>{places.length}곳</span></header>
    <ol>{places.map((place, index) => <li key={place.id ?? `${place.name}-${index}`}><b>{index + 1}</b><span>{place.name}</span></li>)}</ol>
  </section>;
}

function CourseStopPhoto({ item }) {
  const imageUrl = typeof item?.imageUrl === 'string' ? item.imageUrl.trim() : '';
  if (imageUrl) return <img className="course-stop-photo" src={imageUrl} alt="" loading="lazy" />;
  return <span className="course-stop-photo is-placeholder" aria-hidden="true"><MapPin size={18} strokeWidth={2} /></span>;
}

function CourseConditions({ go, draft, basketState, onContinue }) {
  const initialSchedule = useMemo(() => draft || createCourseConditionDefaults(), [draft]);
  const [serviceDate, setServiceDate] = useState(initialSchedule.serviceDate);
  const [desiredStartTime, setDesiredStartTime] = useState(initialSchedule.desiredStartTime);
  const [startTiming, setStartTiming] = useState(draft?.startTiming || 'SCHEDULED');
  const [startMode, setStartMode] = useState(draft?.start?.type === 'SEARCHED_PLACE' ? 'search' : 'current');
  const [selectedStart, setSelectedStart] = useState(draft?.start || null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle');
  const [activeSheet, setActiveSheet] = useState(null);
  const searchControllerRef = useRef(null);
  const { status: locationStatus, locate } = useCurrentLocation();
  const canContinue = Boolean(selectedStart && (startTiming === 'NOW' || (serviceDate && desiredStartTime)));
  const selectedStartLabel = selectedStart?.name || '출발 위치를 설정해주세요';
  const selectedStartMeta = selectedStart?.address || '현재 위치 또는 검색한 장소';
  const sheetTitle = {
    location: '출발 위치',
    date: '여행 날짜',
    startTime: '출발 시각',
  }[activeSheet];

  useEffect(() => () => searchControllerRef.current?.abort(), []);

  const changeStartMode = (mode) => {
    setStartMode(mode);
    if (selectedStart?.type !== (mode === 'current' ? 'CURRENT_LOCATION' : 'SEARCHED_PLACE')) {
      setSelectedStart(null);
    }
  };

  const useCurrentPosition = async () => {
    const current = await locate();
    if (!current) return;
    setSelectedStart({
      type: 'CURRENT_LOCATION',
      name: '현재 위치',
      address: 'GPS 좌표를 출발점으로 사용해요',
      latitude: current.latitude,
      longitude: current.longitude,
    });
    setActiveSheet(null);
  };

  const selectStartPlace = (place) => {
    setSelectedStart(place);
    setActiveSheet(null);
  };

  const searchStartPlaces = async () => {
    const query = locationQuery.trim();
    if (!query || searchStatus === 'loading') return;
    setSelectedStart(null);
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setSearchStatus('loading');
    setLocationResults([]);
    try {
      const places = await fetchKakaoPlaces(query, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setLocationResults((Array.isArray(places) ? places : [])
        .map(normalizeCourseStartPlace)
        .filter(Boolean)
        .slice(0, 5));
      setSearchStatus('success');
    } catch (error) {
      if (error?.name !== 'AbortError' && !controller.signal.aborted) setSearchStatus('error');
    } finally {
      if (searchControllerRef.current === controller) searchControllerRef.current = null;
    }
  };

  const continueToStopSettings = () => {
    if (!canContinue) return;
    const schedule = startTiming === 'NOW' ? createCourseConditionDefaults() : { serviceDate, desiredStartTime };
    onContinue?.({ ...schedule, start: selectedStart, startTiming });
  };

  return (
    <section className="phone standard-screen course-condition-screen course-condition-sheet-v2">
      <main className="page-scroll">
        <header className="course-condition-heading">
          <IconButton className="page-back-button" label="이전" onClick={() => go('map')}>‹</IconButton>
          <div><h1>코스 만들기 <span>코스 설정 1/3</span></h1>
          <p>출발 위치와 시간을 정한 뒤 장소별 시간을 설정해요.</p></div>
        </header>

        <CoursePlaceOverview items={basketState?.items} />

        <ScreenSection title="어디에서 출발할까요?">
          <button className={`course-summary-row course-summary-location ${selectedStart ? 'is-complete' : ''}`} onClick={() => setActiveSheet('location')} type="button">
            <span className="course-summary-icon"><MapPin aria-hidden="true" size={20} strokeWidth={2} /></span>
            <span>{selectedStart && <small>출발 위치</small>}<strong>{selectedStartLabel}</strong><em>{selectedStart ? selectedStartMeta : '현재 위치 또는 장소 검색'}</em></span>
            <ChevronRight aria-hidden="true" size={19} strokeWidth={2} />
          </button>
        </ScreenSection>

        <ScreenSection title="언제 여행할까요?">
          <div className="course-start-timing course-condition-timing-tabs" role="group" aria-label="코스 시작 방식">
            <button aria-pressed={startTiming === 'NOW'} className={startTiming === 'NOW' ? 'selected' : ''} onClick={() => setStartTiming('NOW')} type="button">지금 바로</button>
            <button aria-pressed={startTiming === 'SCHEDULED'} className={startTiming === 'SCHEDULED' ? 'selected' : ''} onClick={() => setStartTiming('SCHEDULED')} type="button">일정 예약</button>
          </div>
          {startTiming === 'NOW' ? (
            <div className="course-now-note"><Clock3 aria-hidden="true" size={19} /><span><strong>현재 시각부터 시작해요</strong><small>코스를 확정할 때 최신 시각으로 다시 계산합니다.</small></span></div>
          ) : <div className="course-schedule-card">
            <button onClick={() => setActiveSheet('date')} type="button">
              <span className="course-summary-icon"><CalendarDays aria-hidden="true" size={19} strokeWidth={2} /></span>
              <span><small>날짜</small><strong>{formatCourseDateLabel(serviceDate)}</strong></span>
              <ChevronRight aria-hidden="true" size={18} strokeWidth={2} />
            </button>
            <div className="course-schedule-times">
              <button onClick={() => setActiveSheet('startTime')} type="button">
                <span><small>출발 시각</small><strong>{formatCourseTimeLabel(desiredStartTime)}</strong></span>
                <ChevronRight aria-hidden="true" size={17} strokeWidth={2} />
              </button>
            </div>
          </div>}
        </ScreenSection>

        <section className="course-next-step-preview" aria-label="다음 단계 안내">
          <span>다음 단계</span>
          <strong>장소별 체류 시간과 예약 시간을 조정해요</strong>
        </section>
      </main>

      <div className="sticky-actions">
        <CourseActionButton disabled={!canContinue} onClick={continueToStopSettings}>다음</CourseActionButton>
        {!selectedStart && <p className="course-action-hint">출발 위치를 먼저 설정해주세요.</p>}
      </div>

      {activeSheet && (
        <div className="course-sheet-backdrop" onClick={() => setActiveSheet(null)} role="presentation">
          <section aria-labelledby="course-sheet-title" aria-modal="true" className="course-option-sheet" onClick={(event) => event.stopPropagation()} role="dialog">
            <span className="course-sheet-handle" aria-hidden="true" />
            <header>
              <div><small>코스 만들기</small><h2 id="course-sheet-title">{sheetTitle}</h2></div>
              <button aria-label="닫기" onClick={() => setActiveSheet(null)} type="button"><X aria-hidden="true" size={20} strokeWidth={2} /></button>
            </header>

            {activeSheet === 'location' && (
              <div className="course-sheet-body">
                <div className="course-start-mode course-location-mode-tabs" role="group" aria-label="출발 위치 설정 방식">
                  <button aria-pressed={startMode === 'current'} className={startMode === 'current' ? 'selected' : ''} onClick={() => changeStartMode('current')} type="button">
                    <LocateFixed aria-hidden="true" size={17} strokeWidth={2} />현재 위치
                  </button>
                  <button aria-pressed={startMode === 'search'} className={startMode === 'search' ? 'selected' : ''} onClick={() => changeStartMode('search')} type="button">
                    <Search aria-hidden="true" size={17} strokeWidth={2} />장소 검색
                  </button>
                </div>

                {startMode === 'current' ? (
                  <div className={`course-location-card ${selectedStart?.type === 'CURRENT_LOCATION' ? 'is-selected' : ''}`}>
                    <span className="course-location-icon"><LocateFixed aria-hidden="true" size={21} strokeWidth={2} /></span>
                    <div><strong>내 위치에서 바로 출발</strong><small>위치 권한은 지금 한 번만 요청해요.</small></div>
                    <button aria-busy={locationStatus === 'locating' || undefined} disabled={locationStatus === 'locating'} onClick={useCurrentPosition} type="button">
                      {locationStatus === 'locating' ? '확인 중' : selectedStart?.type === 'CURRENT_LOCATION' ? '다시 설정' : '설정'}
                    </button>
                    {locationStatus === 'error' && <p className="course-field-error" role="alert">현재 위치를 확인하지 못했어요. 위치 권한을 확인해주세요.</p>}
                  </div>
                ) : (
                  <div className="course-location-search">
                    <SearchField
                      onChange={setLocationQuery}
                      onSubmit={searchStartPlaces}
                      placeholder="역, 건물, 주소를 검색하세요"
                      value={locationQuery}
                    />
                    {searchStatus === 'error' && <p className="course-field-error" role="alert">장소를 불러오지 못했어요. 다시 검색해주세요.</p>}
                    {searchStatus === 'success' && locationResults.length === 0 && <p className="course-search-empty">검색 결과가 없어요. 다른 검색어를 입력해주세요.</p>}
                    {selectedStart?.type === 'SEARCHED_PLACE' && <div className="course-selected-place"><MapPin aria-hidden="true" size={19} strokeWidth={2} /><span><strong>{selectedStart.name}</strong><small>{selectedStart.address}</small></span><button onClick={() => setSelectedStart(null)} type="button">변경</button></div>}
                    {locationResults.length > 0 && selectedStart?.type !== 'SEARCHED_PLACE' && (
                      <div className="course-start-search-results" aria-label="출발 장소 검색 결과">
                        {locationResults.map((place) => <PlaceRow key={`${place.name}-${place.latitude}-${place.longitude}`} place={{ ...place, id: `${place.latitude}-${place.longitude}`, externalSource: 'KAKAO', meta: place.address }} onClick={() => selectStartPlace(place)} />)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSheet === 'date' && (
              <div className="course-sheet-body course-picker-sheet">
                <label htmlFor="course-service-date"><span>여행할 날짜</span><input id="course-service-date" min={initialSchedule.serviceDate} onChange={(event) => setServiceDate(event.target.value)} type="date" value={serviceDate} /></label>
                <p>선택한 날짜와 출발 시각을 기준으로 일정을 계산해요.</p>
                <CourseActionButton disabled={!serviceDate} onClick={() => setActiveSheet(null)}>날짜 선택</CourseActionButton>
              </div>
            )}

            {activeSheet === 'startTime' && (
              <div className="course-sheet-body course-picker-sheet">
                <label htmlFor="course-time-picker">
                  <span>몇 시에 출발할까요?</span>
                  <input id="course-time-picker" onChange={(event) => setDesiredStartTime(event.target.value)} step="600" type="time" value={desiredStartTime} />
                </label>
                <div className="course-time-presets">
                  {['09:00', '12:00', '15:00', '18:00'].map((time) => {
                    return <button aria-pressed={desiredStartTime === time} className={desiredStartTime === time ? 'selected' : ''} key={time} onClick={() => setDesiredStartTime(time)} type="button">{formatCourseTimeLabel(time)}</button>;
                  })}
                </div>
                <CourseActionButton disabled={!desiredStartTime} onClick={() => setActiveSheet(null)}>시간 선택</CourseActionButton>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function RouteOverview({ go, active = false }) {
  const data = active ? {
    title: '코스 전체 보기', subtitle: '5곳 · 진행 중 · 16:28 종료 예정', badge: '현재 경로', time: '남은 3시간 10분', summary: '남은 3시간 10분 · 이동 38분 · 4.2km', start: 'progress',
    stops: [['운현궁', '13:40-14:35 · 머무름 55분', '도보 10분', '720m · 북촌로 방향'], ['도토리가든', '16:40 도착 예정', '버스 22분', '3정거장 · 도보 4분 포함'], ['서울공예박물관', '16:10-17:10 · 머무름 60분', '지하철 20분', '3호선 · 도보 6분 포함'], ['도토리가든', '17:30-18:20 · 머무름 50분', null, null]],
  } : {
    title: '코스 미리보기', subtitle: '4곳 · 오늘 13:40-18:20', badge: '빠른 코스', time: '4시간 40분', summary: '4시간 40분 · 이동 52분 · 7.8km', start: 'progress',
    stops: [['서울공예박물관', '13:40-14:35 · 머무름 55분', '도보 10분', '720m · 북촌로 방향'], ['런던 베이글 뮤지엄', '14:45 도착 · 15:00 예약', '버스 22분', '3정거장 · 도보 4분 포함'], ['블루 모먼트 전시 팝업', '16:10-17:10 · 머무름 60분', '지하철 20분', '3호선 · 도보 6분 포함'], ['도토리가든', '17:30-18:20 · 머무름 50분', null, null]],
  };
  return <section className="phone standard-screen route-overview-screen"><main className="page-scroll route-overview-scroll"><header className="route-overview-heading"><IconButton label="이전" onClick={() => go(active ? 'progress' : 'compare')}>‹</IconButton><div><h1>{data.title}</h1><p>{data.subtitle}</p></div></header><section className="route-overview-map"><VWorldMap ariaLabel="추천 경로 지도" interactive={false} style={{ width: '100%', height: '100%' }} /><RouteMotion /><span>{data.badge}</span><strong>{data.time}</strong></section><p className="route-overview-summary">{data.summary}</p><ScreenSection title="이동 순서" action="총 이동 52분"><ol className="route-overview-list">{data.stops.map(([name, stay, move, moveDetail], index) => <li key={`${name}-${index}`}><b>{index + 1}</b><div><strong>{name}</strong><span>{stay}</span>{move && <small><em>{move}</em>{moveDetail}</small>}</div></li>)}</ol></ScreenSection></main><div className="sticky-actions route-overview-actions"><ActionButton onClick={() => go(data.start)}>{active ? '이 코스로 계속하기' : '이 코스로 시작하기'}</ActionButton></div><BottomNav active="course" onNavigate={(tab) => go(rootRoutes[tab])} /></section>;
}

function NavigationMapHeader({ go, title = '길 안내 중', subtitle, count, back = 'progress' }) {
  return <header className="navigation-top-card"><IconButton label="이전" onClick={() => go(back)}>‹</IconButton><div><strong>{title}</strong><span>{subtitle}</span></div><b>{count}</b></header>;
}

function NavigationDirections({ title = '안국역 정류장 방향으로 이동', copy = '버스 탑승까지 도보 4분', turn = '120m 앞에서 오른쪽으로 이동' }) {
  return <section className="navigation-instruction"><div><i>♟</i><span><strong>{title}</strong><small>{copy}</small></span></div><p><i>↱</i>{turn}</p></section>;
}

function NavigationRouteState({ go, data }) {
  return <section className="phone travel-screen navigation-v3 navigation-route-state"><MapStage variant="navigation"><RouteMotion /><NavigationMapHeader go={go} subtitle={data.subtitle} count={data.count} back={data.back} /><NavigationDirections title={data.instructionTitle} copy={data.instructionCopy} />{data.notice && <section className="navigation-confirmation"><strong>{data.notice}</strong><span>{data.noticeCopy}</span></section>}<section className="navigation-destination"><div><strong>{data.destination}</strong><span>{data.destinationCopy}</span></div><i>{data.mode === 'taxi' ? 'T' : '▣'}</i></section><div className="sticky-actions split navigation-actions"><ActionButton onClick={() => go(data.primaryNext)}>{data.primary}</ActionButton><ActionButton tone="secondary" onClick={() => go(data.secondaryNext)}>{data.secondary}</ActionButton></div></MapStage></section>;
}

function GuidanceMapState({ go, data }) {
  return <section className="phone travel-screen navigation-v3 guidance-map-state"><MapStage variant="navigation"><RouteMotion /><NavigationMapHeader go={go} subtitle={data.subtitle || '블루 모먼트 전시 팝업으로 이동'} count={data.count || '2 / 4'} back={data.back || 'progress'} /><NavigationDirections title={data.instructionTitle} copy={data.instructionCopy} /><section className="guidance-alert-card"><span>{data.kicker}</span><h1>{data.title}</h1><p>{data.copy}</p>{data.place && <article><img src={data.place.image} alt="" /><div><strong>{data.place.name}</strong><small>{data.place.meta}</small></div></article>}{data.detail && <div className="guidance-alert-detail"><strong>{data.detail}</strong><small>{data.source}</small></div>}{data.status && <div className="guidance-alert-detail"><strong>{data.status}</strong><small>{data.source}</small></div>}<ActionButton onClick={() => go(data.next)}>{data.button}</ActionButton></section></MapStage></section>;
}

function CoursePlaceTimes({ go, basketState, settings = [], onSettingsChange, onSubmit, previewStatus, onRetry, onAuthRequired }) {
  const { items = [], status = 'loading' } = basketState || {};
  const isReady = status === 'success';
  const count = items.length;

  const updateSetting = (basketItemId, patch) => {
    onSettingsChange?.(basketItemId, patch);
  };

  const canContinue = isReady
    && count > 0
    && settings.length === count
    && previewStatus !== 'loading';

  const stateContent = status === 'logged-out'
    ? <div className="basket-state"><ShoppingBasket aria-hidden="true" size={28} /><h2>로그인이 필요해요</h2><p>로그인하면 담아둔 장소의 체류시간을 설정할 수 있어요.</p><ActionButton onClick={() => onAuthRequired?.({ screen: 'course-place-times' })}>로그인하기</ActionButton></div>
    : status === 'error'
      ? <div className="basket-state" role="alert"><RefreshCw aria-hidden="true" size={26} /><h2>장소를 불러오지 못했어요</h2><p>연결 상태를 확인하고 다시 시도해주세요.</p><ActionButton tone="secondary" onClick={onRetry}>다시 시도</ActionButton></div>
      : status === 'loading'
        ? <div className="basket-state basket-state-loading" role="status"><BrandLoading /><p>장소별 기본 시간을 불러오고 있어요.</p></div>
        : count === 0
          ? <div className="basket-state"><ShoppingBasket aria-hidden="true" size={28} /><h2>설정할 장소가 없어요</h2><p>가고 싶은 장소를 먼저 코스 장바구니에 담아주세요.</p><ActionButton tone="secondary" onClick={() => go('explore')}>장소 둘러보기</ActionButton></div>
          : null;

  return (
    <section className="phone standard-screen course-stop-settings-screen">
      <main className="page-scroll course-stop-settings-scroll">
        <header className="course-condition-heading course-stop-settings-heading">
          <IconButton className="page-back-button" label="이전" onClick={() => go('course-conditions')}>‹</IconButton>
          <div><h1>코스 만들기 <span>코스 설정 2/3</span></h1><p>장소별 체류시간을 설정해요.</p></div>
        </header>

        <CoursePlaceOverview items={items} />

        {stateContent}

        {isReady && count > 0 && (
          <div className="course-stop-settings-list">
            {items.map((item) => {
              const setting = settings.find((candidate) => candidate.basketItemId === item.id);
              if (!setting) return null;
              return (
                <article className="course-stop-setting-card" key={item.id}>
                  <header>
                    <CourseStopPhoto item={item} />
                    <div>
                      <h2>{item.placeName}</h2>
                      <p>{item.roadAddress || item.lotAddress || '주소 정보 없음'}</p>
                    </div>
                  </header>

                  <div className="course-dwell-setting">
                    <div><span>체류시간</span><small>기본 {setting.defaultDwellMinutes}분</small></div>
                    <div className="course-dwell-stepper" role="group" aria-label={`${item.placeName} 체류시간`}>
                      <button aria-label="체류시간 10분 줄이기" disabled={setting.dwellMinutes <= 10} onClick={() => updateSetting(item.id, { dwellMinutes: setting.dwellMinutes - 10 })} type="button"><Minus aria-hidden="true" size={17} strokeWidth={2} /></button>
                      <label className="course-dwell-input"><input aria-label={`${item.placeName} 체류시간(분)`} inputMode="numeric" max="1440" min="1" onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isInteger(value) && value >= 1 && value <= 1440) updateSetting(item.id, { dwellMinutes: value });
                      }} type="number" value={setting.dwellMinutes} /><small>분</small></label>
                      <button aria-label="체류시간 10분 늘리기" disabled={setting.dwellMinutes >= 1440} onClick={() => updateSetting(item.id, { dwellMinutes: setting.dwellMinutes + 10 })} type="button"><Plus aria-hidden="true" size={17} strokeWidth={2} /></button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <div className="sticky-actions course-stop-settings-actions">
        <CourseActionButton aria-busy={previewStatus === 'loading' || undefined} disabled={!canContinue} onClick={onSubmit}>{previewStatus === 'loading' ? '코스 계산 중' : '빠른 코스 계산하기'}</CourseActionButton>
      </div>
    </section>
  );
}

function CourseBasket({ screen, go, basketState, onItemRemoved, onRetry, onAuthRequired }) {
  const { items = [], status = 'loading' } = basketState || {};
  const [deletingIds, setDeletingIds] = useState(() => new Set());
  const [deleteErrors, setDeleteErrors] = useState({});
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const deleteControllersRef = useRef(new Map());
  const basketItemIdsKey = items.map((item) => String(item.id)).join('|');
  const isNatural = screen === 'basket-natural';
  const isGlass = screen === 'basket-glass';
  const isCurated = isNatural || isGlass;
  const variant = isNatural ? { title: '4곳을 담았어요', copy: '걷는 구간을 줄여 조금 더 여유롭게 정리했어요', label: '걷기 편한 순서', summary: '4곳 · 약 5시간 20분', note: '긴 도보 구간을 한 번 줄였어요' } : isGlass ? { title: '4곳을 담았어요', copy: '예약과 운영 시간을 먼저 반영해 정리했어요', label: '예약 시간 반영', summary: '4곳 · 약 5시간 10분', note: '15:00 예약에 맞춰 순서를 정했어요' } : { title: '코스 바구니', copy: '꼭 갈 곳과 가고 싶은 곳을 확인해요', label: '오늘 일정 준비 중', summary: '4곳 · 약 5시간 20분', note: '15시 예약 1건을 기준으로 순서를 맞췄어요' };
  const places = [
    { name: '런던 베이글 뮤지엄', meta: '15:00 예약 · 45분 체류', image: images.cafe, badge: '꼭 갈 곳' },
    { name: '블루 모먼트 전시 팝업', meta: '18:00 종료 · 40분 체류', image: images.scene, badge: 'D-3 팝업' },
    { name: '서울공예박물관', meta: '새 전시 · 60분 체류', image: images.cafe, badge: '가고 싶은 곳' },
    { name: '도토리가든', meta: '소금빵 · 40분 체류', image: images.detail, badge: '가고 싶은 곳' },
  ];

  useEffect(() => () => {
    deleteControllersRef.current.forEach((controller) => controller.abort());
    deleteControllersRef.current.clear();
  }, []);

  useEffect(() => {
    const activeIds = new Set(basketItemIdsKey ? basketItemIdsKey.split('|') : []);
    deleteControllersRef.current.forEach((controller, itemId) => {
      if (activeIds.has(itemId)) return;
      controller.abort();
      deleteControllersRef.current.delete(itemId);
    });
    setDeletingIds((current) => {
      const next = new Set([...current].filter((itemId) => activeIds.has(itemId)));
      return next.size === current.size ? current : next;
    });
    setDeleteErrors((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([itemId]) => activeIds.has(itemId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    setSelectedIds((current) => {
      const next = new Set([...current].filter((itemId) => activeIds.has(itemId)));
      return next.size === current.size ? current : next;
    });
  }, [basketItemIdsKey]);

  if (isCurated) {
    return <section className={`phone standard-screen basket-screen basket-screen-v3 ${screen} basket-curated`}><main className="page-scroll basket-scroll"><BackHeader title="코스 장바구니" onBack={() => go('course-home')} /><header className="basket-heading"><h1>{variant.title}</h1><p>{variant.copy}</p></header><section className="basket-summary"><span>{variant.label}</span><h2>{variant.summary}</h2><p>{variant.note}</p></section><section className="basket-reservation-note"><span>예약 일정</span><strong>런던 베이글 뮤지엄 · 오늘 15:00</strong><small>예약 10분 전 도착을 기준으로 계산했어요.</small></section><section className="basket-place-section"><h2>꼭 갈 곳</h2><div className="basket-place-list">{places.slice(0, 2).map((place) => <PlaceRow key={place.name} place={place} onClick={() => go('place')} />)}</div></section><section className="basket-place-section want"><h2>가고 싶은 곳</h2><div className="basket-place-list">{places.slice(2).map((place) => <PlaceRow key={place.name} place={place} onClick={() => go('place')} />)}</div></section><button type="button" className="basket-add-place" onClick={() => go('explore')}><span>＋</span>장소 더 담기</button></main><div className="sticky-actions basket-actions"><CourseActionButton onClick={() => go('compare')}>4개 장소로 코스 만들기</CourseActionButton></div><BottomNav active="course" onNavigate={(tab) => go(rootRoutes[tab])} /></section>;
  }

  const isReady = status === 'success';
  const count = items.length;
  const basketPlacePresentation = (item) => {
    const category = String(item.categoryName || '').toLowerCase();
    if (/촬영|드라마|영화/.test(category)) return { label: '촬영지', Icon: Clapperboard, tone: 'filming' };
    if (/음식|식당|맛집|restaurant/.test(category)) return { label: '음식점', Icon: Utensils, tone: 'restaurant' };
    if (/카페|커피|디저트|cafe/.test(category)) return { label: '카페', Icon: Coffee, tone: 'cafe' };
    if (/공원|숲|산책|park/.test(category)) return { label: '공원', Icon: Trees, tone: 'park' };
    if (/전시|행사|공연|축제|팝업|event/.test(category)) return { label: '전시·행사', Icon: CalendarDays, tone: 'event' };
    return { label: '관광지', Icon: Landmark, tone: 'landmark' };
  };

  const basketImageUrl = (item, presentation) => {
    if (typeof item.imageUrl === 'string' && item.imageUrl.trim()) return item.imageUrl;
    if (item.placeName === '운현궁') return '/assets/figma/intro-visual.png';
    if (presentation.tone === 'park' || presentation.tone === 'landmark') return '/assets/palace-garden.png';
    if (presentation.tone === 'filming') return '/assets/figma/explore-scene.jpeg';
    if (presentation.tone === 'event') return '/assets/figma/explore-popup.png';
    return '/assets/cafe-garden.png';
  };

  const handleDelete = async (item) => {
    const itemId = item.id;
    const itemKey = String(itemId);
    if (deleteControllersRef.current.has(itemKey)) return;
    if (!getAccessToken()) {
      onAuthRequired?.({ screen: 'basket' });
      return;
    }

    const controller = new AbortController();
    deleteControllersRef.current.set(itemKey, controller);
    setDeletingIds((current) => new Set(current).add(itemKey));
    setDeleteErrors((current) => {
      if (!current[itemKey]) return current;
      const next = { ...current };
      delete next[itemKey];
      return next;
    });

    try {
      await deleteCourseBasketPlace(itemId, { signal: controller.signal });
      if (!controller.signal.aborted) onItemRemoved?.(itemId);
      return true;
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      if (error?.status === 401) {
        onAuthRequired?.({ screen: 'basket' });
      } else if (error?.code === 'COURSE4041') {
        onRetry?.();
      } else {
        console.error('코스 장바구니에서 장소를 삭제하지 못했어요', error);
        setDeleteErrors((current) => ({ ...current, [itemKey]: '삭제하지 못했어요. 다시 시도해주세요.' }));
      }
      return false;
    } finally {
      if (deleteControllersRef.current.get(itemKey) !== controller) return;
      deleteControllersRef.current.delete(itemKey);
      if (!controller.signal.aborted) {
        setDeletingIds((current) => {
          const next = new Set(current);
          next.delete(itemKey);
          return next;
        });
      }
    }
  };

  const toggleItemSelection = (itemId) => {
    const itemKey = String(itemId);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  const toggleAllSelection = () => {
    setSelectedIds((current) => current.size === items.length
      ? new Set()
      : new Set(items.map((item) => String(item.id))));
  };

  const deleteItems = async (targetItems) => {
    if (isBulkDeleting || targetItems.length === 0) return;
    if (!getAccessToken()) {
      onAuthRequired?.({ screen: 'basket' });
      return;
    }

    setIsBulkDeleting(true);
    try {
      for (const item of targetItems) await handleDelete(item);
      setSelectedIds(new Set());
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const stateContent = status === 'logged-out'
    ? <div className="basket-state"><ShoppingBasket aria-hidden="true" size={28} /><h2>로그인이 필요해요</h2><p>로그인하면 담아둔 장소를 어디서든 이어서 볼 수 있어요.</p><ActionButton onClick={() => onAuthRequired?.({ screen: 'basket' })}>로그인하기</ActionButton></div>
    : status === 'error'
      ? <div className="basket-state" role="alert"><RefreshCw aria-hidden="true" size={26} /><h2>장소를 불러오지 못했어요</h2><p>연결 상태를 확인하고 다시 시도해주세요.</p><ActionButton tone="secondary" onClick={onRetry}>다시 시도</ActionButton></div>
      : status === 'loading'
        ? <div className="basket-state basket-state-loading" role="status"><BrandLoading /><p>담아둔 장소를 불러오고 있어요.</p></div>
        : count === 0
          ? <div className="basket-state"><ShoppingBasket aria-hidden="true" size={28} /><h2>아직 담은 장소가 없어요</h2><p>가고 싶은 장소를 발견하면 코스에 담아보세요.</p><ActionButton tone="secondary" onClick={() => go('explore')}>장소 둘러보기</ActionButton></div>
          : null;

  const selectedCount = selectedIds.size;
  const isAllSelected = count > 0 && selectedCount === count;
  return <section className="phone standard-screen basket-screen basket-screen-v3 basket">
    <main className="page-scroll basket-scroll">
      <header className="basket-chat-heading"><p>가고 싶은 장소를 모아뒀어요</p><h1>코스 장바구니</h1></header>
      {stateContent}
      {isReady && count > 0 && <section className="basket-place-section basket-current-list"><div className="basket-selection-toolbar"><button aria-pressed={isAllSelected} className={`basket-select-all${isAllSelected ? ' is-selected' : ''}`} onClick={toggleAllSelection} type="button"><span aria-hidden="true">{isAllSelected && <Check size={13} strokeWidth={2.6} />}</span>전체 선택</button><div><button disabled={isBulkDeleting} onClick={() => deleteItems(items)} type="button">전체 삭제</button><button disabled={isBulkDeleting || selectedCount === 0} onClick={() => deleteItems(items.filter((item) => selectedIds.has(String(item.id))))} type="button">선택 삭제{selectedCount ? ` (${selectedCount})` : ''}</button></div></div><div className="basket-real-list">{items.map((item) => {
    const isKakao = String(item.source).toUpperCase() === 'KAKAO';
    const internalPlaceId = Number(item.placeId ?? item.place?.id ?? item.ddemachimPlaceId);
    const canOpenDdemachimPlace = Number.isSafeInteger(internalPlaceId) && internalPlaceId > 0;
    const itemKey = String(item.id);
    const isDeleting = deletingIds.has(itemKey);
    const isSelected = selectedIds.has(itemKey);
    const deleteError = deleteErrors[itemKey];
    const deleteErrorId = `basket-delete-error-${itemKey}`;
    const presentation = basketPlacePresentation(item);
    const placeVisual = <img className="basket-item-image" src={basketImageUrl(item, presentation)} alt="" loading="lazy" />;
    const content = <>{placeVisual}<span><strong>{item.placeName}</strong><small>{presentation.label}</small></span></>;
    const navigation = isKakao
      ? <a className="basket-item-row" href={getKakaoPlaceUrl(item)} target="_blank" rel="noopener noreferrer">{content}</a>
      : <button className="basket-item-row" type="button" disabled={!canOpenDdemachimPlace} onClick={() => go('place', internalPlaceId)}>{content}</button>;
    return <div aria-busy={isDeleting || undefined} className={`basket-item-entry${isDeleting ? ' is-deleting' : ''}${isSelected ? ' is-selected' : ''}`} key={item.id}><div className="basket-item-controls">{navigation}<button aria-pressed={isSelected} aria-label={`${item.placeName} ${isSelected ? '선택 해제' : '선택'}`} className="basket-item-select" disabled={isDeleting || isBulkDeleting} onClick={() => toggleItemSelection(item.id)} type="button"><span aria-hidden="true">{isSelected && <Check size={14} strokeWidth={2.7} />}</span></button></div>{deleteError && <div className="basket-item-delete-error" id={deleteErrorId} role="alert"><span>{deleteError}</span><button onClick={() => handleDelete(item)} type="button">다시 시도</button></div>}</div>;
      })}</div><button type="button" className="basket-add-more" onClick={() => go('explore')}><Plus aria-hidden="true" size={18} strokeWidth={2} />장소 더 담기</button></section>}
    </main>
    <div className="sticky-actions basket-actions">
      <CourseActionButton disabled={!isReady || count === 0} onClick={() => go('course-conditions')}>{count > 0 ? `${count}개 장소로 코스 만들기` : '장소를 먼저 담아주세요'}</CourseActionButton>
    </div>
    <BottomNav active="course" onNavigate={(tab) => go(rootRoutes[tab])} />
  </section>;
}

function CourseCompare({ screen, go, coursePreview, courseDraft, onConfirm, confirmState }) {
  if (screen === 'route-map') return <RouteOverview go={go} />;
  const status = coursePreview?.status === 'idle' ? 'validation' : coursePreview?.status;
  const message = coursePreview?.status === 'idle'
    ? '출발 위치와 날짜, 장소별 시간을 순서대로 설정해주세요.'
    : coursePreview?.message;
  const needsActiveCourseReplacement = confirmState?.status === 'replace-active';
  return <CoursePreviewResults preview={coursePreview?.preview} origin={courseDraft?.start} failure={coursePreview?.failure} status={status} message={message} MapComponent={VWorldMap} onBack={() => go('course-place-times')} onRetry={status === 'error' ? coursePreview?.retry : undefined} onEditConditions={() => go('course-conditions')} onEditStops={() => go('course-conditions')} onConfirm={onConfirm} confirmLabel={needsActiveCourseReplacement ? '기존 코스 종료 후 시작' : courseDraft?.startTiming === 'NOW' ? '이 코스로 지금 시작' : '예정 코스로 저장'} confirmBusy={confirmState?.status === 'loading'} confirmError={confirmState?.error} />;
}

function CourseFilmingProximity({ currentLocation = null, courseStops = [], onNearby }) {
  const openedFilmingLocationIdsRef = useRef(new Set());
  const [filmingPlaces, setFilmingPlaces] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchPlaces({ tag: 'FILMING_LOCATION', size: 100 })
      .then((result) => {
        if (cancelled) return;
        const coursePlaceIds = new Set((Array.isArray(courseStops) ? courseStops : [])
          .map((stop) => Number(stop?.placeId ?? stop?.id))
          .filter((id) => Number.isSafeInteger(id) && id > 0));
        const places = (result?.content ?? []).filter((place) => coursePlaceIds.has(Number(place?.id)));
        setFilmingPlaces(places);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [courseStops]);

  useEffect(() => {
    if (filmingPlaces.length === 0) return undefined;
    const notifyIfNearby = (location) => {
      const place = findNearbyFilmingPlace(location, filmingPlaces);
      if (!place || openedFilmingLocationIdsRef.current.has(String(place.id))) return;
      openedFilmingLocationIdsRef.current.add(String(place.id));
      onNearby?.(place);
    };
    if (currentLocation) {
      const [longitude, latitude] = currentLocation.map(Number);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) notifyIfNearby({ latitude, longitude });
      return undefined;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => notifyIfNearby(coords),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentLocation?.[0], currentLocation?.[1], filmingPlaces, onNearby]);

  return null;
}

function NearbyFilmingScreen({ placeId, go }) {
  const [state, setState] = useState({ status: 'loading', locations: [] });
  const [workQuery, setWorkQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchPlaceFilmingLocations(placeId)
      .then((locations) => {
        if (!cancelled) setState({ status: 'success', locations: Array.isArray(locations) ? locations : [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', locations: [] });
      });
    return () => { cancelled = true; };
  }, [placeId]);

  const locations = state.locations;
  const reenactmentLocations = locations.filter(supportsSceneReenactment);
  const normalizedWorkQuery = workQuery.trim().toLocaleLowerCase('ko-KR');
  const filteredLocations = normalizedWorkQuery
    ? reenactmentLocations.filter((location) => String(location.mediaContent?.title ?? '')
      .toLocaleLowerCase('ko-KR').includes(normalizedWorkQuery))
    : reenactmentLocations;
  const placeName = locations[0]?.placeName || '촬영지';

  return <section className="phone standard-screen nearby-filming-screen">
    <BackHeader title="촬영지 도착" onBack={() => go('active-course')} />
    <main className="page-scroll nearby-filming-scroll">
      <p className="eyebrow">현재 위치 근처 · 반경 80m</p>
      <h1>{placeName}에 도착했어요</h1>
      <p className="nearby-filming-lede">이 장소에서 촬영된 장면을 골라 같은 구도로 촬영해보세요.</p>
      {state.status === 'loading' && <div className="centered-state" role="status"><BrandLoading /><p>촬영 장면을 불러오고 있어요.</p></div>}
      {state.status === 'success' && <>
        {reenactmentLocations.length > 0 && <label className="nearby-filming-work-search">
          <Search aria-hidden="true" size={18} strokeWidth={2} />
          <input value={workQuery} onChange={(event) => setWorkQuery(event.target.value)} placeholder="작품명 검색" aria-label="작품명 검색" />
          {workQuery && <button type="button" aria-label="작품명 검색어 지우기" onClick={() => setWorkQuery('')}><X aria-hidden="true" size={16} strokeWidth={2} /></button>}
        </label>}
        {reenactmentLocations.length === 0
          ? <p className="nearby-filming-empty">따라 찍을 수 있는 드라마·영화 장면이 아직 없어요.</p>
          : filteredLocations.length > 0
          ? <FilmingSceneSection filmingLocations={filteredLocations} go={go} />
          : <p className="nearby-filming-empty">검색한 작품의 촬영 장면이 이 장소에는 없어요.</p>}
      </>}
      {state.status === 'error' && <p className="nearby-filming-error" role="status">촬영 장면을 불러오지 못했어요. 코스는 계속 진행할 수 있어요.</p>}
    </main>
  </section>;
}

function SavedCourseScreen({ courseId, go, onAuthRequired, active = false }) {
  const [state, setState] = useState({ detail: null, status: 'loading', error: null });
  const [filmingNotice, setFilmingNotice] = useState(null);
  const [navigationLocation, setNavigationLocation] = useState(null);
  const [completionState, setCompletionState] = useState({ status: 'idle', error: null });
  const [replanState, setReplanState] = useState({ status: 'idle', error: null });
  const controllerRef = useRef(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((current) => ({ ...current, status: 'loading', error: null }));
    fetchCourse(courseId, { signal: controller.signal }).then((detail) => {
      if (controller.signal.aborted) return;
      const preview = normalizeCoursePreview(detail?.preview);
      if (!preview) throw new Error('저장된 코스 정보가 올바르지 않아요.');
      setState({ detail: { ...detail, preview }, status: 'success', error: null });
    }).catch((error) => {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      if (error?.status === 401) onAuthRequired?.({ screen: active ? 'active-course' : 'saved-course-preview', id: courseId });
      else setState((current) => ({ ...current, status: 'error', error: '코스를 불러오지 못했어요.' }));
    });
  }, [active, courseId, onAuthRequired]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const begin = async (replaceActive = false) => {
    if (state.status === 'starting' && !replaceActive) return;
    setState((current) => ({ ...current, status: 'starting', error: null }));
    try {
      const detail = await startCourse(courseId, { replaceActive });
      go('active-course', detail?.id || courseId);
    } catch (error) {
      if (error?.status === 401) {
        onAuthRequired?.({ screen: 'saved-course-preview', id: courseId });
        return;
      }
      if (error?.code === 'COURSE4091') {
        const confirmed = globalThis.confirm?.('진행 중인 코스를 종료하고 이 코스를 시작할까요?') ?? false;
        if (confirmed) {
          setState((current) => ({ ...current, status: 'success', error: null }));
          await begin(true);
          return;
        }
        setState((current) => ({ ...current, status: 'success', error: null }));
        return;
      }
      setState((current) => ({ ...current, status: 'success', error: '코스를 시작하지 못했어요. 다시 시도해주세요.' }));
    }
  };

  const finishTodayCourse = async () => {
    if (completionState.status === 'loading') return;
    setCompletionState({ status: 'loading', error: null });
    try {
      await completeCourse(courseId);
      go('course-home');
    } catch (error) {
      if (error?.status === 401) {
        onAuthRequired?.({ screen: 'active-course', id: courseId });
        return;
      }
      setCompletionState({ status: 'error', error: '코스를 종료하지 못했어요. 다시 시도해주세요.' });
    }
  };

  const handleDwellChange = async (stop, dwellMinutes, departureAt) => {
    const [longitude, latitude] = Array.isArray(navigationLocation) ? navigationLocation.map(Number) : [];
    const basketItemId = Number(stop?.basketItemId);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setReplanState({ status: 'error', error: '현재 위치를 확인한 뒤 남은 코스를 다시 계산할 수 있어요.' });
      return;
    }
    if (!Number.isSafeInteger(basketItemId) || basketItemId < 1) return;
    const departure = new Date(departureAt);
    const departureTime = `${String(departure.getHours()).padStart(2, '0')}:${String(departure.getMinutes()).padStart(2, '0')}`;
    setReplanState({ status: 'loading', error: null });
    try {
      const detail = await replanCourse(courseId, {
        currentStopBasketItemId: basketItemId,
        departureTime,
        latitude,
        longitude,
      });
      const preview = normalizeCoursePreview(detail?.preview);
      if (!preview) throw new Error('남은 코스 정보가 올바르지 않아요.');
      setState((current) => ({ ...current, detail: { ...detail, preview }, error: null }));
      setReplanState({ status: 'idle', error: null });
    } catch (error) {
      setReplanState({ status: 'error', error: error?.message || '남은 코스를 다시 계산하지 못했어요.' });
    }
  };

  if (state.status === 'loading') return <section className="phone standard-screen"><main className="page-scroll centered-state" role="status"><BrandLoading /><p>저장된 코스를 불러오고 있어요.</p></main></section>;
  if (!state.detail) return <section className="phone standard-screen"><main className="page-scroll centered-state" role="alert"><h1>{state.error}</h1><ActionButton onClick={load}>다시 시도</ActionButton></main></section>;
  return <>
    {active && <CourseFilmingProximity currentLocation={navigationLocation} courseStops={state.detail.preview?.stops} onNearby={setFilmingNotice} />}
    <CoursePreviewResults preview={state.detail.preview} origin={state.detail.start} status="success" MapComponent={VWorldMap} onBack={() => go('course-home')} readOnly navigationMode={active} onNavigationLocationChange={setNavigationLocation} onDwellChanged={active ? handleDwellChange : null} replanBusy={replanState.status === 'loading'} replanError={replanState.error} filmingNotice={active ? filmingNotice : null} onViewFilming={(place) => go('nearby-filming', place?.id)} onArrivalPlace={(stop) => {
      const placeId = Number(stop?.placeId);
      go(Number.isSafeInteger(placeId) && placeId > 0 ? 'place' : 'map', Number.isSafeInteger(placeId) && placeId > 0 ? placeId : undefined);
    }} onCompleteCourse={active ? finishTodayCourse : null} completeBusy={completionState.status === 'loading'} completeError={completionState.error} onConfirm={active ? null : () => begin(false)} confirmLabel="시작하기" confirmBusy={state.status === 'starting'} confirmError={state.error} />
  </>;
}

const navStates = {
  progress: { eyebrow: '오늘의 코스 · 1 / 3', title: '창덕궁 후원으로 걸어가요', copy: '도보 12분 · 820m', button: '길 안내 시작', next: 'navigation' },
  arrival: { eyebrow: '도착 확인', title: '창덕궁 후원에 도착했어요', copy: '반경 30m 안에서 위치를 확인했어요.', button: '현장 콘텐츠 보기', next: 'onsite', arrival: true },
  navigation: { eyebrow: '도보 길 안내', title: '다음 모퉁이에서 오른쪽으로', copy: '창덕궁 후원까지 540m · 약 8분', button: '도착 처리', next: 'arrival', route: true },
  reroute: { eyebrow: '혼잡 감지', title: '북촌로가 혼잡해요', copy: '6분 더 빠른 우회 경로를 찾았어요.', button: '우회 경로 적용', next: 'reroute-applied', crowd: true },
  'reroute-applied': { eyebrow: '경로 변경', title: '새로운 경로로 안내할게요', copy: '도보 11분 · 혼잡 구간을 피했어요.', button: '길 안내 계속', next: 'navigation', route: true },
  transit: { eyebrow: '대중교통 혼잡', title: '버스 대신 걸어갈까요?', copy: '다음 버스가 혼잡해요. 도보 14분이에요.', button: '도보 경로로 변경', next: 'navigation' },
  taxi: { eyebrow: '택시 경로', title: '택시 이동으로 바꿨어요', copy: '예상 7분 · 3,900원', button: '택시 앱 열기', next: 'taxi-handoff' },
  nearby: { eyebrow: '주변 추천', title: '지금, 이곳을 들러볼까요?', copy: '코스에서 4분 거리에 있는 운현궁이에요.', button: '코스에 추가', next: 'nearby-added', nearby: true },
  'nearby-added': { eyebrow: '코스 업데이트', title: '운현궁을 추가했어요', copy: '다음 장소 전, 20분 정도 머물러보세요.', button: '길 안내 계속', next: 'nearby-arrival', nearby: true },
  'nearby-arrival': { eyebrow: '새로운 장소 도착', title: '운현궁에 도착했어요', copy: '궁궐 산책을 시작해볼까요?', button: '현장 콘텐츠 보기', next: 'onsite', arrival: true },
  'active-course': { eyebrow: '진행 중인 코스', title: '안국동 느린 오후', copy: '2 / 4곳 방문 · 1시간 15분 남음', button: '다음 장소로', next: 'next-stop' },
  'next-stop': { eyebrow: '다음 목적지', title: '도토리가든에서 출발해요', copy: '창덕궁 후원까지 도보 12분이에요.', button: '길 안내 시작', next: 'navigation', route: true },
};

const navErrorStates = {
  'gps-error': ['위치를 정확히 찾지 못했어요', 'GPS 신호가 약해 현재 위치를 다시 확인하고 있어요.', '위치 다시 찾기', 'progress'],
  'taxi-handoff': ['택시 앱으로 이동할게요', '선택한 택시 앱에서 목적지와 경로를 확인해주세요.', '돌아가기', 'navigation'],
  offline: ['인터넷 연결이 끊겼어요', '저장된 지도와 현재 경로로 안내를 이어갈 수 있어요.', '오프라인으로 계속', 'navigation'],
  'closed-place': ['도착 예정 장소가 문을 닫았어요', '근처의 다른 장소를 추천해드릴게요.', '대체 장소 보기', 'nearby'],
  'stop-course': ['코스를 여기서 그만둘까요?', '기록은 저장되고, 언제든 이어서 시작할 수 있어요.', '코스 종료', 'record'],
};

function TravelScreen({ screen, go }) {
  if (screen === 'progress' || screen === 'next-stop') {
    const nextStop = screen === 'next-stop';
    const data = nextStop ? { subtitle: '다음 장소로 출발할까요?', count: '2 / 5', walk: '다음 장소까지 도보 8분 · 620m', place: '도토리가든', eta: '16:40 도착 예정 · 여유롭게 이동해요', direction: '북촌로5길 방향으로 이동', distance: '도보 8분 · 620m', complete: '2곳 완료', stats: ['2 / 5', '3.2km', '2시간 45분'], primary: '출발하기', secondary: '조금 더 머물기' } : { subtitle: '두 번째 장소로 이동 중이에요', count: '1 / 4', walk: '다음 장소까지 도보 10분 · 720m', place: '런던 베이글 뮤지엄', eta: '14:45 도착 예정 · 예약까지 15분 여유', direction: '북촌로 방향으로 이동', distance: '도보 10분 · 720m', complete: '1곳 완료', stats: ['1 / 4', '3.8km', '3시간 25분'], primary: '길 안내 시작', secondary: '일시정지' };
    return <section className="phone travel-screen progress-screen"><MapStage variant="navigation"><div className="progress-header"><IconButton label="이전" onClick={() => go('active-course')}>‹</IconButton><div><strong>코스 진행 중</strong><span>{data.subtitle}</span></div><b>{data.count}</b></div><RouteMotion /><div className="walk-distance">♟ {data.walk}</div><BottomSheet className="progress-sheet"><div className="travel-eyebrow">다음 장소</div><h1>{data.place}</h1><p>{data.eta}</p><div className="direction-card"><span>♟</span><div><strong>{data.direction}</strong><small>{data.distance}</small><em>↱&nbsp;&nbsp;120m 앞에서 오른쪽으로 이동</em></div></div><div className="progress-title"><h2>오늘의 진행</h2><button type="button" onClick={() => go('complete')}>{data.complete}</button></div><div className="travel-stats"><span><small>완료</small><b>{data.stats[0]}</b></span><span><small>남은 거리</small><b>{data.stats[1]}</b></span><span><small>남은 시간</small><b>{data.stats[2]}</b></span></div><div className="progress-actions"><ActionButton onClick={() => go('navigation')}>{data.primary}</ActionButton><ActionButton tone="secondary" onClick={() => go(nextStop ? 'active-course' : 'stop-course')}>{data.secondary}</ActionButton></div></BottomSheet></MapStage></section>;
  }
  if (screen === 'arrival' || screen === 'nearby-arrival') {
    const nearby = screen === 'nearby-arrival';
    const data = nearby ? { count: '2 / 5', place: '운현궁', image: images.onsite, contentTitle: '운현궁 이야기가 열렸어요', contentCopy: '공간 이야기와 관람 포인트를 지금 확인할 수 있어요.', nextPlace: '다음 장소 · 도토리가든', nextCopy: '도보 8분 · 620m · 16:40 도착 예정' } : { count: '2 / 4', place: '런던 베이글 뮤지엄', image: images.cafe, contentTitle: '현장 콘텐츠가 열렸어요', contentCopy: '장소 이야기와 방문 팁을 지금 확인할 수 있어요.', nextPlace: '다음 장소 · 블루 모먼트 전시 팝업', nextCopy: '버스 22분 · 3정거장 · 16:10 도착 예정' };
    return <section className="phone travel-screen arrival-v3"><MapStage variant="navigation"><header className="arrival-top-card"><div><strong>코스 진행 중</strong><span>도착 위치를 확인했어요</span></div><b>{data.count}</b></header><ArrivalMotion /><BottomSheet className="arrival-sheet"><span className="arrival-confirmed">위치 확인 완료</span><h1>도착했어요!</h1><h2>{data.place}</h2><p>현재 위치가 장소 반경 30m 안에 있어요.</p><article className="arrival-content-card"><img src={data.image} alt={data.place} /><div><span>때마침 도착 안내</span><strong>{data.contentTitle}</strong><small>{data.contentCopy}</small></div></article><StatusBanner tone="blue" title="위치 인증이 완료됐어요" copy="이번 방문은 오늘의 기록에 자동으로 남아요." /><article className="arrival-next-stop"><div><strong>{data.nextPlace}</strong><span>{data.nextCopy}</span></div><i>▣</i></article></BottomSheet><div className="sticky-actions split arrival-actions"><ActionButton onClick={() => go('onsite')}>현장 콘텐츠 보기</ActionButton><ActionButton tone="secondary" onClick={() => go('navigation')}>다음 장소</ActionButton></div></MapStage></section>;
  }
  if (screen === 'active-course') return <RouteOverview go={go} active />;
  const routeStates = {
    navigation: { subtitle: '블루 모먼트 전시 팝업으로 이동', count: '2 / 4', instructionTitle: '안국역 정류장 방향으로 이동', instructionCopy: '버스 탑승까지 도보 4분', destination: '블루 모먼트 전시 팝업', destinationCopy: '버스 22분 · 3정거장 · 16:10 도착 예정', primary: '안내 일시정지', primaryNext: 'active-course', secondary: '코스 보기', secondaryNext: 'active-course' },
    'reroute-applied': { subtitle: '도토리가든으로 이동', count: '2 / 4', instructionTitle: '안국역 정류장 방향으로 이동', instructionCopy: '버스 탑승까지 도보 4분', destination: '도토리가든', destinationCopy: '버스 28분 · 5정거장 · 16:16 도착 예정', notice: '코스 순서를 바꿨어요', noticeCopy: '도토리가든을 먼저 방문해요', primary: '안내 일시정지', primaryNext: 'active-course', secondary: '코스 보기', secondaryNext: 'active-course' },
    taxi: { subtitle: '도토리가든으로 이동', count: '2 / 4', instructionTitle: '택시 승차 지점으로 이동', instructionCopy: '승차 지점까지 도보 2분', destination: '도토리가든', destinationCopy: '택시 18분 · 16:06 도착 예정', notice: '택시 이동으로 바꿨어요', noticeCopy: '예상 요금 14,000-17,000원', mode: 'taxi', primary: '안내 일시정지', primaryNext: 'active-course', secondary: '코스 보기', secondaryNext: 'active-course' },
    'nearby-added': { subtitle: '운현궁으로 이동', count: '2 / 5', instructionTitle: '택시 승차 지점으로 이동', instructionCopy: '승차 지점까지 도보 2분', destination: '운현궁', destinationCopy: '택시 12분 · 15:58 도착 예정', notice: '운현궁을 코스에 추가했어요', noticeCopy: '도토리가든 전에 들러요', mode: 'taxi', primary: '안내 일시정지', primaryNext: 'active-course', secondary: '코스 보기', secondaryNext: 'active-course' },
  };
  if (routeStates[screen]) return <NavigationRouteState go={go} data={routeStates[screen]} />;
  const guidanceStates = {
    reroute: { kicker: '실시간 혼잡', title: '성수 지금 혼잡해요', copy: '도토리가든을 먼저 방문하면 혼잡 시간을 피할 수 있어요.', detail: '도토리가든  →  블루 모먼트', source: '서울 실시간 도시데이터 · 5분 전', button: '순서 바꾸기', next: 'reroute-applied' },
    transit: { kicker: '대중교통 혼잡', title: '지금 버스가 많이 붐벼요', copy: '택시로 바꾸면 더 편하게 이동할 수 있어요.', detail: '택시 약 18분 · 예상 14,000-17,000원', source: '실시간 교통정보 · 3분 전', button: '택시로 변경', next: 'taxi' },
    nearby: { kicker: '근처 추천', title: '운현궁이 경로 바로 옆이에요', copy: '지금 위치에서 3분만 걸으면 들를 수 있어요.', place: { name: '운현궁', meta: '도보 3분 · 관람 약 20분', image: images.onsite }, detail: '경로에서 180m · 오늘 18:00까지', source: '공공데이터 운영정보 · 오늘 확인', button: '코스에 추가', next: 'nearby-added' },
    'gps-error': { kicker: 'GPS 신호', title: '위치를 정확히 찾지 못했어요', copy: '잠시 멈춰 주변이 트인 곳에서 다시 시도해주세요.', status: 'GPS 신호 확인 중', source: '마지막 위치 · 1분 전', button: '다시 찾기', next: 'navigation' },
    'taxi-handoff': { kicker: '택시 연결', title: '택시 앱으로 이동할까요?', copy: '때마침에서는 경로만 안내하고 호출은 택시 앱에서 진행해요.', detail: '예상 14,000-17,000원 · 약 18분', source: '요금은 호출 시 달라질 수 있어요.', button: '택시 앱 열기', next: 'taxi' },
    offline: { kicker: '네트워크 상태', title: '인터넷 연결이 끊겼어요', copy: '지도는 마지막으로 불러온 상태를 보여주고 있어요.', status: '오프라인 지도 사용 중', source: '연결되면 자동으로 새로고침해요.', button: '다시 연결', next: 'navigation' },
    'closed-place': { kicker: '운영시간 안내', title: '도토리가든 운영이 곧 끝나요', copy: '서울공예박물관을 먼저 방문하면 운영 시간 안에 도착할 수 있어요.', detail: '서울공예박물관  →  도토리가든', source: '운영정보 · 10분 전', button: '순서 바꾸기', next: 'reroute-applied' },
    'stop-course': { kicker: '코스 종료', title: '코스를 종료할까요?', copy: '지금까지 방문한 2곳은 오늘의 기록에 저장돼요.', status: '남은 장소 3곳', source: '저장한 코스에서 언제든 다시 시작할 수 있어요.', button: '코스 종료', next: 'record' },
  };
  return <GuidanceMapState go={go} data={guidanceStates[screen]} />;
}

function FilmingWorkPlaceItem({ place, index, total, go }) {
  const sceneRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const congestion = useMockCrowdingAtPoint(place.longitude, place.latitude);

  useEffect(() => {
    setIsExpanded(false);
    const measureOverflow = () => {
      const scene = sceneRef.current;
      if (scene) {
        const lineHeight = Number.parseFloat(window.getComputedStyle(scene).lineHeight) || 18;
        setCanExpand(scene.scrollHeight > lineHeight * 3 + 1);
      }
    };
    const frame = window.requestAnimationFrame(measureOverflow);
    window.addEventListener('resize', measureOverflow);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureOverflow);
    };
  }, [place.scene]);

  return (
    <article className={`filming-work-place-item${isExpanded ? ' is-expanded' : ''}`}>
      <div className="filming-work-place-main">
        <span className="filming-work-place-image">
          {place.image
            ? <img src={place.image} alt={`${place.name} 전경`} />
            : <span className="filming-work-place-image-fallback"><ImageIcon size={22} /></span>}
          {total > 1 && <b>{String(index + 1).padStart(2, '0')}</b>}
        </span>
        <span className="filming-work-place-copy">
          <span className="filming-work-place-title-row"><strong>{place.name}</strong></span>
          <span className="filming-work-place-meta-row"><small>{place.category}</small><CongestionBadge congestion={congestion} compact className="filming-work-place-congestion" /></span>
          <span ref={sceneRef} className={`filming-work-place-scene${isExpanded ? ' is-expanded' : ''}`}>{place.scene}</span>
          <span className="filming-work-place-actions">
            <button type="button" onClick={() => go('place', place.id)}>장소 상세</button>
            <button type="button" onClick={() => go('scene-detail', place.filmingLocationId)}>촬영 장면 보기</button>
          </span>
        </span>
      </div>
      {canExpand && (
        <button
          className="filming-work-scene-toggle"
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? '접기' : '더보기'}
        </button>
      )}
    </article>
  );
}

function FilmingWorkCreditAvatar({ credit }) {
  const imageUrl = tmdbProfileUrl(credit.profilePath);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <span className="filming-work-credit-avatar">
      {imageUrl && !imageFailed
        ? <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
        : <span className="filming-work-credit-avatar-fallback" aria-hidden="true"><UserRound size={27} strokeWidth={1.6} /></span>}
    </span>
  );
}

function filmingWorkCreditRoleLabel(credit) {
  if (credit.role === 'DIRECTOR') return '감독';
  const characterName = credit.characterNameKo || credit.characterName;
  return characterName ? `${characterName} 역` : '출연';
}

function FilmingWorkCredits({ credits }) {
  const scrollRef = useRef(null);
  const visibleCredits = Array.isArray(credits) ? credits.slice(0, 12) : [];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [credits]);

  if (!visibleCredits.length) return null;

  const handleKeyDown = (event) => {
    const scroll = event.currentTarget;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior = reducedMotion ? 'auto' : 'smooth';
    const step = Math.max(scroll.clientWidth * 0.75, 144);

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      scroll.scrollBy({ left: event.key === 'ArrowRight' ? step : -step, behavior });
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      scroll.scrollTo({ left: event.key === 'Home' ? 0 : scroll.scrollWidth, behavior });
    }
  };

  return (
    <section className="filming-work-credit-section" aria-labelledby="filming-work-credit-title">
      <header>
        <h2 id="filming-work-credit-title">감독·출연</h2>
        <span>{visibleCredits.length}명</span>
      </header>
      <div
        className="filming-work-credit-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="감독·출연 목록"
        onKeyDown={handleKeyDown}
      >
        <ul className="filming-work-credit-list">
          {visibleCredits.map((credit, index) => {
            const roleLabel = filmingWorkCreditRoleLabel(credit);
            const displayName = credit.nameKo || credit.name;
            const creditKey = credit.personId ?? credit.tmdbPersonId ?? `${displayName}-${index}`;
            return (
              <li className="filming-work-credit-item" key={`${creditKey}-${credit.role}`}>
                <FilmingWorkCreditAvatar credit={credit} />
                <span className="filming-work-credit-copy">
                  <strong className="filming-work-credit-name" title={displayName}>{displayName}</strong>
                  <span className="filming-work-credit-role" title={roleLabel}>{roleLabel}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function FilmingWorkDetail({ go, workId }) {
  const scrollRef = useRef(null);
  const [work, setWork] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workId]);

  useEffect(() => {
    if (!workId) {
      setIsLoading(false);
      setLoadError(true);
      return undefined;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(false);
    setWork(null);
    setOverviewExpanded(false);
    setActiveTab('info');

    Promise.all([
      fetchMediaContent(workId, { signal: controller.signal }),
      fetchMediaFilmingLocations(workId, { signal: controller.signal }),
    ])
      .then(async ([media, filmingLocations]) => {
        const places = await Promise.all((filmingLocations ?? []).map(async (filmingLocation, index) => {
          const place = await fetchPlace(filmingLocation.placeId, { signal: controller.signal });
          return {
            id: place.id,
            name: place.name || filmingLocation.placeName,
            category: place.categoryLabel || '장소 정보 확인 중',
            scene: filmingLocation.sceneDescription || '장면 설명을 준비하고 있어요.',
            image: place.imageUrl || null,
            latitude: place.latitude,
            longitude: place.longitude,
            categoryCode: place.categoryCode,
            tags: place.tags,
            filmingLocationId: filmingLocation.id,
            order: index + 1,
          };
        }));

        if (controller.signal.aborted) return;
        setWork({
          id: media.id,
          title: media.title,
          type: filmingWorkTypeLabel(media),
          year: formatReleaseYear(media.releaseDate),
          poster: tmdbPosterUrl(media.posterPath),
          overview: media.overview,
          credits: normalizeMediaCredits(media.credits),
          places,
        });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        console.error('작품 촬영지 상세를 불러오지 못했어요', error);
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [workId]);

  if (isLoading) {
    return <section className="phone standard-screen filming-work-detail-screen"><main className="page-scroll centered-state"><BrandLoading /><h1>작품 속 장소를 찾고 있어요</h1><p>작품 정보와 촬영 장면을 함께 불러오는 중이에요.</p></main></section>;
  }

  if (loadError || !work) {
    return <section className="phone standard-screen filming-work-detail-screen"><BackHeader title="작품 상세" onBack={() => go('filming-locations')} /><main className="page-scroll centered-state"><SearchX size={38} /><h1>작품 정보를 불러오지 못했어요</h1><p>잠시 후 다시 시도해주세요.</p><ActionButton onClick={() => go('filming-locations')}>작품 목록으로</ActionButton></main></section>;
  }

  const tabs = [
    { id: 'info', label: '정보' },
    { id: 'places', label: '촬영지', count: work.places.length },
  ];

  const tabContent = {
    info: <>
      <p className={`filming-work-detail-overview${overviewExpanded ? ' is-expanded' : ''}`}>{work.overview || '작품 소개를 준비하고 있어요.'}</p>
      {work.overview?.length > 120 && <button className="filming-work-overview-toggle" type="button" aria-expanded={overviewExpanded} onClick={() => setOverviewExpanded((current) => !current)}>{overviewExpanded ? '접기' : '더보기'}</button>}
      <FilmingWorkCredits credits={work.credits} />
    </>,
    places: <section className="filming-work-place-section">
      <header>
        <h2>이 작품 속 서울</h2>
        <span>{work.places.length}곳</span>
      </header>
      {work.places.length ? <div className="filming-work-place-list">
        {work.places.map((place, index) => <FilmingWorkPlaceItem key={place.id} place={place} index={index} total={work.places.length} go={go} />)}
      </div> : <div className="filming-work-empty"><p>등록된 촬영 장소가 아직 없어요.</p></div>}
    </section>,
  }[activeTab];

  return (
    <section className="phone standard-screen filming-work-detail-screen">
      <main className="page-scroll filming-work-detail-scroll" ref={scrollRef}>
        <div className="filming-work-detail-hero">
          {work.poster
            ? <img src={work.poster} alt={`${work.title} 포스터`} />
            : <div className="filming-work-detail-poster-fallback"><Clapperboard size={34} /><span>포스터 준비 중</span></div>}
          <div className="filming-work-detail-controls">
            <IconButton label="이전" onClick={() => go('filming-locations')}><ChevronLeft size={20} /></IconButton>
          </div>
          <span className="filming-work-detail-count"><MapPin size={14} /> 촬영 장소 {work.places.length}곳</span>
        </div>

        <DetailContentSheet className="filming-work-detail-copy">
          <p className="filming-work-detail-meta">{[work.type, work.year].filter(Boolean).join(' · ')}</p>
          <h1>{work.title}</h1>
          <DetailTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} ariaLabel="작품 상세 정보" idPrefix="filming-work-tab" />
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="filming-work-detail-tab-panel"
            id={`filming-work-tab-panel-${activeTab}`}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            key={activeTab}
            role="tabpanel"
            aria-labelledby={`filming-work-tab-${activeTab}`}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
          >
            {tabContent}
          </motion.div>
        </DetailContentSheet>
      </main>
    </section>
  );
}

function MapPermissionPrompt({ go, title, copy, detail, action, next }) {
  return <section className="phone map-permission-screen"><MapStage variant="home"><div className="map-top-fade" /><header className="server-map-heading"><p>안국동 · 내 주변</p><h1>오늘, 어디로 걸어볼까요?</h1><button type="button"><span><SearchIcon /></span>장소 · 지역 · 테마 검색</button><div><Chip active>전체</Chip><Chip>요즘</Chip><Chip>팝업</Chip><Chip>촬영지</Chip></div></header><div className="server-error-dim" /><BottomSheet className="map-permission-sheet"><h1>{title}</h1><p>{copy}</p><article><strong>{detail[0]}</strong><small>{detail[1]}</small></article><ActionButton onClick={() => go(next)}>{action}</ActionButton></BottomSheet></MapStage></section>;
}

function MapLoadingPrompt({ go }) {
  return <section className="phone map-permission-screen map-loading-screen"><MapStage variant="home"><div className="map-top-fade" /><header className="server-map-heading"><p>안국동 · 내 주변</p><h1>오늘, 어디로 걸어볼까요?</h1><button type="button"><span><SearchIcon /></span>장소 · 지역 · 테마 검색</button><div><Chip active>전체</Chip><Chip>요즘</Chip><Chip>팝업</Chip><Chip>촬영지</Chip></div></header><div className="server-error-dim" /><BottomSheet className="map-permission-sheet map-loading-sheet"><BrandLoading /><h1>장소 정보를 불러오고 있어요</h1><p>공공데이터와 실시간 혼잡 정보를 확인하는 중이에요.</p><article><strong>잠시만 기다려주세요</strong><small>네트워크 상태에 따라 몇 초 걸릴 수 있어요.</small></article><ActionButton tone="secondary" onClick={() => go('map')}>나중에 다시 보기</ActionButton></BottomSheet></MapStage></section>;
}

function FilmingScreen({ screen, go, id }) {
  if (screen === 'filming-work') return <FilmingWorkDetail go={go} workId={id} />;
  if (screen === 'camera') return <SceneCameraScreen id={id} go={go} />;
  if (screen === 'scene-list') return <section className="phone standard-screen scene-list-v3"><BackHeader title="촬영 장면 · 운현궁" onBack={() => go('filming-content')} /><main className="page-scroll scene-list-scroll"><header><h1>이곳에서 촬영된 장면</h1><p>장면 ID가 확인된 항목만 촬영할 수 있어요</p></header><div className="scene-sort-row"><Chip active>작품별</Chip><Chip>최신순</Chip></div><article className="scene-work-card"><img src="/assets/figma/intro-visual.png" alt="운현궁 촬영 장소" /><div><span>작품 정보</span><small>촬영지 장면 연결 준비 중</small><p>이 예시 목록에는 실제 촬영지 장면 ID가 없어 카메라를 연결하지 않아요.</p></div></article><p className="scene-list-note" role="status">장소 상세의 실제 촬영 장면 목록에서 선택해주세요.</p><div className="sticky-actions"><ActionButton onClick={() => go('filming-locations')}>촬영지 다시 찾기</ActionButton></div></main></section>;
  if (screen === 'onsite') return <section className="phone standard-screen onsite-screen"><main className="page-scroll"><div className="onsite-hero"><img src="/assets/figma/intro-visual.png" alt="운현궁 전경" /><div className="onsite-overlay-actions"><IconButton label="이전" onClick={() => go('arrival')}>‹</IconButton><IconButton label="장소 저장" onClick={() => go('saved')}>♡</IconButton></div></div><div className="onsite-copy"><p className="eyebrow">안국 · 궁궐</p><h1>운현궁</h1><p>화-일 09:00-18:00</p><div className="chip-row"><Chip active>지금 여유</Chip><Chip>관람 약 20분</Chip></div><ScreenSection title="운현궁에서 놓치지 말 것"><div className="why-card"><span>현장 위치 확인 완료 · 오늘 업데이트</span><strong>노안당과 이로당을 잇는<br />마당 동선을 천천히 걸어보세요.</strong><p>오후에는 처마 그림자가 선명해요.</p></div></ScreenSection><ScreenSection title="지금 현장에서는" action="방금 도착"><div className="onsite-fact-grid"><article><span>관람</span><b>약 20분</b></article><article><span>촬영</span><b>삼각대 사용 제한</b></article></div></ScreenSection></div></main><div className="sticky-actions split onsite-actions"><ActionButton onClick={() => go('complete')}>관람 완료</ActionButton><ActionButton tone="secondary" onClick={() => go('filming-content')}>후기 보기</ActionButton></div></section>;
  if (screen === 'filming-content') return <section className="phone standard-screen filming-content-v3"><main className="page-scroll"><div className="filming-content-hero"><img src="/assets/figma/intro-visual.png" alt="운현궁 촬영지 전경" /><div className="filming-content-controls"><IconButton label="이전" onClick={() => go('onsite')}>‹</IconButton><IconButton label="장소 저장" onClick={() => go('saved')}>♡</IconButton></div></div><div className="filming-content-copy"><p className="eyebrow">촬영지 · 서울 종로</p><h1>운현궁 · 작품 정보</h1><p>촬영 가능한 장면은 실제 장면 ID가 있는 장소 상세에서 선택해주세요.</p><ScreenSection title="장면 선택 안내"><div className="why-card filming-why-card"><span>정확한 촬영지 장면 연결</span><strong>예시 이미지나 작품 ID를 촬영 장면 ID 대신 사용하지 않아요.</strong><p>장소 상세에서 확인된 촬영 장면만 카메라로 연결해요.</p></div></ScreenSection></div></main><div className="sticky-actions filming-content-actions"><ActionButton onClick={() => go('filming-locations')}>촬영지 찾기</ActionButton></div></section>;
  if (screen === 'scene-detail') return <section className="phone standard-screen scene-detail-v3"><main className="page-scroll"><figure className="scene-detail-reference"><img src="/assets/scenes/filming-location-1.jpg" alt="선택한 촬영 장면 참고 이미지" /></figure><div className="scene-detail-copy"><p className="eyebrow">촬영 장면</p><SceneDetailHeading>이 장면의 구도를 맞춰보세요</SceneDetailHeading><p>사진을 참고해 같은 위치와 시선으로 촬영할 수 있어요.</p></div></main><div className="sticky-actions scene-detail-actions"><SceneDetailCameraPanel id={id} go={go} /></div></section>;
  if (screen === 'shot-result') return <SceneShotResultScreen id={id} go={go} />;
  if (screen === 'photo-saved') return <CourseComplete go={go} photoSaved />;
  if (screen === 'image-missing') return <section className="phone standard-screen missing-filming-v3"><BackHeader title="촬영지 정보" onBack={() => go('filming-content')} /><main className="page-scroll missing-filming-scroll"><p className="eyebrow">촬영지 · 서울 종로</p><h1>운현궁 · 작품 정보</h1><div className="chip-row"><Chip active>위치 확인</Chip><Chip>정보 1개</Chip></div><ScreenSection title="장면 이미지 준비 중"><div className="why-card"><span>참고 장면을 불러올 수 없어요</span><strong>공공데이터 위치는 정상적으로 확인됐어요</strong><p>TMDB에 제공된 스틸 이미지가 없어<br />현재는 위치와 촬영 방향만 안내해요.</p></div><p className="missing-update-copy">이미지가 추가되면 자동으로 표시돼요</p></ScreenSection><ScreenSection title="대체 안내"><div className="scene-spec-grid"><article><span>방향</span><b>동쪽 · 92°</b></article><article><span>높이</span><b>눈높이</b></article></div></ScreenSection></main><div className="sticky-actions"><ActionButton onClick={() => go('filming-locations')}>촬영지 다시 찾기</ActionButton></div></section>;
  if (screen === 'filming-restricted') return <GuidanceMapState go={go} data={{ kicker: '촬영 안내', title: '현재 위치에서는 촬영할 수 없어요', copy: '문화재 보호와 관람객 안전을 위해 카메라 사용이 제한돼요.', detail: '촬영 가능 지점까지 80m', source: '공공데이터 운영정보 · 오늘 확인', button: '다른 촬영지 찾기', next: 'filming-locations' }} />;
  if (screen === 'report') return <section className="phone standard-screen report-v3"><BackHeader title="데이터 출처·오류 신고" onBack={() => go('filming-content')} /><main className="page-scroll report-scroll"><p className="eyebrow">운현궁 촬영지 정보</p><h1>어떤 정보가 다른가요?</h1><p className="report-lede">확인할 항목을 선택하면 운영팀이 검토해요.</p><ScreenSection title="현재 사용 중인 출처"><div className="report-source-list"><article><strong>장소 좌표</strong><span>공공데이터포털 · 서울 열린데이터광장</span></article><article><strong>작품·장면 정보</strong><span>TMDB API · 마지막 확인 오늘</span></article></div></ScreenSection><ScreenSection title="신고할 항목"><div className="review-choice-row"><Chip active>위치</Chip><Chip>작품</Chip><Chip>스틸컷</Chip></div></ScreenSection><ScreenSection title="문제 유형"><div className="report-type-grid"><button type="button" className="selected"><strong>정보가 달라요</strong><small>현장 위치가 일치하지 않아요</small></button><button type="button"><strong>촬영 제한</strong><small>운영시간 또는 촬영 규정이 달라요</small></button></div></ScreenSection><ScreenSection title="공개 범위"><div className="review-choice-row"><Chip active>익명</Chip><Chip>연락 가능</Chip><Chip>답변 받기</Chip></div></ScreenSection><StatusBanner tone="blue" title="신고 내용은 출처와 현장을 다시 확인해요" copy="확인 전까지 기존 정보에는 검토 중 표시가 붙어요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('filming-content')}>오류 신고</ActionButton></div></section>;
  return <section className="phone standard-screen"><main className="page-scroll centered-state"><h1>화면을 찾지 못했어요</h1><ActionButton onClick={() => go('map')}>지도로 돌아가기</ActionButton></main></section>;
}

const recordStates = {
  record: ['오늘의 여행 기록', '안국동 느린 오후', '오늘 2시간 18분 동안 4곳을 걸었어요.', 'record-detail'],
  'saved-courses': ['저장한 코스', '다시 걷고 싶은 길', '저장한 코스는 언제든 시작할 수 있어요.', 'record-detail'],
  'record-detail': ['여행 기록', '안국동 느린 오후', '도토리가든에서 시작해 운현궁까지 걸었어요.', 'write-review'],
  'write-review': ['후기 작성', '오늘의 산책은 어땠나요?', '다음 여행자를 위해 짧은 이야기를 남겨주세요.', 'reviews'],
  reviews: ['후기', '여행자들의 기록', '장소와 코스를 먼저 걸어본 사람들의 이야기예요.', 'review-detail'],
  'review-detail': ['후기', '햇빛 좋은 날에 걷기 좋았어요', '천천히 둘러봐도 2시간이면 충분했고, 정원이 특히 좋았습니다.', 'record'],
};

function JourneySummary({ saved = false }) {
  return <section className="journey-summary"><div className="journey-summary-top"><span className="journey-avatar">{saved ? 'S' : '8/9'}</span><div><h2>{saved ? '저장 목록' : '8월 9일 서울 산책'}</h2><p>{saved ? '다시 걷고 싶은 코스 3개' : '5곳을 방문했어요'}</p></div></div><div className="journey-summary-stats">{(saved ? [['3', '저장한 코스'], ['12', '장소'], ['2', '완료']] : [['6.8km', '걸은 거리'], ['6시간 20분', '총 시간'], ['5', '방문']]).map(([value, label]) => <span key={label}><b>{value}</b><small>{label}</small></span>)}</div></section>;
}

function CourseComplete({ go, photoSaved = false }) {
  const data = photoSaved ? { badge: '방문 인증 완료', headerValue: '운현궁', record: '촬영지 방문 기록', recordCopy: '방문 장소와 사진을 모아봤어요', primary: '사진 보기', primaryNext: 'record', secondary: '다음 장소', secondaryNext: 'navigation' } : { badge: '코스 완료', headerValue: '5 / 5', record: '오늘의 여행 기록', recordCopy: '방문 장소와 사진을 모아봤어요', primary: '기록 보기', primaryNext: 'record', secondary: '홈으로', secondaryNext: 'map' };
  return <section className={`phone complete-screen ${photoSaved ? 'photo-saved-complete' : ''}`}><MapStage variant="complete"><div className="complete-header"><IconButton label="이전" onClick={() => go('active-course')}>‹</IconButton><div><strong>오늘 코스 완료</strong><span>마지막 장소까지 도착했어요</span></div><b>{data.headerValue}</b></div><ArrivalMotion /><BottomSheet className="complete-sheet"><span className="complete-badge">{data.badge}</span><h1>오늘의 코스를 마쳤어요</h1><h2>서울공예박물관</h2><p>5곳을 모두 방문했어요.</p><div className="complete-summary"><img src={images.completePhoto} alt="오늘 여행 사진" /><span><em>오늘의 기록</em><strong>서울을 6.8km 걸었어요</strong><small>방문 5곳 · 이동 1시간 12분 · 총 6시간 20분</small></span></div><StatusBanner tone="blue" title="5곳의 방문이 기록됐어요" copy="사진과 이동 기록을 한 번에 확인할 수 있어요." /><div className="complete-record-link"><span><b>{data.record}</b><small>{data.recordCopy}</small></span><i>♟</i></div><div className="complete-actions"><ActionButton onClick={() => go(data.primaryNext)}>{data.primary}</ActionButton><ActionButton tone="secondary" onClick={() => go(data.secondaryNext)}>{data.secondary}</ActionButton></div></BottomSheet></MapStage></section>;
}

function RecordScreen({ screen, go }) {
  if (screen === 'complete') return <CourseComplete go={go} />;
  if (screen === 'record' || screen === 'saved-courses') {
    const saved = screen === 'saved-courses';
    return <section className="phone standard-screen tab-screen record-overview"><main className="page-scroll record-overview-scroll"><h1>{saved ? '저장한 코스' : '오늘의 여행 기록'}</h1><JourneySummary saved={saved} /><ScreenSection title={saved ? '저장한 코스' : '오늘의 코스'}><button type="button" className="journey-map-card" onClick={() => go(saved ? 'route-map' : 'record-detail')}><VWorldMap ariaLabel="안국과 성수를 잇는 코스 지도" interactive={false} style={{ width: '100%', height: 122 }} /><span><strong>안국에서 성수까지, 여름 하루</strong><small>{saved ? '4곳 · 5시간 10분 · 최근 저장' : '5곳 · 6시간 20분 · 오늘'}</small></span></button></ScreenSection>{saved ? <ScreenSection title="빠른 메뉴"><div className="saved-quick-grid"><button type="button" onClick={() => go('saved')}><span>⌖</span><strong>저장한 장소</strong><small>12</small></button><button type="button" onClick={() => go('record')}><span>□</span><strong>완료한 코스</strong><small>2</small></button></div></ScreenSection> : <ScreenSection title="오늘의 기록"><div className="today-record-grid"><article><span>방문 사진</span><b>12</b></article><article><span>남긴 후기</span><b>2</b></article></div></ScreenSection>}</main><BottomNav active="my" onNavigate={(tab) => go(rootRoutes[tab])} /></section>;
  }
  if (screen === 'record-detail') return <section className="phone standard-screen tab-screen record-overview record-detail-v3"><main className="page-scroll record-overview-scroll"><h1>여행 기록 상세</h1><JourneySummary /><ScreenSection title="이동 타임라인"><button type="button" className="journey-map-card" onClick={() => go('active-course')}><VWorldMap ariaLabel="안국과 성수를 잇는 코스 지도" interactive={false} style={{ width: '100%', height: 122 }} /><span><strong>안국에서 성수까지, 여름 하루</strong><small>5곳 · 6시간 20분 · 오늘</small></span></button></ScreenSection><ScreenSection title="오늘의 기록"><div className="today-record-grid"><article><span>방문 사진</span><b>12</b></article><article><span>남긴 후기</span><b>2</b></article></div></ScreenSection></main><BottomNav active="my" onNavigate={(tab) => go(rootRoutes[tab])} /></section>;
  if (screen === 'reviews') return <section className="phone standard-screen reviews-v3"><main className="page-scroll"><div className="reviews-hero"><img src={images.detail} alt="도토리가든" /><div className="detail-controls"><IconButton label="이전" onClick={() => go('place')}>‹</IconButton></div></div><div className="reviews-copy"><p className="eyebrow">안국 · 카페</p><h1>도토리가든</h1><p>매일 10:00-21:00</p><div className="chip-row"><Chip active>지금 여유</Chip><Chip>도보 8분</Chip></div><ScreenSection title="방문자 후기 126"><p className="review-section-lede">사진과 위치가 인증된 후기부터 보여줘요</p><article className="verified-review-card"><p>정원이 생각보다 조용했고 오후 햇빛이 예뻤어요.<br />소금빵은 3시 전에 가는 걸 추천해요.</p><span>유진 · 오늘 · 방문 인증</span><div><button type="button">후기 필터</button><b>최신순</b><small>사진 후기&nbsp; 82</small><small>추천&nbsp; 104</small></div></article></ScreenSection></div></main><div className="sticky-actions split reviews-actions"><ActionButton onClick={() => go('course-conditions')}>코스에 추가</ActionButton><ActionButton tone="secondary" onClick={() => go('write-review')}>후기 남기기</ActionButton></div></section>;
  if (screen === 'review-detail') return <section className="phone standard-screen review-detail-v3"><BackHeader title="방문 인증 후기" onBack={() => go('reviews')} /><main className="page-scroll review-detail-scroll"><p className="eyebrow">추천해요 · 사진 3장</p><h1>오후 햇빛이 정말 예뻤어요</h1><p className="review-author">유진 · 오늘 14:25</p><div className="review-detail-photo"><img src="/assets/figma/intro-visual.png" alt="운현궁 방문 사진" /></div><section className="review-verified-note"><strong>운현궁을 다녀왔어요</strong><span>위치 좌표로 방문이 인증된 후기예요</span></section><p className="review-detail-body">사람이 많지 않아 천천히 보기 좋았어요.<br />처마 쪽에서 찍으면 구도가 예쁘게 나와요.</p><ScreenSection title="후기 정보"><div className="review-info-grid"><article><span>추천</span><b>추천해요</b></article><article><span>방문 당시</span><b>여유</b></article></div></ScreenSection></main><div className="sticky-actions split"><ActionButton onClick={() => go('filming-locations')}>촬영 장면 찾기</ActionButton><ActionButton tone="secondary" onClick={() => go('scene-list')}>장면 보기</ActionButton></div></section>;
  if (screen === 'write-review') return <section className="phone standard-screen write-review-v3"><BackHeader title="후기 작성" onBack={() => go('record')} /><main className="page-scroll write-review-scroll"><p className="eyebrow">운현궁</p><h1>오늘의 장소는 어땠나요?</h1><p className="write-review-lede">경험을 남기면 다음 여행자에게 도움이 돼요.</p><ScreenSection title="평가"><div className="review-setting-list"><button type="button"><span>⌖ 전체 만족도</span><strong>아주 좋았어요&nbsp; ›</strong></button><button type="button"><span>◷ 방문 시간</span><strong>오늘 13:40-14:20&nbsp; ›</strong></button></div></ScreenSection><ScreenSection title="분위기"><div className="review-choice-row"><Chip>한적해요</Chip><Chip active>사진 좋아요</Chip><Chip>혼자 좋아요</Chip></div></ScreenSection><ScreenSection title="후기 내용"><div className="review-content-grid"><button type="button" className="selected"><strong>공간이 차분하고</strong><small>오후 햇빛이 예뻤어요</small></button><button type="button"><strong>사진 추가</strong><small>최대 5장까지 올릴 수 있어요</small></button></div></ScreenSection><ScreenSection title="공개 범위"><div className="review-choice-row"><Chip>전체</Chip><Chip active>팔로워</Chip><Chip>나만 보기</Chip></div></ScreenSection><StatusBanner tone="blue" title="위치와 방문 시간은 자동으로 기록돼요" copy="작성 후에도 수정하거나 삭제할 수 있어요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('reviews')}>후기 등록</ActionButton></div></section>;
  const [title, heading, copy, next] = recordStates[screen];
  const isReviewForm = screen === 'write-review';
  return <section className="phone standard-screen record-screen"><BackHeader title={title} onBack={() => go(screen === 'record' ? 'my' : 'record')} /><main className="page-scroll"><div className="record-cover"><img src={screen === 'reviews' || screen === 'review-detail' ? images.cafe : images.completePhoto} alt="" /></div><div className="record-copy"><p className="eyebrow">2026. 08. 09 · 안국동</p><h1>{heading}</h1><p>{copy}</p>{screen === 'record' && <div className="record-stats"><span><b>4</b> 방문</span><span><b>4.2km</b> 도보</span><span><b>2:18</b> 시간</span></div>}{screen === 'saved-courses' && <div className="saved-course-list"><PlaceRow place={{ name: '안국동 느린 오후', meta: '2시간 30분 · 장소 4곳', image: images.myMap }} onClick={() => go('route-map')} /><PlaceRow place={{ name: '비 온 뒤 서촌', meta: '1시간 40분 · 장소 3곳', image: images.scene }} onClick={() => go('route-map')} /></div>}{isReviewForm && <><div className="rating-row"><span>★</span><span>★</span><span>★</span><span>★</span><span>☆</span></div><label className="field-label">후기<textarea placeholder="좋았던 장소나 기억에 남는 순간을 적어주세요" /></label></>}{screen === 'reviews' && <div className="review-list"><article><b>햇빛 좋은 날에 걷기 좋았어요</b><p>천천히 둘러봐도 2시간이면 충분했고 정원이 특히 좋았습니다.</p><span>유진 · 2026.08.09</span></article><article><b>카페와 궁궐을 함께 보기 좋아요</b><p>동선이 자연스러워서 길을 헤매지 않았어요.</p><span>지민 · 2026.08.06</span></article></div>}<ActionButton onClick={() => go(next)}>{isReviewForm ? '후기 등록하기' : screen === 'reviews' ? '후기 자세히 보기' : screen === 'record-detail' ? '후기 남기기' : '계속 보기'}</ActionButton></div></main></section>;
}

const settingsState = {
  'location-permission': ['위치 권한', '현재 위치를 허용할까요?', '내 주변 장소와 이동 경로를 더 정확하게 안내할 수 있어요.', '허용하기', 'my'],
  notifications: ['알림 설정', '여행 알림', '코스 출발, 장소 혼잡, 저장한 팝업 소식을 받을 수 있어요.', '알림 저장', 'my'],
  'profile-edit': ['계정 정보', '내 프로필', '로그인한 계정의 회원 정보를 확인할 수 있어요.', 'MY로 돌아가기', 'my'],
  privacy: ['개인정보 · 위치 관리', '위치 기록 관리', '방문 확인을 위한 위치 기록을 안전하게 관리할 수 있어요.', '변경사항 저장', 'my'],
  'app-permissions': ['앱 권한', '필요한 순간에만 사용해요', '위치, 카메라, 알림 권한을 직접 관리할 수 있어요.', '설정 열기', 'my'],
  support: ['공지 · 고객 지원', '무엇을 도와드릴까요?', '공지사항, 자주 묻는 질문, 문의하기를 확인할 수 있어요.', '문의하기', 'my'],
  loading: ['불러오는 중', '여행 정보를 준비하고 있어요', '잠시만 기다리면 저장한 장소와 코스를 불러올게요.', '새로고침', 'my'],
  'server-error': ['일시적인 오류', '정보를 불러오지 못했어요', '잠시 후 다시 시도해주세요. 저장된 기록은 안전해요.', '다시 시도', 'my'],
};

function normalizeMemberProfile(value) {
  if (!value || typeof value !== 'object') return null;

  const nickname = typeof value.nickname === 'string' ? value.nickname.trim() : '';
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  const memberId = value.memberId ?? null;
  if (!nickname && !email && memberId === null) return null;

  return { ...value, nickname, email, memberId };
}

function profileInitial(nickname) {
  const initial = Array.from(String(nickname ?? '').trim())[0];
  return initial ? initial.toUpperCase() : '?';
}

function useMyProfile(enabled) {
  const [profile, setProfile] = useState(() => normalizeMemberProfile(getUser()));
  const [status, setStatus] = useState(() => enabled ? 'loading' : 'idle');
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const controller = new AbortController();
    let cancelled = false;
    const cachedProfile = normalizeMemberProfile(getUser());

    setProfile((current) => current ?? cachedProfile);
    setStatus('loading');
    setError('');

    fetchMyProfile({ signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        const nextProfile = normalizeMemberProfile(result);
        if (nextProfile) saveUser(nextProfile);
        setProfile(nextProfile);
        setStatus(nextProfile ? 'success' : 'empty');
      })
      .catch((requestError) => {
        if (cancelled || requestError?.name === 'AbortError') return;

        console.error('회원 정보 조회 실패:', requestError);
        if (requestError?.status === 401) {
          setProfile(null);
          setStatus('unauthorized');
          setError('로그인이 만료됐어요. 다시 로그인하면 회원 정보를 확인할 수 있어요.');
          return;
        }

        setStatus('error');
        setError('회원 정보를 불러오지 못했어요. 네트워크 상태를 확인하고 다시 시도해주세요.');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, retryKey]);

  return {
    profile,
    status,
    error,
    retry: () => setRetryKey((current) => current + 1),
  };
}

function MyProfileStatus({ status, profile, error, onRetry, onLogin }) {
  if (status === 'loading') {
    return <p className="my-profile-status" role="status" aria-live="polite">최신 회원 정보를 확인하고 있어요.</p>;
  }

  if (status === 'error') {
    return <div className="my-profile-feedback" role="alert" aria-live="assertive"><p>{profile ? '최신 회원 정보를 불러오지 못했어요. 저장된 로그인 정보로 표시 중이에요.' : error}</p><button type="button" onClick={onRetry}>다시 시도</button></div>;
  }

  if (status === 'unauthorized') {
    return <div className="my-profile-feedback" role="alert" aria-live="assertive"><p>{error}</p><ActionButton tone="secondary" className="my-profile-login" onClick={onLogin}>로그인하기</ActionButton></div>;
  }

  if (status === 'empty') {
    return <div className="my-profile-feedback" role="status" aria-live="polite"><p>회원 정보를 찾지 못했어요. 다시 로그인하거나 잠시 후 재시도해주세요.</p><div className="my-profile-feedback-actions"><button type="button" onClick={onRetry}>다시 시도</button><button type="button" onClick={onLogin}>로그인하기</button></div></div>;
  }

  return null;
}

function MyScreen({ screen, go }) {
  const profileQuery = useMyProfile(screen === 'my' || screen === 'profile-edit');
  const { profile, status, error, retry } = profileQuery;
  const nickname = profile?.nickname || '';
  const email = profile?.email || '';
  const profileName = nickname || (status === 'loading' ? '프로필 불러오는 중' : '내 프로필');
  const profileEmail = email || (status === 'loading' ? '회원 정보를 확인하고 있어요' : '이메일 정보가 없어요');
  const initial = profileInitial(nickname);
  const roleLabel = profile?.role === 'ROLE_USER' ? '일반 회원' : profile?.role || '정보 없음';
  const goToLogin = () => go('login');

  if (screen === 'location-permission') return <MapPermissionPrompt go={go} title="위치 권한이 필요해요" copy="현재 위치와 도착 감지를 위해 허용해주세요." detail={['앱 사용 중에만 위치 사용', '설정에서 언제든 변경할 수 있어요.']} action="위치 권한 허용" next="map" />;
  if (screen === 'loading') return <MapLoadingPrompt go={go} />;
  if (screen === 'notifications') return <section className="phone standard-screen notifications-v3"><main className="page-scroll notifications-scroll"><header className="settings-page-heading"><p>알림 설정</p><span>여행 중 알림</span><h1>필요한 순간만 알려드릴게요</h1><small>혼잡 · 주변 장소 · 도착 알림을 선택할 수 있어요.</small></header><ScreenSection title="기본 알림"><div className="settings-row-list"><button type="button"><span>혼잡 변화</span><b>대중교통과 장소 혼잡이 높아질 때&nbsp; ›</b></button><button type="button"><span>주변 장소 추천</span><b>동선 근처에 볼거리가 있을 때&nbsp; ›</b></button></div></ScreenSection><ScreenSection title="알림 빈도"><div className="settings-segment"><button type="button">필수만</button><button type="button" className="selected">적당히</button><button type="button">모두</button></div></ScreenSection><ScreenSection title="도착 알림"><div className="settings-segment"><button type="button" className="selected">진동 켜기</button><button type="button">음성 안내</button></div><p className="settings-hint">장소 100m 이내에서 알려드려요</p></ScreenSection><ScreenSection title="방해 금지 시간"><div className="settings-segment"><button type="button">없음</button><button type="button" className="selected">22-08시</button><button type="button">직접 설정</button></div></ScreenSection><p className="settings-bottom-copy">운영시간 변경도 함께 알려드려요<br /><span>알림은 언제든 이 화면에서 바꿀 수 있어요.</span></p></main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>설정 저장</ActionButton></div></section>;
  if (screen === 'profile-edit') return <section className="phone standard-screen profile-edit-v3"><BackHeader title="계정 정보" onBack={() => go('my')} /><main className="page-scroll profile-edit-scroll"><header className="profile-edit-heading"><h1>{nickname ? `${nickname}님의 계정` : status === 'loading' ? '계정 정보를 불러오는 중' : '내 계정'}</h1><span className="profile-edit-account">{profileEmail}</span></header><MyProfileStatus status={status} profile={profile} error={error} onRetry={retry} onLogin={goToLogin} />{profile && <ScreenSection title="회원 정보"><dl className="profile-info-list"><div><dt>닉네임</dt><dd>{nickname || '정보 없음'}</dd></div><div><dt>이메일</dt><dd>{email || '정보 없음'}</dd></div><div><dt>회원 유형</dt><dd>{roleLabel}</dd></div></dl></ScreenSection>} {profile && <StatusBanner tone="blue" title="로그인한 계정의 최신 정보예요" copy="이메일과 닉네임은 로그인한 계정을 기준으로 표시해요." />}</main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>MY로 돌아가기</ActionButton></div></section>;
  if (screen === 'privacy') return <section className="phone standard-screen privacy-v3"><BackHeader title="개인정보·위치 기록" onBack={() => go('my')} /><main className="page-scroll settings-detail-scroll"><header className="settings-page-heading"><p>데이터 관리</p><span>여행 기록</span><h1>내 위치 기록을 관리해요</h1><small>필요한 순간에만 수집하고, 보관 기간을 직접 정할 수 있어요.</small></header><ScreenSection title="위치 기록"><div className="settings-row-list detail-row-list"><button type="button"><span><strong>여행 중 위치 기록</strong><small>코스 진행 중에만 수집</small></span><b className="row-state active">켜짐</b></button><button type="button"><span><strong>사진 좌표 인증</strong><small>방문 인증할 때만 사용</small></span><b className="row-state active">켜짐</b></button></div></ScreenSection><ScreenSection title="보관 기간"><div className="settings-segment"><button type="button">30일</button><button type="button" className="selected">90일</button><button type="button">1년</button></div></ScreenSection><ScreenSection title="공개 설정"><div className="settings-segment"><button type="button" className="selected">나만</button><button type="button">친구</button><button type="button">전체</button></div></ScreenSection><ScreenSection title="기록 다운로드"><div className="settings-row-list detail-row-list"><button type="button"><span><strong>여행 기록 내보내기</strong><small>사진과 이동 기록을 파일로 받아요</small></span><b className="row-chevron">›</b></button><button type="button"><span><strong>전체 위치 기록 삭제</strong><small>삭제하면 되돌릴 수 없어요</small></span><b className="row-danger">삭제</b></button></div></ScreenSection><StatusBanner tone="blue" title="위치 기록은 추천과 도착 감지에만 사용해요" copy="설정 변경은 현재 진행 중인 코스부터 적용돼요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>변경사항 저장</ActionButton></div></section>;
  if (screen === 'app-permissions') return <section className="phone standard-screen permissions-v3"><BackHeader title="앱 권한 설정" onBack={() => go('my')} /><main className="page-scroll settings-detail-scroll"><header className="settings-page-heading"><p>권한 관리</p><span>기능별 설정</span><h1>필요한 순간에만 사용해요</h1><small>각 권한은 여행 기능에 맞춰 언제든 바꿀 수 있어요.</small></header><ScreenSection title="현재 권한"><div className="settings-row-list detail-row-list"><button type="button"><span><strong>위치</strong><small>길 안내와 도착 감지</small></span><b className="row-state active">허용됨</b></button><button type="button"><span><strong>카메라</strong><small>촬영지 구도 맞추기</small></span><b className="row-state">허용 안 함</b></button><button type="button"><span><strong>알림</strong><small>혼잡 변화와 도착 안내</small></span><b className="row-state active">허용됨</b></button><button type="button"><span><strong>사진</strong><small>방문 인증 사진 저장</small></span><b className="row-state">선택 안 함</b></button></div></ScreenSection><ScreenSection title="권한 사용 방식"><div className="permission-note-grid"><article><strong>위치</strong><span>코스 시작부터 종료까지</span></article><article><strong>카메라</strong><span>촬영 화면을 열었을 때만</span></article></div></ScreenSection><StatusBanner tone="blue" title="권한이 없어도 장소 탐색은 계속할 수 있어요" copy="권한이 필요한 기능을 누르면 다시 요청할게요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>시스템 설정 열기</ActionButton></div></section>;
  if (screen === 'support') return <section className="phone standard-screen support-v3"><BackHeader title="공지·문의" onBack={() => go('my')} /><main className="page-scroll support-scroll"><header className="support-heading"><span>?</span><p>고객센터</p><h1>무엇을 도와드릴까요?</h1><small>공지와 자주 묻는 질문을 빠르게 확인할 수 있어요.</small></header><div className="support-stats"><button type="button"><strong>2</strong><span>공지</span></button><button type="button"><strong>24</strong><span>FAQ</span></button><button type="button"><strong>1:1</strong><span>문의</span></button></div><ScreenSection title="최근 공지" action="전체보기"><button type="button" className="support-notice-card"><span><b>서비스 안내</b><small>2026.08.08</small></span><strong>촬영지 이미지 제공 정책 안내</strong><p>장면 이미지와 현장 정보의 출처를 더 투명하게 표시해요.</p><i>›</i></button></ScreenSection><ScreenSection title="빠른 도움"><div className="support-help-list"><button type="button"><span><strong>코스가 멈췄어요</strong><small>이동 중 문제가 생겼을 때</small></span><i>›</i></button><button type="button"><span><strong>장소 정보가 달라요</strong><small>운영시간과 위치를 알려주세요</small></span><i>›</i></button><button type="button"><span><strong>내 기록을 찾고 싶어요</strong><small>저장한 코스와 사진 확인</small></span><i>›</i></button></div></ScreenSection><p className="support-footnote">평일 10:00-18:00에 순서대로 답변드려요.</p></main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>1:1 문의하기</ActionButton></div></section>;
  if (screen === 'server-error') return <section className="phone server-error-v3"><MapStage variant="home"><div className="map-top-fade" /><header className="server-map-heading"><p>안국동 · 내 주변</p><h1>오늘, 어디로 걸어볼까요?</h1><button type="button"><span><SearchIcon /></span>장소 · 지역 · 테마 검색</button><div><Chip active>전체</Chip><Chip>요즘</Chip><Chip>팝업</Chip><Chip>촬영지</Chip></div></header><div className="server-error-dim" /><BottomSheet className="server-error-sheet"><button className="server-error-close" type="button" onClick={() => go('map')} aria-label="닫기">×</button><h1>정보를 불러오지 못했어요</h1><p>서버 연결이 원활하지 않아 최신 정보를 표시할 수 없어요.</p><ActionButton tone="secondary" onClick={() => go('my')}>마지막으로 저장된 정보 보기</ActionButton><small>잠시 후 다시 시도하면 정상적으로 연결될 수 있어요.</small><ActionButton onClick={() => go('map')}>다시 시도</ActionButton></BottomSheet></MapStage></section>;
  if (screen !== 'my') {
    const [title, heading, copy, action, next] = settingsState[screen];
    const isLoading = screen === 'loading';
    return <section className="phone standard-screen system-screen"><BackHeader title={title} onBack={() => go('my')} /><main className="page-scroll centered-state">{isLoading ? <BrandLoading /> : <div className={`system-icon ${screen === 'server-error' ? 'error' : ''}`}>{screen === 'location-permission' ? '⌖' : '⚙'}</div>}<h1>{heading}</h1><p>{copy}</p>{screen === 'notifications' && <div className="switch-list"><label>코스 출발 <input type="checkbox" defaultChecked /></label><label>현장 혼잡 <input type="checkbox" defaultChecked /></label><label>새로운 팝업 <input type="checkbox" /></label></div>}{screen === 'privacy' && <div className="switch-list"><label>방문 기록 저장 <input type="checkbox" defaultChecked /></label><label>정확한 위치 사용 <input type="checkbox" defaultChecked /></label></div>}{screen === 'app-permissions' && <div className="permission-rows"><p><span>위치</span><b>허용됨</b></p><p><span>카메라</span><b>허용 안 함</b></p><p><span>알림</span><b>허용됨</b></p></div>}{screen === 'support' && <div className="support-list"><button type="button">공지사항 <span>›</span></button><button type="button">자주 묻는 질문 <span>›</span></button><button type="button">문의 내역 <span>›</span></button></div>}<ActionButton onClick={() => go(next)}>{action}</ActionButton></main></section>;
  }
  return <section className="phone standard-screen tab-screen my-screen"><main className="page-scroll my-scroll" aria-labelledby="my-page-title"><header className="my-title"><h1 id="my-page-title">MY</h1></header><section className="profile-hero" aria-labelledby="my-profile-heading" aria-busy={status === 'loading'}><div className="profile-row"><span className="avatar" aria-hidden="true">{initial}</span><div className="profile-identity"><h2 id="my-profile-heading">{profileName}</h2><p className="profile-email" title={email || undefined}>{profileEmail}</p></div>{profile && <button type="button" className="profile-edit-link" onClick={() => go('profile-edit')} aria-label="계정 정보 보기">정보<ChevronRight aria-hidden="true" size={16} strokeWidth={2} /></button>}</div><MyProfileStatus status={status} profile={profile} error={error} onRetry={retry} onLogin={goToLogin} /></section><ScreenSection title="빠른 이동"><div className="my-grid"><button type="button" onClick={() => go('map')}><span className="my-grid-icon"><MapPin aria-hidden="true" size={22} strokeWidth={1.9} /></span><strong>지도에서 장소 찾기</strong><small>서울의 장소와 현재 정보를 둘러봐요</small></button><button type="button" onClick={() => go('explore')}><span className="my-grid-icon"><Search aria-hidden="true" size={22} strokeWidth={1.9} /></span><strong>탐색 둘러보기</strong><small>촬영지와 이번 주 소식을 확인해요</small></button></div></ScreenSection><ScreenSection title="설정"><div className="my-menu-list"><button type="button" onClick={() => go('profile-edit')}><span>계정 정보</span><ChevronRight aria-hidden="true" size={18} strokeWidth={1.9} /></button><button type="button" onClick={() => go('notifications')}><span>알림 설정</span><ChevronRight aria-hidden="true" size={18} strokeWidth={1.9} /></button><button type="button" onClick={() => go('privacy')}><span>개인정보 · 위치 관리</span><ChevronRight aria-hidden="true" size={18} strokeWidth={1.9} /></button><button type="button" onClick={() => go('support')}><span>공지 · 고객 지원</span><ChevronRight aria-hidden="true" size={18} strokeWidth={1.9} /></button></div></ScreenSection></main><BottomNav active="my" onNavigate={(tab) => go(rootRoutes[tab])} /></section>;
}

function AppScreenFrame({ basketCount, children, go, hideHeader = false }) {
  return (
    <div className="screen-frame">
      {!hideHeader && <AppHeader basketCount={basketCount} onHome={() => go('map')} onBasket={() => go('basket')} onLiveTalk={() => go('live-talk')} />}
      <div className={`screen-frame-content${hideHeader ? '' : ' with-app-header'}`}>{children}</div>
    </div>
  );
}

function RenderScreen({ screen, id, go, basketState, courseFlow, onBasketAdded, onBasketItemRemoved, onBasketRetry, onAuthRequired, onLoginSuccess }) {
  let renderedScreen;
  if (routeGroups.auth.includes(screen)) renderedScreen = <AuthScreen screen={screen} go={go} onLoginSuccess={onLoginSuccess} />;
  else if (screen === 'map') renderedScreen = <MapHome go={go} basketState={basketState} onBasketAdded={onBasketAdded} onBasketRefresh={onBasketRetry} onAuthRequired={onAuthRequired} />;
  else if (screen === 'explore') renderedScreen = <ExploreScreen go={go} />;
  else if (screen === 'place') renderedScreen = <PlaceDetail go={go} placeId={id} basketState={basketState} onBasketAdded={onBasketAdded} onBasketRefresh={onBasketRetry} onAuthRequired={onAuthRequired} />;
  else if (screen === 'event-detail') renderedScreen = <EventDetail go={go} eventId={id} basketState={basketState} onBasketAdded={onBasketAdded} onBasketRefresh={onBasketRetry} onAuthRequired={onAuthRequired} />;
  else if (screen === 'search' || screen === 'search-empty') renderedScreen = <SearchResults screen={screen} go={go} />;
  else if (screen === 'saved') renderedScreen = <SavedConfirmation go={go} />;
  else if (screen === 'trending' || screen === 'filming-locations' || screen === 'popups') renderedScreen = <CollectionScreen screen={screen} go={go} />;
  else if (screen === 'ai-guide') renderedScreen = <AiGuide go={go} />;
  else if (screen === 'live-talk') renderedScreen = <LiveTalk />;
  else if (screen === 'course-home') renderedScreen = <CourseHome go={go} onNavigate={(tab) => go(rootRoutes[tab])} onAuthRequired={onAuthRequired} basketState={basketState} onBasketAdded={onBasketAdded} onBasketRefresh={onBasketRetry} />;
  else if (screen === 'course-conditions') renderedScreen = <CourseConditions go={go} draft={courseFlow.draft} basketState={basketState} onContinue={courseFlow.continueFromConditions} />;
  else if (screen === 'course-place-times') renderedScreen = <CoursePlaceTimes go={go} basketState={basketState} settings={courseFlow.settings} onSettingsChange={courseFlow.updateStopSetting} onSubmit={courseFlow.submit} previewStatus={courseFlow.preview.status} onRetry={onBasketRetry} onAuthRequired={onAuthRequired} />;
  else if (screen === 'basket' || screen === 'basket-natural' || screen === 'basket-glass') renderedScreen = <CourseBasket screen={screen} go={go} basketState={basketState} onItemRemoved={onBasketItemRemoved} onRetry={onBasketRetry} onAuthRequired={onAuthRequired} />;
  else if (screen === 'compare' || screen === 'route-map') renderedScreen = <CourseCompare screen={screen} go={go} coursePreview={courseFlow.preview} courseDraft={courseFlow.draft} onConfirm={courseFlow.confirm} confirmState={courseFlow.mutation} />;
  else if (screen === 'saved-course-preview') renderedScreen = <SavedCourseScreen courseId={id} go={go} onAuthRequired={onAuthRequired} />;
  else if (screen === 'active-course' && id) renderedScreen = <SavedCourseScreen courseId={id} go={go} onAuthRequired={onAuthRequired} active />;
  else if (routeGroups.travel.includes(screen)) renderedScreen = <TravelScreen screen={screen} go={go} />;
  else if (screen === 'nearby-filming') renderedScreen = <NearbyFilmingScreen placeId={id} go={go} />;
  else if (routeGroups.filming.includes(screen)) renderedScreen = <FilmingScreen screen={screen} go={go} id={id} />;
  else if (routeGroups.record.includes(screen)) renderedScreen = <RecordScreen screen={screen} go={go} />;
  else renderedScreen = <MyScreen screen={screen} go={go} />;

  return <AppScreenFrame basketCount={basketState.items.length} go={go} hideHeader={screen === 'place' || screen === 'filming-work' || screen === 'event-detail' || screen === 'camera' || screen === 'shot-result' || screen === 'active-course'}>{renderedScreen}</AppScreenFrame>;
}

export default function ProductFlow() {
  const [{ screen, id }, setRoute] = useState(readHash);
  const [basketState, setBasketState] = useState({ items: [], status: getAccessToken() ? 'loading' : 'logged-out' });
  const [basketRefreshKey, setBasketRefreshKey] = useState(0);
  const basketMutationVersionRef = useRef(0);
  const basketRequestIdRef = useRef(0);
  const [courseDraft, setCourseDraft] = useState(null);
  const [courseStopSettings, setCourseStopSettings] = useState([]);
  const [courseMutation, setCourseMutation] = useState({ status: 'idle', error: null });
  const reduceMotion = useReducedMotion();
  const coursePreview = useCoursePreview({
    onAuthRequired: () => handleAuthRequired({ screen: 'course-place-times' }),
  });
  const basketItemKey = basketState.items.map((item) => item.id).join('|');

  useEffect(() => {
    const handleHashChange = () => setRoute(readHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const requestId = basketRequestIdRef.current + 1;
    basketRequestIdRef.current = requestId;
    if (!getAccessToken()) {
      setBasketState({ items: [], status: 'logged-out' });
      return undefined;
    }

    const controller = new AbortController();
    const mutationVersion = basketMutationVersionRef.current;
    const isCurrentRequest = () => !controller.signal.aborted && basketRequestIdRef.current === requestId;
    const reloadAfterMutation = () => setBasketRefreshKey((key) => key + 1);
    setBasketState((current) => current.status === 'success' ? current : { items: current.items, status: 'loading' });
    fetchCourseBasketPlaces({ signal: controller.signal })
      .then((items) => {
        if (!isCurrentRequest()) return;
        if (basketMutationVersionRef.current !== mutationVersion) {
          reloadAfterMutation();
          return;
        }
        setBasketState({ items: mergeBasketItems([], Array.isArray(items) ? items : []), status: 'success' });
      })
      .catch((error) => {
        if (error?.name === 'AbortError' || !isCurrentRequest()) return;
        if (error?.status === 401) {
          setBasketState({ items: [], status: 'logged-out' });
          return;
        }
        if (basketMutationVersionRef.current !== mutationVersion) {
          reloadAfterMutation();
          return;
        }
        setBasketState({ items: [], status: 'error' });
      });
    return () => controller.abort();
  }, [screen, basketRefreshKey]);

  useEffect(() => {
    if (basketState.status !== 'success') return;
    setCourseStopSettings((current) => reconcileCourseStopSettings(basketState.items, current));
    coursePreview.reset();
  }, [basketItemKey]);

  const go = useCallback((next, nextId, options = {}) => {
    if (screen === 'write-review' && next === 'record') {
      const returnHash = window.sessionStorage.getItem('ddemachim.review-return-hash');
      if (returnHash?.startsWith('#/')) {
        window.sessionStorage.removeItem('ddemachim.review-return-hash');
        window.location.hash = returnHash;
        return;
      }
    }
    if (next === 'write-review') window.sessionStorage.setItem('ddemachim.review-return-hash', window.location.hash);
    if (next === 'scene-detail' && screen === 'place' && id) {
      window.sessionStorage.setItem('ddemachim.scene-return-place-id', String(id));
    }
    if (screen === 'camera' && next === 'scene-detail') {
      const placeId = window.sessionStorage.getItem('ddemachim.scene-return-place-id');
      if (placeId && /^\d+$/.test(placeId)) {
        next = 'place';
        nextId = placeId;
      }
    }
    if (!routes.has(next)) return;
    const sceneTarget = createSceneNavigationTarget(next, nextId);
    if (['scene-detail', 'camera', 'shot-result'].includes(next) && !sceneTarget) return;
    const targetId = sceneTarget?.id ?? nextId ?? null;
    const nextHash = sceneTarget?.hash ?? (targetId ? `#/${next}/${targetId}` : `#/${next}`);
    if (options.replace) window.history.replaceState(null, '', nextHash);
    else window.location.hash = nextHash;
    setRoute({ screen: next, id: targetId });
  }, [screen]);

  const handleBasketAdded = (item) => {
    basketMutationVersionRef.current += 1;
    setBasketState((current) => ({ items: mergeBasketItem(current.items, item), status: 'success' }));
  };

  const handleBasketItemRemoved = (basketItemId) => {
    basketMutationVersionRef.current += 1;
    setBasketState((current) => ({ items: current.items.filter((item) => item.id !== basketItemId), status: 'success' }));
  };

  const continueFromConditions = (draft) => {
    setCourseDraft(draft);
    setCourseMutation({ status: 'idle', error: null });
    coursePreview.reset();
    go('course-place-times');
  };

  const updateStopSetting = (basketItemId, patch) => {
    setCourseStopSettings((current) => updateCourseStopSetting(current, basketItemId, patch));
    coursePreview.reset();
  };

  const submitCoursePreview = () => {
    const payload = buildCoursePreviewRequest(courseDraft, buildCoursePreviewPlaces(courseStopSettings));
    coursePreview.submit(payload);
    go('compare');
  };

  const handleAuthRequired = (returnRoute = { screen, id }) => {
    storeAuthReturnRoute(returnRoute);
    clearAuth();
    setBasketState({ items: [], status: 'logged-out' });
    go('login');
  };

  const handleLoginSuccess = () => {
    const returnRoute = consumeAuthReturnRoute();
    setBasketState({ items: [], status: 'loading' });
    setBasketRefreshKey((key) => key + 1);
    if (returnRoute && routes.has(returnRoute.screen)) go(returnRoute.screen, returnRoute.id);
    else go('map');
  };

  const confirmCourse = async (selection, replaceActive = false) => {
    if (courseMutation.status === 'loading' && !replaceActive) return;
    const shouldReplaceActive = replaceActive || courseMutation.status === 'replace-active';
    setCourseMutation({ status: 'loading', error: null });
    const previewRequest = buildCoursePreviewRequest(courseDraft, buildCoursePreviewPlaces(courseStopSettings));

    try {
      const detail = await createCourse({
        previewRequest,
        strategy: selection.strategy,
        routeSelections: selection.routeSelections,
        startTiming: courseDraft?.startTiming || 'SCHEDULED',
        replaceActive: shouldReplaceActive,
      });
      basketMutationVersionRef.current += 1;
      setBasketState({ items: [], status: 'success' });
      setCourseStopSettings([]);
      setCourseMutation({ status: 'idle', error: null });
      if (courseDraft?.startTiming === 'NOW') go('active-course', detail?.id);
      else go('course-home');
    } catch (error) {
      if (error?.status === 401) {
        handleAuthRequired({ screen: 'compare' });
        return;
      }
      if (error?.code === 'COURSE4091') {
        setCourseMutation({
          status: 'replace-active',
          error: '진행 중인 코스가 있어요. 아래 버튼을 한 번 더 누르면 기존 코스를 종료하고 이 코스를 시작해요.',
        });
        return;
      }
      setCourseMutation({ status: 'error', error: error?.message || '코스를 저장하지 못했어요. 다시 시도해주세요.' });
    }
  };

  const isImmersiveCameraRoute = screen === 'camera' || screen === 'shot-result';
  const pageMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, transition: { duration: 0 } }
    : isImmersiveCameraRoute
      ? sceneRouteMotion(screen, false)
    : {
        initial: { opacity: 0, transform: 'perspective(1300px) translateY(18px) rotateX(3deg) rotateY(-1.5deg) translateZ(-22px) scale(.985)' },
        animate: { opacity: 1, transform: 'perspective(1300px) translateY(0px) rotateX(0deg) rotateY(0deg) translateZ(0px) scale(1)' },
        transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] },
      };

  const courseFlow = {
    draft: courseDraft,
    settings: courseStopSettings,
    preview: coursePreview,
    continueFromConditions,
    updateStopSetting,
    submit: submitCoursePreview,
    confirm: confirmCourse,
    mutation: courseMutation,
  };

  const screenMotionKey = Object.values(rootRoutes).includes(screen) ? 'root-tab' : screen;
  return <main className="app-shell"><SceneCameraProvider screen={screen} routeId={id}><motion.div className="screen-transition" data-screen={screen} key={screenMotionKey} {...pageMotion}><RenderScreen screen={screen} id={id} go={go} basketState={basketState} courseFlow={courseFlow} onBasketAdded={handleBasketAdded} onBasketItemRemoved={handleBasketItemRemoved} onBasketRetry={() => setBasketRefreshKey((key) => key + 1)} onAuthRequired={handleAuthRequired} onLoginSuccess={handleLoginSuccess} /></motion.div></SceneCameraProvider></main>;
}
