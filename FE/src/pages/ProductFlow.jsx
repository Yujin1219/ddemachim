import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useDragControls, useReducedMotion } from 'motion/react';
import { CalendarDays, ChevronLeft, ChevronRight, CircleDollarSign, CircleHelp, Clapperboard, Clock3, ExternalLink, Heart, Image as ImageIcon, LocateFixed, MapPin, MoreHorizontal, RefreshCw, Search, SearchX, SendHorizontal, X } from 'lucide-react';
import AppHeader from '../components/AppHeader';
import BottomNav from '../components/BottomNav';
import VWorldMap from '../components/VWorldMap';
import {
  fetchEvent,
  fetchEvents,
  fetchFilmingWorks,
  fetchMapPlaces,
  fetchMediaContent,
  fetchMediaContents,
  fetchMediaFilmingLocations,
  fetchPlace,
  fetchPlaceFilmingLocations,
  fetchPlaces,
} from '../api/client';
import {
  ArrivalMotion,
  BrandLoading,
  CameraGuide,
  CrowdMotion,
  MapPlacePulse,
  NearbyMotion,
  RouteMotion,
} from '../components/MotionAssets';
import ScrollOnboarding from '../components/ScrollOnboarding';

const routeGroups = {
  auth: ['splash', 'intro', 'login', 'signup', 'onboarding', 'onboarding-schedule', 'onboarding-permissions'],
  discovery: ['map', 'explore', 'place', 'event-detail', 'search', 'search-empty', 'saved', 'trending', 'filming-locations', 'popups', 'live-talk'],
  course: ['course-conditions', 'basket', 'basket-natural', 'basket-glass', 'compare', 'route-map'],
  travel: ['progress', 'arrival', 'navigation', 'reroute', 'reroute-applied', 'transit', 'taxi', 'nearby', 'nearby-added', 'nearby-arrival', 'active-course', 'next-stop', 'gps-error', 'taxi-handoff', 'offline', 'closed-place', 'stop-course'],
  filming: ['onsite', 'filming-work', 'filming-content', 'camera', 'scene-list', 'scene-detail', 'camera-permission', 'shot-result', 'photo-saved', 'image-missing', 'filming-restricted', 'report'],
  record: ['complete', 'record', 'saved-courses', 'record-detail', 'write-review', 'reviews', 'review-detail'],
  my: ['my', 'location-permission', 'notifications', 'profile-edit', 'privacy', 'app-permissions', 'support', 'loading', 'server-error'],
};

const routes = new Set(Object.values(routeGroups).flat());
const rootRoutes = { map: 'map', explore: 'explore', course: 'course-conditions', my: 'my' };
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

function SearchIcon() {
  return <Search aria-hidden="true" size={20} strokeWidth={2} />;
}

const locationRows = [
  { name: '도토리가든', meta: '안국 · 정원 사진이 요즘 인기', image: images.cafe, badge: '요즘 핫한 장소' },
  { name: '창덕궁 후원', meta: '종로 · 도깨비 촬영지', image: images.popup, badge: '도깨비 촬영지' },
  { name: '운현궁', meta: '안국 · 관람 약 20분', image: images.onsite, badge: '지금 여유' },
];

const CURATED_TRENDING_PLACES = [
  { id: 'curated-dotori', name: '도토리가든', meta: '큐레이션 준비 중 · 요즘 핫한 장소', image: images.cafe, badge: '큐레이션 예정' },
  { id: 'curated-bagel', name: '런던베이글뮤지엄', meta: '큐레이션 준비 중 · 안국 인기 장소', image: images.mapPlace, badge: '큐레이션 예정' },
  { id: 'curated-unhyeongung', name: '운현궁', meta: '큐레이션 준비 중 · 종로 산책 코스', image: images.onsite, badge: '큐레이션 예정' },
];

function readHash() {
  const [candidate, hashId] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { screen: routes.has(candidate) ? candidate : 'map', id: hashId || null };
}

/** place/media 응답을 카드·행 컴포넌트가 쓰는 { name, meta, image, badge } 모양으로 바꾼다. */
function placeToCardProps(place) {
  return {
    id: place.id,
    name: place.name,
    meta: [place.categoryLabel, place.roadAddress].filter(Boolean).join(' · '),
    image: place.thumbnailUrl || images.cafe,
    badge: place.categoryLabel,
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
    image: place.thumbnailUrl || images.popup,
    hasThumbnail: Boolean(place.thumbnailUrl),
    badge: contextLabel,
    labels: { content: contentLabel, category: place.categoryLabel },
    meta: place.roadAddress || place.district,
    addressLabel: place.roadAddress || place.district || null,
    filmingWorkCount: filmingWorkCount(place),
  };
}

const TMDB_POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w342';

function tmdbPosterUrl(posterPath) {
  if (!posterPath) return null;
  if (/^https?:\/\//i.test(posterPath)) return posterPath;
  return `${TMDB_POSTER_BASE_URL}/${String(posterPath).replace(/^\/+/, '')}`;
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
  if (currentDate === startDate && startTime && currentTime < startTime) return '예정';

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
  if (start && end && start !== end) return `${start}–${end}`;
  return start || end || null;
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

function HorizontalInfiniteCards({ items, hasMore, isLoading, onLoadMore, onCardClick, emptyLabel }) {
  const scrollerRef = useRef(null);
  const requestedAtEndRef = useRef(false);
  const didResetInitialScrollRef = useRef(false);
  const hasUserScrollIntentRef = useRef(false);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  }, []);

  useEffect(() => {
    if (!items.length || didResetInitialScrollRef.current) return undefined;
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    didResetInitialScrollRef.current = true;
    requestedAtEndRef.current = false;
    hasUserScrollIntentRef.current = false;
    scroller.scrollLeft = 0;
    const frameId = window.requestAnimationFrame(() => {
      scroller.scrollLeft = 0;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [items.length]);

  const markUserScrollIntent = () => {
    hasUserScrollIntentRef.current = true;
  };

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller || !hasMore || isLoading || !hasUserScrollIntentRef.current) return;
    const distanceToEnd = scroller.scrollWidth - scroller.scrollLeft - scroller.clientWidth;
    if (distanceToEnd > 220) {
      requestedAtEndRef.current = false;
      return;
    }
    if (scroller.scrollLeft <= 0 || requestedAtEndRef.current) return;
    requestedAtEndRef.current = true;
    onLoadMore();
  };

  useEffect(() => {
    requestedAtEndRef.current = false;
  }, [items.length]);

  return (
    <div
      className="horizontal-cards"
      ref={scrollerRef}
      onKeyDown={markUserScrollIntent}
      onPointerDown={markUserScrollIntent}
      onScroll={handleScroll}
      onTouchStart={markUserScrollIntent}
      onWheel={markUserScrollIntent}
    >
      {items.map((item, index) => (
        <PlaceCard place={item} index={index} key={item.id ?? `${item.name}-${index}`} onClick={() => onCardClick(item)} />
      ))}
      {!items.length && !isLoading && <p className="explore-inline-state">{emptyLabel}</p>}
      {hasMore && <span className="horizontal-load-sentinel" aria-hidden="true" />}
      {isLoading && <span className="horizontal-loading-card" aria-label="목록 불러오는 중" />}
    </div>
  );
}

function ActionButton({ children, onClick, tone = 'primary', disabled = false, className = '' }) {
  return <button className={`ui-button ${tone} ${className}`} disabled={disabled} onClick={onClick} type="button">{children}</button>;
}

function IconButton({ label, children, onClick, className = '' }) {
  const icons = { 이전: ChevronLeft, 더보기: MoreHorizontal, 저장: Heart, 저장됨: Heart, 닫기: X, 도움말: CircleHelp };
  const Icon = icons[label];
  const isSaved = label === '저장됨';
  return <button className={`icon-button ${className}`} onClick={onClick} type="button" aria-label={label} title={label}>{Icon ? <Icon aria-hidden="true" size={20} strokeWidth={2} fill={isSaved ? 'currentColor' : 'none'} /> : children}</button>;
}

function BackHeader({ title, onBack, action, actionLabel = '더보기' }) {
  return <header className="screen-header">
    <IconButton label="이전" onClick={onBack}>‹</IconButton>
    <h1>{title}</h1>
    {action ? <IconButton label={actionLabel} onClick={action}>•••</IconButton> : <span className="header-space" />}
  </header>;
}

function SearchField({ value, onChange, onSubmit, placeholder, autoFocus = false }) {
  return (
    <form className="search-field" onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <span className="search-field-icon"><SearchIcon /></span>
      <input aria-label={placeholder} autoFocus={autoFocus} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
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

function PlaceRow({ place, onClick, action, onAction }) {
  const media = place.image === images.myMap
    ? <VWorldMap ariaLabel={`${place.name} 코스 지도`} interactive={false} style={{ width: 64, height: 64, flex: '0 0 auto', borderRadius: 12, overflow: 'hidden' }} />
    : <img src={place.image} alt="" loading="lazy" decoding="async" />;
  const content = <>{media}<div className="place-row-copy">{place.labels ? <div className="place-row-labels"><span>{place.labels.content}</span>{place.labels.category && <span>{place.labels.category}</span>}</div> : place.badge && <span className="small-badge">{place.badge}</span>}<h3>{place.name}</h3><p>{place.meta}</p></div></>;
  if (onClick && !action) return <button className="place-row" onClick={onClick} type="button">{content}<ChevronRight className="row-next" aria-hidden="true" size={20} /></button>;
  return <article className="place-row">{content}{action ? <button className="row-action" onClick={onAction} type="button">{action}</button> : <ChevronRight className="row-next" aria-hidden="true" size={20} />}</article>;
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
  const timeLabel = String(event.eventTime ?? '').trim();
  const venueLabel = eventVenueLabel(event);
  const decisionLabels = eventDecisionLabels(event);
  const accessibleLabel = [eventStatusLabel(event), event.name, [dateLabel, timeLabel].filter(Boolean).join(' · '), venueLabel, ...decisionLabels].join(' · ');

  return (
    <button className="event-list-item" type="button" onClick={onClick} aria-label={`${accessibleLabel} 상세 보기`}>
      <span className="event-list-copy">
        <span className={`event-status-label event-status-${currentEventState(event) === '진행 중' ? 'active' : currentEventState(event) === '종료' ? 'ended' : 'upcoming'}`}>{eventStatusLabel(event)}</span>
        <strong className="event-list-title">{event.name}</strong>
        <span className="event-list-schedule">
          <span><CalendarDays aria-hidden="true" size={15} strokeWidth={1.9} /><small>일정</small><b>{dateLabel}</b></span>
          {timeLabel && <span><Clock3 aria-hidden="true" size={15} strokeWidth={1.9} /><small>시간</small><b>{timeLabel}</b></span>}
        </span>
        <span className="event-list-venue"><MapPin aria-hidden="true" size={15} strokeWidth={1.9} /><span>{venueLabel}</span></span>
        {decisionLabels.length > 0 && <span className="event-decision-labels">{decisionLabels.map((label) => <span key={label}>{label}</span>)}</span>}
      </span>
      <span className="event-list-media"><EventImage event={event} /></span>
    </button>
  );
}

function PlaceCard({ place, onClick, index = 0 }) {
  const entryTilt = index % 2 ? 'rotateY(2.5deg)' : 'rotateY(-2.5deg)';
  const hoverTilt = index % 2 ? 'rotateY(-1.2deg)' : 'rotateY(1.2deg)';

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
      <div className="place-card-image">{place.image === images.myMap ? <VWorldMap ariaLabel={`${place.name} 코스 지도`} interactive={false} style={{ width: '100%', height: '100%' }} /> : place.isEvent ? <EventImage event={place} /> : <img src={place.image} alt="" loading="lazy" decoding="async" />}</div>
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

function DetailHeroControls({ onBack, onSave, saveLabel = '저장' }) {
  return (
    <div className="detail-controls">
      <IconButton label="이전" onClick={onBack}><ChevronLeft aria-hidden="true" size={20} strokeWidth={2} /></IconButton>
      <IconButton label={saveLabel} onClick={onSave}><Heart aria-hidden="true" size={19} strokeWidth={2} /></IconButton>
    </div>
  );
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

function AuthScreen({ screen, go }) {
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
    const isSignup = screen === 'signup';
    return <section className="phone standard-screen auth-form-screen"><main className="page-scroll form-scroll auth-form-scroll"><IconButton label="이전" className="auth-back" onClick={() => go('intro')}>‹</IconButton><div className="form-heading"><h2>{isSignup ? '때마침을 시작해볼까요?' : '다시 만나서 반가워요'}</h2><p>{isSignup ? '가입 후 관심 장소와 알림을 설정할 수 있어요.' : '저장한 코스와 여행 기록을 이어서 확인하세요.'}</p></div><label className="field-label">이메일<input type="email" placeholder="이메일을 입력해주세요" /></label><label className="field-label">비밀번호<input type="password" placeholder={isSignup ? '8자 이상 입력해주세요' : '비밀번호를 입력해주세요'} /></label>{!isSignup && <button type="button" className="forgot-password">비밀번호 찾기</button>}{isSignup && <><label className="field-label">닉네임<input placeholder="사용할 닉네임을 입력해주세요" /></label><label className="check-row all-check"><input type="checkbox" /> 전체 동의</label><label className="check-row"><input type="checkbox" /> [필수] 이용약관 및 개인정보처리방침</label><label className="check-row"><input type="checkbox" /> [선택] 장소 추천과 이벤트 알림</label></>}<ActionButton onClick={() => go(isSignup ? 'onboarding' : 'map')}>{isSignup ? '회원가입' : '로그인'}</ActionButton>{!isSignup && <><div className="divider-text"><span />또는<span /></div><div className="social-actions"><ActionButton className="auth-kakao" onClick={() => go('map')}>카카오로 계속하기</ActionButton><ActionButton tone="secondary" onClick={() => go('map')}>Apple로 계속하기</ActionButton></div></>}<p className="form-foot">{isSignup ? '이미 계정이 있나요?' : '계정이 없나요?'} <button onClick={() => go(isSignup ? 'login' : 'signup')} type="button">{isSignup ? '로그인' : '회원가입'}</button></p></main></section>;
  }
  const step = screen === 'onboarding' ? 1 : screen === 'onboarding-schedule' ? 2 : 3;
  const goNext = () => go(screen === 'onboarding' ? 'onboarding-schedule' : screen === 'onboarding-schedule' ? 'onboarding-permissions' : 'map');
  return <section className="phone standard-screen onboarding-screen onboarding-v3"><main className="page-scroll onboarding-scroll"><div className="onboarding-progress"><strong>{step} / 3</strong><span><i style={{ transform: `scaleX(${step / 3})` }} /></span></div>{screen === 'onboarding' && <><div className="onboarding-copy"><h1>어떤 장소를 좋아하세요?</h1><p>관심 있는 테마를 고르면 첫 코스를 더 잘 추천할 수 있어요.</p></div><div className="onboarding-topic-list">{[['촬영지', '영화와 드라마 속 장면'], ['요즘 뜨는 곳', '저장과 사진 반응이 빠른 장소'], ['팝업·전시', '이번 주에만 만날 수 있는 공간'], ['골목·산책', '천천히 걷기 좋은 서울의 길'], ['카페·디저트', '메뉴와 공간이 함께 좋은 곳']].map(([name, copy]) => { const selected = themes.includes(name); return <button type="button" className={selected ? 'selected' : ''} key={name} onClick={() => setThemes((current) => selected ? current.filter((item) => item !== name) : [...current, name])}><i /><span><strong>{name}</strong><small>{copy}</small></span></button>; })}</div></>}{screen === 'onboarding-schedule' && <><div className="onboarding-copy"><h1>오늘 여행은 어떤 느낌이 좋아요?</h1><p>일정 밀도와 사용할 수 있는 시간을 알려주세요.</p></div><section className="onboarding-group"><h2>일정 밀도</h2><div className="onboarding-density-grid">{[['여유롭게', '장소마다 충분히 머물고 싶어요'], ['촘촘하게', '더 많은 장소를 방문하고 싶어요']].map(([name, copy]) => <button type="button" className={pace === name ? 'selected' : ''} key={name} onClick={() => setPace(name)}><strong>{name}</strong><small>{copy}</small></button>)}</div></section><section className="onboarding-group"><h2>여행 시간</h2><div className="onboarding-duration-grid">{[['3시간', '가볍게 반나절 걷기'], ['5시간', '점심부터 저녁 전까지'], ['하루 종일', '여유 있는 서울 여행']].map(([name, copy]) => <button type="button" className={tripTime === name ? 'selected' : ''} key={name} onClick={() => setTripTime(name)}><strong>{name}</strong><small>{copy}</small></button>)}</div></section></>}{screen === 'onboarding-permissions' && <><div className="onboarding-copy"><h1>필요한 순간에 알려드릴게요</h1><p>권한은 해당 기능을 사용할 때만 요청해요.</p></div><div className="onboarding-permission-list">{[['위치', '길 안내와 도착 감지에 사용'], ['알림', '혼잡 변화와 주변 장소 안내'], ['카메라', '촬영 장면 구도 맞추기'], ['사진', '방문 인증 사진 저장']].map(([name, copy]) => { const selected = permissions.includes(name); return <button type="button" className={selected ? 'selected' : ''} key={name} onClick={() => setPermissions((current) => selected ? current.filter((item) => item !== name) : [...current, name])}><i>{selected ? '✓' : ''}</i><span><strong>{name}</strong><small>{copy}</small></span></button>; })}</div><button type="button" className="onboarding-later" onClick={goNext}>나중에 설정<span>MY에서 언제든 변경 가능</span></button></>}</main><div className="sticky-actions"><ActionButton onClick={goNext}>{screen === 'onboarding-permissions' ? '때마침 시작' : '다음'}</ActionButton></div></section>;
}

const ALL_MAP_FILTER = { type: 'all', code: 'ALL', label: '전체' };
const FIXED_MAP_FILTERS = [
  { type: 'category', code: 'RESTAURANT', label: '음식점', tone: 'restaurant' },
  { type: 'category', code: 'CAFE_DESSERT', codes: ['CAFE', 'DESSERT'], label: '카페/디저트', tone: 'cafe-dessert' },
  { type: 'category', code: 'ATTRACTION', label: '관광지', tone: 'attraction' },
  { type: 'category', code: 'CULTURE', label: '문화시설', tone: 'culture' },
  { type: 'category', code: 'EXHIBITION', label: '전시', tone: 'exhibition' },
  { type: 'category', code: 'SHOPPING', label: '쇼핑', tone: 'shopping' },
  { type: 'category', code: 'POPUP', label: '팝업스토어', tone: 'popup' },
  { type: 'category', code: 'PARK', label: '공원', tone: 'park' },
  { type: 'category', code: 'WALK', label: '산책로', tone: 'walk' },
  { type: 'category', code: 'PHOTO_SPOT', label: '포토스팟', tone: 'photo-spot' },
  { type: 'tag', code: 'FILMING_LOCATION', label: '촬영지', tone: 'filming' },
];

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

function MapHome({ go }) {
  const [filter, setFilter] = useState('전체');
  const [activeMapFilter, setActiveMapFilter] = useState(ALL_MAP_FILTER);
  const [isMapFilterOpen, setIsMapFilterOpen] = useState(false);
  const [categorySourcePlaces, setCategorySourcePlaces] = useState([]);
  const [isLocated, setIsLocated] = useState(false);
  const [isNearbySheetCollapsed, setIsNearbySheetCollapsed] = useState(false);
  const [nearbyPlace, setNearbyPlace] = useState(null);
  const nearbySheetDragControls = useDragControls();

  useEffect(() => {
    let cancelled = false;
    fetchPlaces({ district: '종로구', size: 1000 })
      .then((page) => {
        const first = page.content?.[0];
        if (!cancelled) setCategorySourcePlaces(page.content ?? []);
        if (!cancelled && first) setNearbyPlace(placeToCardProps(first));
      })
      .catch((error) => console.error('주변 장소를 불러오지 못했어요', error));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLocated) return undefined;
    if (!navigator.geolocation) {
      setIsLocated(false);
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const nextLocation = [coords.longitude, coords.latitude];
        window.dispatchEvent(new CustomEvent('vworld:user-location', { detail: nextLocation }));
      },
      () => {
        setIsLocated(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.dispatchEvent(new CustomEvent('vworld:user-location', { detail: null }));
    };
  }, [isLocated]);

  const sourceCategoryByPlaceId = useMemo(() => {
    const categories = new Map();
    categorySourcePlaces.forEach((place) => {
      if (!place.id || !place.categoryCode) return;
      categories.set(place.id, {
        code: normalizeMapCode(place.categoryCode),
        label: place.categoryLabel || place.categoryCode,
      });
    });
    return categories;
  }, [categorySourcePlaces]);

  const getMapPlaceCategory = (place) => {
    if (place.categoryCode) {
      return {
        code: normalizeMapCode(place.categoryCode),
        label: place.categoryLabel || place.categoryCode,
      };
    }
    return sourceCategoryByPlaceId.get(place.id) || null;
  };

  const visibleMapFilters = isMapFilterOpen
    ? FIXED_MAP_FILTERS
    : activeMapFilter.type === 'all'
      ? []
      : [activeMapFilter];

  const nearbyByFilter = {
    전체: { title: '지금 가기 좋은 곳', place: nearbyPlace || { name: '주변 장소를 불러오는 중', meta: '', image: images.mapPlace, badge: '종로구' }, next: 'place' },
    촬영지: { title: '장면 속 가까운 곳', place: { name: '창덕궁 후원', meta: '도깨비 촬영지', image: images.popup, badge: '촬영지' }, next: 'filming-content' },
  };
  const nearby = nearbyByFilter[filter] || nearbyByFilter.전체;
  const filterMapPlace = (place) => {
    if (activeMapFilter.type === 'category') {
      const categoryCode = getMapPlaceCategory(place)?.code;
      const targetCodes = activeMapFilter.codes || [activeMapFilter.code];
      return targetCodes.map(normalizeMapCode).includes(categoryCode);
    }
    if (activeMapFilter.type === 'tag') {
      return normalizeMapTags(place.tags).includes(normalizeMapCode(activeMapFilter.code));
    }
    return true;
  };
  const mapApiFilterParams = () => {
    if (activeMapFilter.type === 'category') {
      return { category: activeMapFilter.codes?.join(',') || activeMapFilter.code };
    }
    if (activeMapFilter.type === 'tag') {
      return { tag: activeMapFilter.code };
    }
    return {};
  };
  const selectMapFilter = (option) => {
    setActiveMapFilter(option);
    setIsMapFilterOpen(false);
    setFilter(option.type === 'tag' && option.code === 'FILMING_LOCATION' ? '촬영지' : '전체');
  };
  const toggleAllFilters = () => {
    setActiveMapFilter(ALL_MAP_FILTER);
    setFilter('전체');
    setIsMapFilterOpen((current) => !current);
  };
  const settleNearbySheet = (_, info) => {
    const swipedDown = info.offset.y > 54 || info.velocity.y > 420;
    const swipedUp = info.offset.y < -54 || info.velocity.y < -420;
    if (swipedDown) setIsNearbySheetCollapsed(true);
    if (swipedUp) setIsNearbySheetCollapsed(false);
  };

  return (
    <section className="phone map-home-screen">
      <MapStage
        mapProps={{
          loadPlacesInBounds: (bounds) => fetchMapPlaces({ ...bounds, ...mapApiFilterParams() }),
          placeMarkerFilter: filterMapPlace,
          placeMarkerFilterKey: `${activeMapFilter.type}:${activeMapFilter.codes?.join(',') || activeMapFilter.code}`,
          placeRequestKey: `${activeMapFilter.type}:${activeMapFilter.codes?.join(',') || activeMapFilter.code}`,
          onPlaceClick: (place) => go('place', place.id),
        }}
      >
        <div className="map-top-fade" />
        <motion.header
          className="map-home-header"
          initial={{ opacity: 0, transform: 'perspective(1100px) translateY(-16px) rotateX(-4deg) translateZ(-18px)' }}
          animate={{ opacity: 1, transform: 'perspective(1100px) translateY(0px) rotateX(0deg) translateZ(0px)' }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        >
          <p>안국동 · 내 주변</p>
          <h1>오늘, 어디로 걸어볼까요?</h1>
          <button className="map-search-trigger" onClick={() => go('search')} type="button"><span><SearchIcon /></span>장소·지역·테마 검색</button>
          <div className="map-filter-bar">
            <button
              className={`map-filter-toggle ${activeMapFilter.type === 'all' ? 'is-active' : ''}`}
              onClick={toggleAllFilters}
              type="button"
              aria-expanded={isMapFilterOpen}
            >
              전체
            </button>
            {visibleMapFilters.map((item) => (
              <button
                className={`map-filter-chip is-${item.tone} ${activeMapFilter.type === item.type && activeMapFilter.code === item.code ? 'is-active' : ''}`}
                key={`${item.type}:${item.code}`}
                onClick={() => selectMapFilter(item)}
                type="button"
                aria-pressed={activeMapFilter.type === item.type && activeMapFilter.code === item.code}
              >
                {item.label}
              </button>
            ))}
          </div>
        </motion.header>
        <MapPlacePulse />
        <button className={`map-location-button ${isLocated ? 'is-located' : ''}`} type="button" aria-label="내 위치" aria-pressed={isLocated} onClick={() => setIsLocated((current) => !current)}><LocateFixed aria-hidden="true" size={20} strokeWidth={2.2} /></button>
        {isLocated && <p className="map-location-status" role="status">현재 위치를 기준으로 보고 있어요</p>}
        <motion.section className="bottom-sheet map-nearby-sheet motion-depth-sheet" data-collapsed={isNearbySheetCollapsed || undefined} initial={{ opacity: 0, y: 42 }} animate={{ opacity: 1, y: isNearbySheetCollapsed ? 176 : 0 }} transition={{ opacity: { duration: 0.28, delay: 0.08 }, y: { type: 'spring', stiffness: 420, damping: 38 } }} drag="y" dragControls={nearbySheetDragControls} dragListener={false} dragConstraints={{ top: 0, bottom: 176 }} dragElastic={0.06} dragMomentum={false} onDragEnd={settleNearbySheet}>
          <button className="map-sheet-handle-button" type="button" aria-label={isNearbySheetCollapsed ? '주변 장소 패널 펼치기' : '주변 장소 패널 접기'} aria-expanded={!isNearbySheetCollapsed} onPointerDown={(event) => nearbySheetDragControls.start(event)} onClick={() => setIsNearbySheetCollapsed((current) => !current)}><span className="sheet-handle" /></button>
          <ScreenSection title={nearby.title} action="전체보기" onAction={() => go('explore')}><PlaceRow place={nearby.place} onClick={() => go(nearby.next, nearby.place.id)} /></ScreenSection>
          <button type="button" className="map-live-link" onClick={() => go('live-talk')}><span>내 주변 지금톡</span><small>현장 소식 6개&nbsp; ›</small></button>
        </motion.section>
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
  const loadFilmingPlaces = useCallback(
    ({ page, size }) => fetchPlaces({ district: '종로구', tag: 'FILMING_LOCATION', page, size }),
    [],
  );
  const loadPopupEvents = useCallback(
    ({ page, size }) => fetchEvents({ page, size }),
    [],
  );
  const filming = useHorizontalPagedList({ loadPage: loadFilmingPlaces, mapItem: filmingPlaceToCardProps });
  const popups = useHorizontalPagedList({ loadPage: loadPopupEvents, mapItem: eventToCardProps });

  const normalized = query.trim().toLowerCase();
  const exploreItems = [...CURATED_TRENDING_PLACES, ...filming.items, ...popups.items];
  const hasQueryResult = exploreItems.some((item) => `${item.name} ${item.meta}`.toLowerCase().includes(normalized));
  const loadError = filming.error && popups.error;
  return (
    <section className="phone standard-screen tab-screen">
      <main className="page-scroll explore-scroll">
        <motion.header
          className="tab-heading"
          initial={{ opacity: 0, transform: 'perspective(1000px) translateY(-12px) rotateX(-3deg) translateZ(-14px)' }}
          animate={{ opacity: 1, transform: 'perspective(1000px) translateY(0px) rotateX(0deg) translateZ(0px)' }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        >
          <h1>탐색</h1>
          <SearchField value={query} onChange={setQuery} onSubmit={() => go(normalized ? 'search' : 'search')} placeholder="장소, 메뉴, 촬영지를 검색해보세요" />
        </motion.header>
        {loadError ? (
          <p className="search-empty">데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
        ) : normalized && !hasQueryResult ? (
          <EmptySearch query={query} onClear={() => setQuery('')} />
        ) : (
          <>
            <ExploreReveal delay={0.06}>
              <ScreenSection title="요즘 이곳에서는" subtitle="큐레이션 준비 중" action="전체보기" onAction={() => go('trending')}>
                <div className="horizontal-cards">
                  {CURATED_TRENDING_PLACES.map((place, index) => (
                    <PlaceCard place={place} index={index} key={place.id} onClick={() => go('place')} />
                  ))}
                </div>
              </ScreenSection>
            </ExploreReveal>
            <ExploreReveal delay={0.12}>
              <ScreenSection title="장면 속으로" subtitle="드라마와 영화 속 서울의 장소" action="전체보기" onAction={() => go('filming-locations')}>
                <HorizontalInfiniteCards items={filming.items} hasMore={filming.hasMore} isLoading={filming.isLoading} onLoadMore={filming.loadMore} emptyLabel="촬영지 장소가 아직 없어요" onCardClick={(place) => go('place', place.id)} />
              </ScreenSection>
            </ExploreReveal>
            <ExploreReveal delay={0.18}>
              <ScreenSection title="이번 주 행사" action="더보기" onAction={() => go('popups')}>
                <HorizontalInfiniteCards items={popups.items} hasMore={popups.hasMore} isLoading={popups.isLoading} onLoadMore={popups.loadMore} emptyLabel="행사가 아직 없어요" onCardClick={(event) => go('event-detail', event.id)} />
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

function formatOperatingHours(hours) {
  if (!hours || hours.length === 0) return null;
  return hours
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((h) => `${WEEKDAY_LABEL[h.dayOfWeek]} ${h.closed ? '휴무' : `${h.openTime ?? '?'}-${h.closeTime ?? '?'}`}`)
    .join(' · ');
}

function filmingMediaLabel(mediaContent) {
  if (!mediaContent) return '작품 정보 확인 중';
  const mediaType = mediaContent.mediaType === 'movie' ? '영화' : '드라마';
  return [mediaType, mediaContent.releaseDate].filter(Boolean).join(' · ');
}

function FilmingSceneSection({ filmingLocations }) {
  if (!filmingLocations.length) return null;

  return (
    <ScreenSection title="이 장소에서 촬영된 장면" action={`${filmingLocations.length}개`}>
      <div className="place-filming-scene-list">
        {filmingLocations.map((item) => {
          const title = item.mediaContent?.title || '작품 정보 확인 중';
          const description = item.sceneDescription || '장면 설명을 준비 중이에요.';
          return (
            <article className="place-filming-scene-card" key={item.id}>
              <span>{filmingMediaLabel(item.mediaContent)}</span>
              <strong>{title}</strong>
              <p>{description}</p>
            </article>
          );
        })}
      </div>
    </ScreenSection>
  );
}

function PlaceDetail({ go, placeId }) {
  const [place, setPlace] = useState(null);
  const [filmingLocations, setFilmingLocations] = useState([]);
  const [status, setStatus] = useState(placeId ? 'loading' : 'mock');

  useEffect(() => {
    if (!placeId) {
      setStatus('mock');
      setFilmingLocations([]);
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    setFilmingLocations([]);
    Promise.allSettled([
      fetchPlace(placeId),
      fetchPlaceFilmingLocations(placeId),
    ])
      .then(([placeResult, filmingResult]) => {
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
    return <section className="phone standard-screen place-detail-screen"><main className="page-scroll"><div className="detail-hero"><img src={images.detail} alt="도토리가든 외관" /><DetailHeroControls onBack={() => go('explore')} onSave={() => go('saved')} /></div><div className="detail-content detail-content-v3"><p className="eyebrow">안국 · 카페</p><h1>도토리가든</h1><p className="detail-meta">매일 10:00-21:00</p><div className="chip-row"><Chip active>지금 여유</Chip><Chip>도보 8분</Chip></div><ScreenSection title="지금 가야 하는 이유"><div className="why-card place-why-card"><span>최근 후기 기반 · 오늘 업데이트</span><strong>최근 3일간 소금빵과 정원 사진을<br />저장한 사람이 빠르게 늘고 있어요.</strong><p>오후 2-4시는 사진 후기가 특히 많아요</p></div></ScreenSection><ScreenSection title="지금 현장에서는" action="12분 전"><div className="place-live-grid"><article><span>대기</span><b>약 10분</b></article><article><span>메뉴</span><b>소금빵 재고 있음</b></article></div></ScreenSection></div></main><div className="sticky-actions split place-actions"><ActionButton onClick={() => go('course-conditions')}>코스에 추가</ActionButton><ActionButton tone="secondary" onClick={() => go('write-review')}>후기 남기기</ActionButton></div></section>;
  }

  if (status === 'loading') {
    return <section className="phone standard-screen place-detail-screen"><main className="page-scroll centered-state"><BrandLoading /><h1>장소 정보를 불러오고 있어요</h1></main></section>;
  }

  if (status === 'error' || !place) {
    return <section className="phone standard-screen place-detail-screen"><BackHeader title="장소" onBack={() => go('explore')} /><main className="page-scroll centered-state"><h1>정보를 불러오지 못했어요</h1><p>잠시 후 다시 시도해주세요.</p></main></section>;
  }

  const heroImage = place.images?.[0]?.sourceUrl || images.detail;
  const hoursLabel = formatOperatingHours(place.operatingHours) || place.operatingHoursRaw || '운영시간 정보 없음';

  return <section className="phone standard-screen place-detail-screen"><main className="page-scroll"><div className="detail-hero"><img src={heroImage} alt={`${place.name} 외관`} /><DetailHeroControls onBack={() => go('explore')} onSave={() => go('saved')} /></div><div className="detail-content detail-content-v3"><p className="eyebrow">{[place.district, place.categoryLabel].filter(Boolean).join(' · ')}</p><h1>{place.name}</h1><p className="detail-meta">{hoursLabel}</p><div className="chip-row">{place.phone && <Chip active>{place.phone}</Chip>}<Chip>{place.roadAddress || place.lotAddress || '주소 정보 없음'}</Chip></div>{place.description && <ScreenSection title="장소 소개"><div className="why-card place-why-card"><p>{place.description}</p></div></ScreenSection>}<FilmingSceneSection filmingLocations={filmingLocations} />{place.images?.length > 0 && <ScreenSection title="사진"><div className="horizontal-cards">{place.images.map((img) => <div className="place-card-image" key={img.id} style={{ width: 120, height: 120, flex: '0 0 auto' }}><img src={img.sourceUrl} alt="" /></div>)}</div></ScreenSection>}</div></main><div className="sticky-actions split place-actions"><ActionButton onClick={() => go('course-conditions')}>코스에 추가</ActionButton><ActionButton tone="secondary" onClick={() => go('write-review')}>후기 남기기</ActionButton></div></section>;
}

function EventDetail({ go, eventId }) {
  const [event, setEvent] = useState(null);
  const [status, setStatus] = useState(eventId ? 'loading' : 'error');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const userLocation = useUserLocation();

  useEffect(() => {
    if (!eventId) {
      setStatus('error');
      return undefined;
    }
    let cancelled = false;
    const requestController = new AbortController();
    setStatus('loading');
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
  const primaryAction = officialUrl
    ? { label: '공식 정보 보기', icon: ExternalLink, onClick: () => openExternal(officialUrl) }
    : displayEvent.placeId
      ? { label: '장소 정보 보기', icon: MapPin, onClick: () => go('place', displayEvent.placeId) }
      : null;
  const openExternal = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className={`phone standard-screen event-detail-screen ${primaryAction ? 'has-sticky-action' : ''}`}>
      <main className="page-scroll">
        <div className={`detail-hero event-detail-hero ${displayEvent.mainImage ? '' : 'is-placeholder'}`}>
          <EventImage event={displayEvent} className="event-detail-media" />
          <DetailHeroControls onBack={() => go('popups')} onSave={() => go('saved')} saveLabel="행사 저장" />
        </div>
        <div className="detail-content detail-content-v3 event-detail-content">
          <div className="event-status-row">
            <Chip active>{stateLabel}</Chip>
            {displayEvent.eventType && <span className="event-type-label">{displayEvent.eventType}</span>}
          </div>
          <h1>{displayEvent.name}</h1>
          <div className="event-visit-summary" aria-label="방문 정보">
            <div><CalendarDays aria-hidden="true" size={19} strokeWidth={1.8} /><span><small>일정</small><strong>{dateLabel}</strong></span></div>
            <div><Clock3 aria-hidden="true" size={19} strokeWidth={1.8} /><span><small>시간</small><strong>{displayEvent.eventTime || '시간 정보 없음'}</strong></span></div>
            <div><MapPin aria-hidden="true" size={19} strokeWidth={1.8} /><span><small>장소</small><strong>{venueLabel}</strong></span></div>
            <div><CircleDollarSign aria-hidden="true" size={19} strokeWidth={1.8} /><span><small>요금</small><strong>{displayEvent.useFee || '요금 정보 확인 중'}</strong></span></div>
          </div>
          {(displayEvent.useTarget || displayEvent.applyDate) && (
            <ScreenSection title="참여 정보">
              <div className="event-detail-list">
                {displayEvent.useTarget && <p><span>이용 대상</span><b>{displayEvent.useTarget}</b></p>}
                {displayEvent.applyDate && <p><span>신청일</span><b>{formatKoreanDate(displayEvent.applyDate)}</b></p>}
              </div>
            </ScreenSection>
          )}
          {displayEvent.placeId && officialUrl && (
            <ScreenSection title="연결된 장소">
              <button type="button" className="event-linked-place" onClick={() => go('place', displayEvent.placeId)}>
                <span><strong>{displayEvent.placeName || venueLabel}</strong><small>장소 상세에서 운영정보와 촬영 장면을 함께 볼 수 있어요.</small></span>
                <ChevronRight aria-hidden="true" size={18} strokeWidth={2} />
              </button>
            </ScreenSection>
          )}
          {(displayEvent.orgName || displayEvent.inquiry) && (
            <ScreenSection title="주최·문의">
              <div className="event-detail-list">
                {displayEvent.orgName && <p><span>주최</span><b>{displayEvent.orgName}</b></p>}
                {displayEvent.inquiry && <p><span>문의</span><b>{displayEvent.inquiry}</b></p>}
              </div>
            </ScreenSection>
          )}
          <DetailMapSection
            title="행사 장소 한눈에 보기"
            meta={venueLabel}
            ariaLabel={`${displayEvent.name} 행사 장소 지도`}
            places={eventMapPlaces}
            userLocation={userLocation}
          />
        </div>
      </main>
      {primaryAction && <div className="sticky-actions event-actions"><ActionButton onClick={primaryAction.onClick}>{(() => { const Icon = primaryAction.icon; return <Icon aria-hidden="true" size={17} strokeWidth={2} />; })()}{primaryAction.label}</ActionButton></div>}
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

function SearchResults({ screen, go }) {
  const [query, setQuery] = useState(screen === 'search-empty' ? '없는 장소' : '');
  const [activeTab, setActiveTab] = useState('장소');
  const [placeResults, setPlaceResults] = useState([]);
  const [mediaResults, setMediaResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const courseResults = [{ name: '안국동 궁궐 산책', meta: '3곳 · 2시간 10분 · 도보 중심', image: images.myMap, badge: '추천 코스' }, { name: '드라마 속 종로', meta: '4곳 · 3시간 30분 · 촬영지', image: images.popup, badge: '촬영지 코스' }];
  const resultSets = { 장소: placeResults, 코스: courseResults, 콘텐츠: mediaResults };

  const runSearch = async (keyword) => {
    setSearched(true);
    try {
      const [placesPage, mediaPage] = await Promise.all([
        fetchPlaces({ keyword, size: 20 }),
        fetchMediaContents({ size: 20 }),
      ]);
      setPlaceResults((placesPage.content ?? []).map(placeToCardProps));
      const normalizedKeyword = keyword.trim().toLowerCase();
      setMediaResults(
        (mediaPage.content ?? [])
          .filter((media) => !normalizedKeyword || media.title.toLowerCase().includes(normalizedKeyword))
          .map(mediaContentToRowProps),
      );
    } catch (error) {
      console.error('검색에 실패했어요', error);
      setPlaceResults([]);
      setMediaResults([]);
    }
  };

  const submit = () => {
    if (!query.trim()) { go('search-empty'); return; }
    runSearch(query.trim());
    go('search');
  };

  const isEmptyResult = searched && screen === 'search' && activeTab === '장소' && !placeResults.length && !mediaResults.length;

  if (screen === 'search-empty') return <section className="phone standard-screen search-screen"><BackHeader title="검색" onBack={() => go('explore')} /><main className="page-scroll"><div className="search-page-field"><SearchField value={query} onChange={setQuery} onSubmit={submit} placeholder="장소·지역·테마 검색" autoFocus /></div><EmptySearch query={query} onClear={() => setQuery('')} /></main></section>;
  return <section className="phone standard-screen search-screen"><BackHeader title="검색" onBack={() => go('explore')} /><main className="page-scroll"><div className="search-page-field"><SearchField value={query} onChange={setQuery} onSubmit={submit} placeholder="장소·지역·테마 검색" autoFocus /></div>{searched && <div className="search-result-copy"><strong>'{query}' 검색 결과</strong><span>종로구에서 찾았어요</span></div>}{isEmptyResult ? <EmptySearch query={query} onClear={() => setQuery('')} /> : <><div className="result-tabs">{[['장소', placeResults.length], ['코스', courseResults.length], ['콘텐츠', mediaResults.length]].map(([name, count]) => <Chip active={activeTab === name} key={name} onClick={() => setActiveTab(name)}>{name} {count}</Chip>)}</div><div className="search-result-list">{resultSets[activeTab].map((place, index) => <PlaceRow key={place.id ?? `${place.name}-${index}`} place={place} onClick={() => go(activeTab === '코스' ? 'route-map' : 'place', activeTab === '장소' ? place.id : undefined)} />)}</div></>}</main></section>;
}

function SavedConfirmation({ go }) {
  return <section className="phone standard-screen saved-detail-screen"><main className="page-scroll"><div className="detail-hero"><img src={images.detail} alt="도토리가든 외관" /><div className="detail-controls"><IconButton label="이전" onClick={() => go('place')}>‹</IconButton><IconButton label="저장됨" onClick={() => go('my')}>♥</IconButton></div></div><div className="detail-content detail-content-v3"><p className="eyebrow">안국 · 카페</p><h1>도토리가든</h1><p className="detail-meta">매일 10:00-21:00</p><div className="chip-row"><Chip active>지금 여유</Chip><Chip>도보 8분</Chip></div><ScreenSection title="지금 가야 하는 이유"><div className="why-card place-why-card"><span>최근 후기 기반 · 오늘 업데이트</span><strong>최근 3일간 소금빵과 정원 사진을<br />저장한 사람이 빠르게 늘고 있어요.</strong><p>오후 2-4시는 사진 후기가 특히 많아요</p></div></ScreenSection><ScreenSection title="지금 현장에서는" action="12분 전"><div className="place-live-grid"><article><span>대기</span><b>약 10분</b></article><article><span>메뉴</span><b>소금빵 재고 있음</b></article></div></ScreenSection></div></main><section className="save-confirmation-toast" role="status"><span>✓</span><div><strong>저장한 장소에 추가했어요</strong><small>MY에서 언제든 다시 볼 수 있어요.</small></div><button type="button" onClick={() => go('my')}>보기</button></section><div className="sticky-actions split place-actions"><ActionButton onClick={() => go('course-conditions')}>코스에 추가</ActionButton><ActionButton tone="secondary" onClick={() => go('explore')}>탐색 계속</ActionButton></div></section>;
}

const collectionInfo = {
  trending: ['요즘 이곳에서는', '최근 메뉴·사진·공간이 주목받는 장소', [locationRows[0], { ...locationRows[0], name: '런던베이글뮤지엄', meta: '안국 · 오전이 가장 여유로워요' }]],
  'filming-locations': ['장면 속으로', '드라마와 영화 속, 직접 걸어볼 수 있는 장소', [locationRows[1], { ...locationRows[1], name: '덕수궁 돌담길', meta: '도깨비 촬영지 · 도보 산책' }]],
  popups: ['이번 주 팝업', '지금 서울에서만 만날 수 있는 장소', [{ name: '블루 모먼트 전시 팝업', meta: '성수 · 8월 31일까지', image: images.scene, badge: '이번 주' }, { name: '아무개 서점 여름 마켓', meta: '서촌 · 이번 주말', image: images.cafe, badge: '주말' }]],
};

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

  return (
    <button
      className="filming-place-card"
      type="button"
      onClick={onClick}
      aria-label={`${place.name} 촬영지 장소 상세 보기`}
    >
      <span className="filming-place-card-media">
        <FilmingPlaceMedia place={place} />
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
        <header className="collection-heading filming-collection-heading">
          <h1>장면을 따라 걷는 서울</h1>
          <small>작품에서 시작하거나, 가까운 촬영 장소부터 찾아보세요.</small>
        </header>
        <div className="filming-view-switch" role="tablist" aria-label="촬영지 보기 방식">
          <button type="button" role="tab" aria-selected={activeView === 'works'} className={activeView === 'works' ? 'is-active' : ''} onClick={() => setActiveView('works')}>작품별 보기</button>
          <button type="button" role="tab" aria-selected={activeView === 'places'} className={activeView === 'places' ? 'is-active' : ''} onClick={() => setActiveView('places')}>장소별 보기</button>
        </div>
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
      <BackHeader title="이번 주 행사" onBack={() => go('explore')} />
      <main className="page-scroll event-collection-scroll" ref={scrollRef} onScroll={handleScroll}>
        <header className="collection-heading event-collection-heading">
          <h2>행사와 전시</h2>
          <small>종로구의 문화행사를 한눈에 확인해보세요.</small>
        </header>
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

function CollectionScreen({ screen, go }) {
  if (screen === 'filming-locations') {
    return <FilmingLocationsCollection go={go} />;
  }
  if (screen === 'popups') {
    return <EventsCollection go={go} />;
  }

  return <StaticCollectionScreen screen={screen} go={go} />;
}

function StaticCollectionScreen({ screen, go }) {
  const [title, subtitle, places] = collectionInfo[screen];
  const [filter, setFilter] = useState('전체');
  const filters = screen === 'popups' ? ['전체', '이번 주', '무료'] : screen === 'filming-locations' ? ['전체', '드라마', '영화'] : ['전체', '안국', '지금 여유'];
  const displayedPlaces = filter === '전체' ? places.concat(places) : places.concat(places).filter((_, index) => index % 2 === 0);
  return <section className="phone standard-screen list-screen collection-screen-v3"><BackHeader title={title} onBack={() => go('explore')} /><main className="page-scroll"><header className="collection-heading"><p>{screen === 'popups' ? '서울의 이번 주' : screen === 'filming-locations' ? '서울의 장면들' : '최근 저장과 후기'}</p><h1>{title}</h1><small>{subtitle}</small></header><div className="collection-filters">{filters.map((item) => <Chip key={item} active={filter === item} onClick={() => setFilter(item)}>{item}</Chip>)}</div><div className="collection-list">{displayedPlaces.map((place, index) => <PlaceRow key={`${place.name}-${index}`} place={place} onClick={() => go(screen === 'filming-locations' ? 'filming-content' : 'place')} />)}</div></main></section>;
}

function LiveTalk({ go }) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([{ text: '창덕궁 쪽은 입장 줄이 거의 없어요.', mine: false }, { text: '도토리가든은 지금 바로 들어갔어요!', mine: true }, { text: '북촌 골목은 오후보다 한산해요.', mine: false }]);
  const submit = (event) => { event.preventDefault(); const text = draft.trim(); if (!text) return; setMessages((current) => [...current, { text, mine: true }]); setDraft(''); };
  return <section className="phone standard-screen live-talk-screen"><BackHeader title="내 주변 지금톡" onBack={() => go('map')} /><main className="page-scroll"><div className="talk-hero"><CrowdMotion /><div><span>안국동 · 실시간</span><h2>지금 근처가 어떤가요?</h2><p>현장에 있는 사람들이 남긴 짧은 소식이에요.</p></div></div><div className="talk-presence"><i />지금 안국동에 6명이 있어요</div><div className="chat-list">{messages.map((message, index) => <p className={`chat-bubble ${message.mine ? 'mine' : 'other'}`} key={`${message.text}-${index}`}>{message.text}</p>)}</div></main><form className="talk-input" onSubmit={submit}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="지금 상황을 남겨보세요" /><button type="submit" aria-label="보내기" disabled={!draft.trim()}><SendHorizontal aria-hidden="true" size={19} strokeWidth={2} /></button></form></section>;
}

function CourseConditions({ go }) {
  const [duration, setDuration] = useState('5시간');
  const [pace, setPace] = useState('여유롭게');
  const [budget, setBudget] = useState('1만원');
  return <section className="phone standard-screen course-condition-screen"><main className="page-scroll"><BackHeader title="코스 만들기" onBack={() => go('map')} /><span className="progress-pill">1 / 3</span><div className="course-hero"><p>오늘의 코스</p><h1>어떤 하루를 보내고 싶어요?</h1><span>시간과 일정 밀도만 알려주세요.</span></div><ScreenSection title="출발 정보"><div className="setting-card"><button type="button"><span className="setting-card-label"><MapPin aria-hidden="true" size={16} />출발 위치</span><strong>현재 위치 · 안국동</strong><ChevronRight aria-hidden="true" size={16} /></button><button type="button"><span className="setting-card-label"><Clock3 aria-hidden="true" size={16} />출발 시간</span><strong>오늘 13:40</strong><ChevronRight aria-hidden="true" size={16} /></button></div></ScreenSection><ScreenSection title="얼마나 함께 걸을까요?"><div className="three-choice-row">{['3시간', '5시간', '하루 종일'].map((item) => <button key={item} type="button" onClick={() => setDuration(item)} className={duration === item ? 'selected' : ''}>{item}</button>)}</div></ScreenSection><ScreenSection title="일정은 어떤 느낌이 좋아요?"><div className="pace-choice-grid">{[['여유롭게', '머무는 시간을 넉넉히'], ['촘촘하게', '더 많은 장소를 방문']].map(([name, copy]) => <button type="button" className={pace === name ? 'selected' : ''} key={name} onClick={() => setPace(name)}><strong>{name}</strong><span>{copy}</span></button>)}</div></ScreenSection><ScreenSection title="이동비 예산"><div className="three-choice-row">{['0원', '1만원', '2만원 이상'].map((item) => <button key={item} type="button" onClick={() => setBudget(item)} className={budget === item ? 'selected' : ''}>{item}</button>)}</div></ScreenSection><StatusBanner tone="blue" title="예약 · 마감 시간을 먼저 고려해요" copy="가능한 장소만 골라 이동 순서를 맞춰드려요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('basket')}>이 조건으로 코스 만들기</ActionButton></div></section>;
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

function CourseBasket({ screen, go }) {
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
  return <section className={`phone standard-screen basket-screen basket-screen-v3 ${screen} ${isCurated ? 'basket-curated' : ''}`}><main className="page-scroll basket-scroll"><header className="basket-heading"><h1>{variant.title}</h1><p>{variant.copy}</p></header><section className="basket-summary"><span>{variant.label}</span><h2>{variant.summary}</h2><p>{variant.note}</p></section>{isCurated && <section className="basket-reservation-note"><span>예약 일정</span><strong>런던 베이글 뮤지엄 · 오늘 15:00</strong><small>예약 10분 전 도착을 기준으로 계산했어요.</small></section>}<section className="basket-place-section"><h2>꼭 갈 곳</h2><div className="basket-place-list">{places.slice(0, 2).map((place) => <PlaceRow key={place.name} place={place} onClick={() => go('place')} />)}</div></section><section className="basket-place-section want"><h2>가고 싶은 곳</h2><div className="basket-place-list">{places.slice(2).map((place) => <PlaceRow key={place.name} place={place} onClick={() => go('place')} />)}</div></section>{isCurated && <button type="button" className="basket-add-place" onClick={() => go('explore')}><span>＋</span>장소 더 담기</button>}</main><div className="sticky-actions basket-actions"><ActionButton onClick={() => go('compare')}>4개 장소로 코스 만들기</ActionButton></div><BottomNav active="course" onNavigate={(tab) => go(rootRoutes[tab])} /></section>;
}

function CourseCompare({ screen, go }) {
  if (screen === 'route-map') return <RouteOverview go={go} />;
  const [selected, setSelected] = useState('fast');
  const courses = [{ id: 'fast', badge: '추천 · 이동 최소', title: '빠른 코스', time: '4시간 20분', detail: '도보 43분 · 3.8km · 환승 1회', copy: '팝업 마감 전에 먼저 방문하도록 배치했어요' }, { id: 'easy', badge: '걷기 부담 최소', title: '편한 코스', time: '5시간 10분', detail: '도보 28분 · 2.4km · 환승 2회', copy: '긴 도보 구간을 나눠 중간에 이동을 넣었어요' }];
  const selectedCourse = courses.find((course) => course.id === selected);
  return <section className="phone standard-screen compare-screen compare-screen-v3"><main className="page-scroll compare-scroll"><header className="compare-heading"><h1>코스 비교</h1><p>같은 장소도 순서에 따라 하루가 달라져요</p></header><div className="compare-cards">{courses.map((course) => <article className={`compare-card ${selected === course.id ? 'selected' : ''}`} key={course.id} role="button" tabIndex="0" aria-pressed={selected === course.id} onClick={() => setSelected(course.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(course.id); } }}><span>{course.badge}</span><h2>{course.title}</h2><strong>{course.time}</strong><p>{course.detail}</p><small>{course.copy}</small></article>)}</div><button type="button" className="compare-map-preview" onClick={() => go('route-map')}><VWorldMap ariaLabel="안국과 성수를 잇는 코스 지도" interactive={false} style={{ width: '100%', height: '100%' }} /><span>안국 → 성수 · 4곳</span></button></main><div className="sticky-actions compare-actions"><ActionButton onClick={() => go('route-map')}>{selectedCourse.title}로 시작하기</ActionButton></div><BottomNav active="course" onNavigate={(tab) => go(rootRoutes[tab])} /></section>;
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

function FilmingWorkPlaceItem({ place, index, go }) {
  const sceneRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

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
      <button className="filming-work-place-main" type="button" onClick={() => go('place', place.id)}>
        <span className="filming-work-place-image">
          {place.image
            ? <img src={place.image} alt={`${place.name} 전경`} />
            : <span className="filming-work-place-image-fallback"><ImageIcon size={22} /></span>}
          <b>{index + 1}</b>
        </span>
        <span className="filming-work-place-copy">
          <small>{place.category}</small>
          <strong>{place.name}</strong>
          <span ref={sceneRef} className={`filming-work-place-scene${isExpanded ? ' is-expanded' : ''}`}>{place.scene}</span>
        </span>
        <ChevronRight aria-hidden="true" size={19} />
      </button>
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

function FilmingWorkDetail({ go, workId }) {
  const scrollRef = useRef(null);
  const [work, setWork] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const userLocation = useUserLocation();

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
            category: [place.categoryLabel, place.district].filter(Boolean).join(' · ') || '장소 정보 확인 중',
            scene: filmingLocation.sceneDescription || '장면 설명을 준비하고 있어요.',
            image: place.images?.[0]?.sourceUrl || null,
            latitude: place.latitude,
            longitude: place.longitude,
            categoryCode: place.categoryCode,
            tags: place.tags,
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

  return (
    <section className="phone standard-screen filming-work-detail-screen">
      <main className="page-scroll filming-work-detail-scroll" ref={scrollRef}>
        <div className="filming-work-detail-hero">
          {work.poster
            ? <img src={work.poster} alt={`${work.title} 포스터`} />
            : <div className="filming-work-detail-poster-fallback"><Clapperboard size={34} /><span>포스터 준비 중</span></div>}
          <div className="filming-work-detail-controls">
            <IconButton label="이전" onClick={() => go('filming-locations')}><ChevronLeft size={20} /></IconButton>
            <IconButton label="작품 저장"><Heart size={19} /></IconButton>
          </div>
          <span className="filming-work-detail-count"><MapPin size={14} /> 촬영 장소 {work.places.length}곳</span>
        </div>

        <div className="filming-work-detail-copy">
          <p className="filming-work-detail-meta">{[work.type, work.year].filter(Boolean).join(' · ')}</p>
          <h1>{work.title}</h1>
          <p className={`filming-work-detail-overview${overviewExpanded ? ' is-expanded' : ''}`}>{work.overview || '작품 소개를 준비하고 있어요.'}</p>
          {work.overview?.length > 120 && <button className="filming-work-overview-toggle" type="button" aria-expanded={overviewExpanded} onClick={() => setOverviewExpanded((current) => !current)}>{overviewExpanded ? '접기' : '더보기'}</button>}

          <section className="filming-work-place-section">
            <header>
              <h2>이 작품 속 서울</h2>
              <span>{work.places.length}곳</span>
            </header>
            {work.places.length ? <div className="filming-work-place-list">
              {work.places.map((place, index) => <FilmingWorkPlaceItem key={place.id} place={place} index={index} go={go} />)}
            </div> : <div className="filming-work-empty"><p>등록된 촬영 장소가 아직 없어요.</p></div>}
          </section>

          <DetailMapSection
            title="촬영지 한눈에 보기"
            meta={[...new Set(work.places.map((place) => place.category.split(' · ').at(-1)))].join(' · ')}
            ariaLabel={`${work.title} 촬영지 지도`}
            places={work.places}
            userLocation={userLocation}
            placeMarkerLabel={(place) => place.order}
          />
        </div>
      </main>
      <div className="sticky-actions filming-work-detail-actions">
        <ActionButton onClick={() => go('map')}><MapPin size={18} /> 지도에서 촬영지 보기</ActionButton>
      </div>
    </section>
  );
}

const filmingState = {
  'filming-content': ['촬영지 콘텐츠', '도깨비', '창덕궁 후원', '이 장면은 연못가에서 촬영되었어요.', 'scene-list'],
  'scene-detail': ['장면 상세', '도깨비', '비밀의 정원 장면', '인물의 시선을 따라 연못 쪽으로 프레임을 맞춰보세요.', 'camera-permission'],
  'shot-result': ['촬영 결과', '도깨비', '멋지게 담았어요', '같은 장면을 내 여행 기록에 남겨보세요.', 'photo-saved'],
  'photo-saved': ['방문 확인', '오늘의 기록', '사진을 저장했어요', '창덕궁 후원 방문이 기록에 추가됐어요.', 'record'],
  'image-missing': ['이미지 안내', '도깨비', '참고 이미지를 불러오지 못했어요', '장면 설명과 위치 안내는 계속 볼 수 있어요.', 'scene-list'],
  'filming-restricted': ['촬영 안내', '운현궁', '이 구역은 촬영이 제한돼요', '관람을 방해하지 않는 범위에서만 촬영해주세요.', 'onsite'],
  report: ['데이터 출처 신고', '촬영지 정보', '정보를 검토할게요', '잘못된 정보나 저작권 이슈를 알려주세요.', 'filming-content'],
};

function CameraScreen({ go }) {
  return <section className="phone camera-screen camera-match-screen"><img className="camera-live-image" src="/assets/figma/intro-visual.png" alt="카메라 미리보기" /><div className="camera-dim" /><div className="camera-header"><IconButton label="닫기" onClick={() => go('scene-detail')}>×</IconButton><span>촬영 장면 구도 맞추기</span><IconButton label="도움말">?</IconButton></div><CameraGuide /><div className="camera-caption"><strong>처마 끝을 파란 선에 맞춰보세요</strong><span>눈물의 여왕 · EP.03</span></div><div className="camera-reference-note"><span>참고 장면과 현재 화면을 겹쳐 보여줘요</span><small>TMDB 이미지 · 공공데이터 위치</small></div><div className="camera-controls"><button type="button" className="camera-gallery" aria-label="앨범"><ImageIcon aria-hidden="true" size={22} strokeWidth={2} /></button><button type="button" className="camera-shutter" aria-label="촬영" onClick={() => go('shot-result')}><span /></button><button type="button" className="camera-switch" aria-label="카메라 전환">1×</button></div></section>;
}

function MapPermissionPrompt({ go, title, copy, detail, action, next }) {
  return <section className="phone map-permission-screen"><MapStage variant="home"><div className="map-top-fade" /><header className="server-map-heading"><p>안국동 · 내 주변</p><h1>오늘, 어디로 걸어볼까요?</h1><button type="button"><span><SearchIcon /></span>장소 · 지역 · 테마 검색</button><div><Chip active>전체</Chip><Chip>요즘</Chip><Chip>팝업</Chip><Chip>촬영지</Chip></div></header><div className="server-error-dim" /><BottomSheet className="map-permission-sheet"><h1>{title}</h1><p>{copy}</p><article><strong>{detail[0]}</strong><small>{detail[1]}</small></article><ActionButton onClick={() => go(next)}>{action}</ActionButton></BottomSheet></MapStage></section>;
}

function MapLoadingPrompt({ go }) {
  return <section className="phone map-permission-screen map-loading-screen"><MapStage variant="home"><div className="map-top-fade" /><header className="server-map-heading"><p>안국동 · 내 주변</p><h1>오늘, 어디로 걸어볼까요?</h1><button type="button"><span><SearchIcon /></span>장소 · 지역 · 테마 검색</button><div><Chip active>전체</Chip><Chip>요즘</Chip><Chip>팝업</Chip><Chip>촬영지</Chip></div></header><div className="server-error-dim" /><BottomSheet className="map-permission-sheet map-loading-sheet"><BrandLoading /><h1>장소 정보를 불러오고 있어요</h1><p>공공데이터와 실시간 혼잡 정보를 확인하는 중이에요.</p><article><strong>잠시만 기다려주세요</strong><small>네트워크 상태에 따라 몇 초 걸릴 수 있어요.</small></article><ActionButton tone="secondary" onClick={() => go('map')}>나중에 다시 보기</ActionButton></BottomSheet></MapStage></section>;
}

function ShotResultScreen({ go }) {
  return <section className="phone camera-screen shot-result-screen"><img className="camera-live-image" src="/assets/figma/intro-visual.png" alt="촬영 결과" /><div className="camera-dim" /><div className="camera-header"><IconButton label="닫기" onClick={() => go('scene-detail')}>×</IconButton><span>촬영 결과 비교</span><IconButton label="도움말">?</IconButton></div><div className="shot-result-score">참고 장면과 구도가 86% 일치해요</div><div className="shot-result-comparison"><div><span>원본</span></div><i /><div><span>참고</span></div></div><div className="shot-result-copy"><strong>참고 장면 · EP.03</strong><span>좌우로 밀어 원본과 참고 장면을 비교해요</span><small>TMDB 참고 이미지 · 내 촬영 결과</small></div><div className="sticky-actions split shot-result-actions"><ActionButton onClick={() => go('photo-saved')}>사진 저장</ActionButton><ActionButton tone="secondary" onClick={() => go('camera')}>다시 촬영</ActionButton></div></section>;
}

function FilmingScreen({ screen, go, id }) {
  if (screen === 'filming-work') return <FilmingWorkDetail go={go} workId={id} />;
  if (screen === 'camera') return <CameraScreen go={go} />;
  if (screen === 'camera-permission') return <MapPermissionPrompt go={go} title="카메라 권한이 필요해요" copy="촬영 장면과 현재 화면을 겹쳐 보려면 카메라 접근이 필요해요." detail={['사진과 동영상 촬영 허용', '촬영한 사진은 저장하기 전까지 기기에 남지 않아요.']} action="카메라 권한 허용" next="camera" />;
  if (screen === 'scene-list') return <section className="phone standard-screen scene-list-v3"><BackHeader title="촬영 장면 · 운현궁" onBack={() => go('filming-content')} /><main className="page-scroll scene-list-scroll"><header><h1>이곳에서 촬영된 장면</h1><p>눈물의 여왕 · 장면 2개</p></header><div className="scene-sort-row"><Chip active>작품별</Chip><Chip>최신순</Chip></div><article className="scene-work-card"><img src="/assets/figma/intro-visual.png" alt="운현궁 촬영 장면" /><div><span>눈물의 여왕</span><small>tvN · 2024 · TMDB 작품 정보</small><p>EP.03 · 마당을 지나 대화를 나누는 장면<br />EP.11 · 처마 아래에서 재회하는 장면</p></div></article><p className="scene-list-note">스틸 이미지는 참고용으로 제공돼요</p><ScreenSection title="장면 선택"><div className="scene-choice-list"><button type="button" onClick={() => go('scene-detail')}><span><strong>EP.03</strong><small>낮 장면 · 구도 가이드 제공</small></span><b>장면 상세&nbsp; ›</b></button><button type="button" onClick={() => go('scene-detail')}><span><strong>EP.11</strong><small>저녁 장면 · 구도 가이드 제공</small></span><b>장면 보기&nbsp; ›</b></button></div></ScreenSection></main></section>;
  if (screen === 'onsite') return <section className="phone standard-screen onsite-screen"><main className="page-scroll"><div className="onsite-hero"><img src="/assets/figma/intro-visual.png" alt="운현궁 전경" /><div className="onsite-overlay-actions"><IconButton label="이전" onClick={() => go('arrival')}>‹</IconButton><IconButton label="저장" onClick={() => go('saved')}>♡</IconButton></div></div><div className="onsite-copy"><p className="eyebrow">안국 · 궁궐</p><h1>운현궁</h1><p>화-일 09:00-18:00</p><div className="chip-row"><Chip active>지금 여유</Chip><Chip>관람 약 20분</Chip></div><ScreenSection title="운현궁에서 놓치지 말 것"><div className="why-card"><span>현장 위치 확인 완료 · 오늘 업데이트</span><strong>노안당과 이로당을 잇는<br />마당 동선을 천천히 걸어보세요.</strong><p>오후에는 처마 그림자가 선명해요.</p></div></ScreenSection><ScreenSection title="지금 현장에서는" action="방금 도착"><div className="onsite-fact-grid"><article><span>관람</span><b>약 20분</b></article><article><span>촬영</span><b>삼각대 사용 제한</b></article></div></ScreenSection></div></main><div className="sticky-actions split onsite-actions"><ActionButton onClick={() => go('complete')}>관람 완료</ActionButton><ActionButton tone="secondary" onClick={() => go('filming-content')}>후기 보기</ActionButton></div></section>;
  if (screen === 'filming-content') return <section className="phone standard-screen filming-content-v3"><main className="page-scroll"><div className="filming-content-hero"><img src="/assets/figma/intro-visual.png" alt="운현궁 촬영지 전경" /><div className="filming-content-controls"><IconButton label="이전" onClick={() => go('onsite')}>‹</IconButton><IconButton label="저장" onClick={() => go('saved')}>♡</IconButton></div></div><div className="filming-content-copy"><p className="eyebrow">촬영지 · 서울 종로</p><h1>운현궁 · 눈물의 여왕</h1><p>tvN · 2024 · EP.03</p><div className="chip-row"><Chip active>현장 일치</Chip><Chip>장면 2개</Chip></div><ScreenSection title="이 장소에서 촬영된 장면"><div className="why-card filming-why-card"><span>공공데이터 위치 확인 · TMDB 작품 정보</span><strong>주인공이 마당을 지나 대화를 나누는 장면이에요.<br />같은 시선 높이에서 처마 끝을 맞춰보세요.</strong><p>TMDB 이미지 · 방송 장면 참고</p></div></ScreenSection><ScreenSection title="촬영 포인트" action="현재 위치"><div className="onsite-fact-grid"><article><span>카메라</span><b>1× 렌즈</b></article><article><span>빛 방향</span><b>오후 3시 추천</b></article></div></ScreenSection></div></main><div className="sticky-actions split filming-content-actions"><ActionButton onClick={() => go('scene-detail')}>구도 맞추기</ActionButton><ActionButton tone="secondary" onClick={() => go('scene-list')}>장면 보기</ActionButton></div></section>;
  if (screen === 'scene-detail') return <section className="phone standard-screen scene-detail-v3"><main className="page-scroll"><div className="scene-detail-copy"><p className="eyebrow">눈물의 여왕 · EP.03</p><h1>마당을 지나던 장면</h1><p>00:24:18 · 운현궁 노안당 앞</p><div className="chip-row"><Chip active>스팟컷</Chip><Chip>1 / 2</Chip></div><ScreenSection title="장면 속 위치와 방향" action="좌표"><p className="scene-detail-description">노안당을 등지고 이로당 방향을 바라본 구도예요.<br />카메라 높이는 눈높이, 1× 렌즈를 권장해요.</p><small>TMDB 스틸 이미지 · 실제 방송 화면과 다를 수 있어요</small></ScreenSection><ScreenSection title="구도 정보" action="방향"><div className="scene-spec-grid"><article><span>렌즈</span><b>동쪽 · 92°</b></article><article><span>높이</span><b>눈높이 1.6m</b></article></div></ScreenSection></div></main><div className="sticky-actions split scene-detail-actions"><ActionButton onClick={() => go('camera-permission')}>구도 맞추기</ActionButton><ActionButton tone="secondary" onClick={() => go('scene-list')}>장면 보기</ActionButton></div></section>;
  if (screen === 'shot-result') return <ShotResultScreen go={go} />;
  if (screen === 'photo-saved') return <CourseComplete go={go} photoSaved />;
  if (screen === 'image-missing') return <section className="phone standard-screen missing-filming-v3"><BackHeader title="촬영지 정보" onBack={() => go('filming-content')} /><main className="page-scroll missing-filming-scroll"><p className="eyebrow">촬영지 · 서울 종로</p><h1>운현궁 · 작품 정보</h1><div className="chip-row"><Chip active>위치 확인</Chip><Chip>정보 1개</Chip></div><ScreenSection title="장면 이미지 준비 중"><div className="why-card"><span>참고 장면을 불러올 수 없어요</span><strong>공공데이터 위치는 정상적으로 확인됐어요</strong><p>TMDB에 제공된 스틸 이미지가 없어<br />현재는 위치와 촬영 방향만 안내해요.</p></div><p className="missing-update-copy">이미지가 추가되면 자동으로 표시돼요</p></ScreenSection><ScreenSection title="대체 안내"><div className="scene-spec-grid"><article><span>방향</span><b>동쪽 · 92°</b></article><article><span>높이</span><b>눈높이</b></article></div></ScreenSection></main><div className="sticky-actions"><ActionButton onClick={() => go('scene-detail')}>위치 안내 보기</ActionButton></div></section>;
  if (screen === 'filming-restricted') return <GuidanceMapState go={go} data={{ kicker: '촬영 안내', title: '현재 위치에서는 촬영할 수 없어요', copy: '문화재 보호와 관람객 안전을 위해 카메라 사용이 제한돼요.', detail: '촬영 가능 지점까지 80m', source: '공공데이터 운영정보 · 오늘 확인', button: '촬영 가능 지점 보기', next: 'scene-detail' }} />;
  if (screen === 'report') return <section className="phone standard-screen report-v3"><BackHeader title="데이터 출처·오류 신고" onBack={() => go('filming-content')} /><main className="page-scroll report-scroll"><p className="eyebrow">운현궁 촬영지 정보</p><h1>어떤 정보가 다른가요?</h1><p className="report-lede">확인할 항목을 선택하면 운영팀이 검토해요.</p><ScreenSection title="현재 사용 중인 출처"><div className="report-source-list"><article><strong>장소 좌표</strong><span>공공데이터포털 · 서울 열린데이터광장</span></article><article><strong>작품·장면 정보</strong><span>TMDB API · 마지막 확인 오늘</span></article></div></ScreenSection><ScreenSection title="신고할 항목"><div className="review-choice-row"><Chip active>위치</Chip><Chip>작품</Chip><Chip>스틸컷</Chip></div></ScreenSection><ScreenSection title="문제 유형"><div className="report-type-grid"><button type="button" className="selected"><strong>정보가 달라요</strong><small>현장 위치가 일치하지 않아요</small></button><button type="button"><strong>촬영 제한</strong><small>운영시간 또는 촬영 규정이 달라요</small></button></div></ScreenSection><ScreenSection title="공개 범위"><div className="review-choice-row"><Chip active>익명</Chip><Chip>연락 가능</Chip><Chip>답변 받기</Chip></div></ScreenSection><StatusBanner tone="blue" title="신고 내용은 출처와 현장을 다시 확인해요" copy="확인 전까지 기존 정보에는 검토 중 표시가 붙어요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('filming-content')}>오류 신고</ActionButton></div></section>;
  const data = filmingState[screen];
  return <section className="phone standard-screen filming-state"><BackHeader title={data[0]} onBack={() => go('onsite')} /><main className="page-scroll"><div className="filming-visual"><img src={images.scene} alt="촬영지 장면" /><span>{data[1]}</span></div><div className="filming-copy"><h1>{data[2]}</h1><p>{data[3]}</p>{screen === 'filming-content' && <div className="content-facts"><p><b>촬영 장소</b>창덕궁 후원 연못가</p><p><b>추천 시간</b>오전 10시-오후 3시</p></div>}{screen === 'report' && <label className="field-label">신고 내용<textarea placeholder="검토할 내용을 적어주세요" /></label>}<ActionButton onClick={() => go(data[4])}>{screen === 'filming-content' ? '장면 목록 보기' : screen === 'report' ? '신고 접수하기' : '계속'}</ActionButton></div></main></section>;
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
  if (screen === 'reviews') return <section className="phone standard-screen reviews-v3"><main className="page-scroll"><div className="reviews-hero"><img src={images.detail} alt="도토리가든" /><div className="detail-controls"><IconButton label="이전" onClick={() => go('place')}>‹</IconButton><IconButton label="저장" onClick={() => go('saved')}>♡</IconButton></div></div><div className="reviews-copy"><p className="eyebrow">안국 · 카페</p><h1>도토리가든</h1><p>매일 10:00-21:00</p><div className="chip-row"><Chip active>지금 여유</Chip><Chip>도보 8분</Chip></div><ScreenSection title="방문자 후기 126"><p className="review-section-lede">사진과 위치가 인증된 후기부터 보여줘요</p><article className="verified-review-card"><p>정원이 생각보다 조용했고 오후 햇빛이 예뻤어요.<br />소금빵은 3시 전에 가는 걸 추천해요.</p><span>유진 · 오늘 · 방문 인증</span><div><button type="button">후기 필터</button><b>최신순</b><small>사진 후기&nbsp; 82</small><small>추천&nbsp; 104</small></div></article></ScreenSection></div></main><div className="sticky-actions split reviews-actions"><ActionButton onClick={() => go('course-conditions')}>코스에 추가</ActionButton><ActionButton tone="secondary" onClick={() => go('write-review')}>후기 남기기</ActionButton></div></section>;
  if (screen === 'review-detail') return <section className="phone standard-screen review-detail-v3"><BackHeader title="방문 인증 후기" onBack={() => go('reviews')} /><main className="page-scroll review-detail-scroll"><p className="eyebrow">추천해요 · 사진 3장</p><h1>오후 햇빛이 정말 예뻤어요</h1><p className="review-author">유진 · 오늘 14:25</p><div className="review-detail-photo"><img src="/assets/figma/intro-visual.png" alt="운현궁 방문 사진" /></div><section className="review-verified-note"><strong>운현궁을 다녀왔어요</strong><span>위치 좌표로 방문이 인증된 후기예요</span></section><p className="review-detail-body">사람이 많지 않아 천천히 보기 좋았어요.<br />처마 쪽에서 찍으면 구도가 예쁘게 나와요.</p><ScreenSection title="후기 정보"><div className="review-info-grid"><article><span>추천</span><b>추천해요</b></article><article><span>방문 당시</span><b>여유</b></article></div></ScreenSection></main><div className="sticky-actions split"><ActionButton onClick={() => go('scene-detail')}>구도 맞추기</ActionButton><ActionButton tone="secondary" onClick={() => go('scene-list')}>장면 보기</ActionButton></div></section>;
  if (screen === 'write-review') return <section className="phone standard-screen write-review-v3"><BackHeader title="후기 작성" onBack={() => go('record')} /><main className="page-scroll write-review-scroll"><p className="eyebrow">운현궁</p><h1>오늘의 장소는 어땠나요?</h1><p className="write-review-lede">경험을 남기면 다음 여행자에게 도움이 돼요.</p><ScreenSection title="평가"><div className="review-setting-list"><button type="button"><span>⌖ 전체 만족도</span><strong>아주 좋았어요&nbsp; ›</strong></button><button type="button"><span>◷ 방문 시간</span><strong>오늘 13:40-14:20&nbsp; ›</strong></button></div></ScreenSection><ScreenSection title="분위기"><div className="review-choice-row"><Chip>한적해요</Chip><Chip active>사진 좋아요</Chip><Chip>혼자 좋아요</Chip></div></ScreenSection><ScreenSection title="후기 내용"><div className="review-content-grid"><button type="button" className="selected"><strong>공간이 차분하고</strong><small>오후 햇빛이 예뻤어요</small></button><button type="button"><strong>사진 추가</strong><small>최대 5장까지 올릴 수 있어요</small></button></div></ScreenSection><ScreenSection title="공개 범위"><div className="review-choice-row"><Chip>전체</Chip><Chip active>팔로워</Chip><Chip>나만 보기</Chip></div></ScreenSection><StatusBanner tone="blue" title="위치와 방문 시간은 자동으로 기록돼요" copy="작성 후에도 수정하거나 삭제할 수 있어요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('reviews')}>후기 등록</ActionButton></div></section>;
  const [title, heading, copy, next] = recordStates[screen];
  const isReviewForm = screen === 'write-review';
  return <section className="phone standard-screen record-screen"><BackHeader title={title} onBack={() => go(screen === 'record' ? 'my' : 'record')} /><main className="page-scroll"><div className="record-cover"><img src={screen === 'reviews' || screen === 'review-detail' ? images.cafe : images.completePhoto} alt="" /></div><div className="record-copy"><p className="eyebrow">2026. 08. 09 · 안국동</p><h1>{heading}</h1><p>{copy}</p>{screen === 'record' && <div className="record-stats"><span><b>4</b> 방문</span><span><b>4.2km</b> 도보</span><span><b>2:18</b> 시간</span></div>}{screen === 'saved-courses' && <div className="saved-course-list"><PlaceRow place={{ name: '안국동 느린 오후', meta: '2시간 30분 · 장소 4곳', image: images.myMap }} onClick={() => go('route-map')} /><PlaceRow place={{ name: '비 온 뒤 서촌', meta: '1시간 40분 · 장소 3곳', image: images.scene }} onClick={() => go('route-map')} /></div>}{isReviewForm && <><div className="rating-row"><span>★</span><span>★</span><span>★</span><span>★</span><span>☆</span></div><label className="field-label">후기<textarea placeholder="좋았던 장소나 기억에 남는 순간을 적어주세요" /></label></>}{screen === 'reviews' && <div className="review-list"><article><b>햇빛 좋은 날에 걷기 좋았어요</b><p>천천히 둘러봐도 2시간이면 충분했고 정원이 특히 좋았습니다.</p><span>유진 · 2026.08.09</span></article><article><b>카페와 궁궐을 함께 보기 좋아요</b><p>동선이 자연스러워서 길을 헤매지 않았어요.</p><span>지민 · 2026.08.06</span></article></div>}<ActionButton onClick={() => go(next)}>{isReviewForm ? '후기 등록하기' : screen === 'reviews' ? '후기 자세히 보기' : screen === 'record-detail' ? '후기 남기기' : '계속 보기'}</ActionButton></div></main></section>;
}

const settingsState = {
  'location-permission': ['위치 권한', '현재 위치를 허용할까요?', '내 주변 장소와 이동 경로를 더 정확하게 안내할 수 있어요.', '허용하기', 'my'],
  notifications: ['알림 설정', '여행 알림', '코스 출발, 장소 혼잡, 저장한 팝업 소식을 받을 수 있어요.', '알림 저장', 'my'],
  'profile-edit': ['프로필 편집', '유진', '여행 기록에 표시될 이름을 수정할 수 있어요.', '저장하기', 'my'],
  privacy: ['개인정보 · 위치 관리', '위치 기록 관리', '방문 확인을 위한 위치 기록을 안전하게 관리할 수 있어요.', '변경사항 저장', 'my'],
  'app-permissions': ['앱 권한', '필요한 순간에만 사용해요', '위치, 카메라, 알림 권한을 직접 관리할 수 있어요.', '설정 열기', 'my'],
  support: ['공지 · 고객 지원', '무엇을 도와드릴까요?', '공지사항, 자주 묻는 질문, 문의하기를 확인할 수 있어요.', '문의하기', 'my'],
  loading: ['불러오는 중', '여행 정보를 준비하고 있어요', '잠시만 기다리면 저장한 장소와 코스를 불러올게요.', '새로고침', 'my'],
  'server-error': ['일시적인 오류', '정보를 불러오지 못했어요', '잠시 후 다시 시도해주세요. 저장된 기록은 안전해요.', '다시 시도', 'my'],
};

function MyScreen({ screen, go }) {
  if (screen === 'location-permission') return <MapPermissionPrompt go={go} title="위치 권한이 필요해요" copy="현재 위치와 도착 감지를 위해 허용해주세요." detail={['앱 사용 중에만 위치 사용', '설정에서 언제든 변경할 수 있어요.']} action="위치 권한 허용" next="map" />;
  if (screen === 'loading') return <MapLoadingPrompt go={go} />;
  if (screen === 'notifications') return <section className="phone standard-screen notifications-v3"><main className="page-scroll notifications-scroll"><header className="settings-page-heading"><p>알림 설정</p><span>여행 중 알림</span><h1>필요한 순간만 알려드릴게요</h1><small>혼잡 · 주변 장소 · 도착 알림을 선택할 수 있어요.</small></header><ScreenSection title="기본 알림"><div className="settings-row-list"><button type="button"><span>혼잡 변화</span><b>대중교통과 장소 혼잡이 높아질 때&nbsp; ›</b></button><button type="button"><span>주변 장소 추천</span><b>동선 근처에 볼거리가 있을 때&nbsp; ›</b></button></div></ScreenSection><ScreenSection title="알림 빈도"><div className="settings-segment"><button type="button">필수만</button><button type="button" className="selected">적당히</button><button type="button">모두</button></div></ScreenSection><ScreenSection title="도착 알림"><div className="settings-segment"><button type="button" className="selected">진동 켜기</button><button type="button">음성 안내</button></div><p className="settings-hint">장소 100m 이내에서 알려드려요</p></ScreenSection><ScreenSection title="방해 금지 시간"><div className="settings-segment"><button type="button">없음</button><button type="button" className="selected">22-08시</button><button type="button">직접 설정</button></div></ScreenSection><p className="settings-bottom-copy">운영시간 변경도 함께 알려드려요<br /><span>알림은 언제든 이 화면에서 바꿀 수 있어요.</span></p></main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>설정 저장</ActionButton></div></section>;
  if (screen === 'profile-edit') return <section className="phone standard-screen profile-edit-v3"><BackHeader title="프로필 편집" onBack={() => go('my')} /><main className="page-scroll profile-edit-scroll"><header className="profile-edit-heading"><p className="eyebrow">내 정보</p><h1>유진님의 프로필</h1><span>다른 사용자에게 보이는 정보를 관리해요.</span></header><ScreenSection title="기본 정보"><div className="review-setting-list"><button type="button"><span>⌖ 닉네임</span><strong>유진&nbsp; ›</strong></button><button type="button"><span>◷ 한 줄 소개</span><strong>서울의 골목과 촬영지를 걷고 있어요&nbsp; ›</strong></button></div></ScreenSection><ScreenSection title="관심 장소"><div className="review-choice-row"><Chip>촬영지</Chip><Chip active>팝업</Chip><Chip>카페</Chip></div></ScreenSection><ScreenSection title="프로필 공개"><div className="profile-visibility-grid"><button type="button" className="selected"><strong>전체 공개</strong><small>후기와 저장 목록을 보여줘요</small></button><button type="button"><strong>비공개</strong><small>내 활동을 나만 볼 수 있어요</small></button></div></ScreenSection><ScreenSection title="계정 연결"><div className="review-choice-row"><Chip>카카오</Chip><Chip active>Apple</Chip><Chip>이메일</Chip></div></ScreenSection><StatusBanner tone="blue" title="닉네임은 30일에 한 번 바꿀 수 있어요" copy="프로필 사진은 최대 5MB까지 등록할 수 있어요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>변경사항 저장</ActionButton></div></section>;
  if (screen === 'privacy') return <section className="phone standard-screen privacy-v3"><BackHeader title="개인정보·위치 기록" onBack={() => go('my')} /><main className="page-scroll settings-detail-scroll"><header className="settings-page-heading"><p>데이터 관리</p><span>여행 기록</span><h1>내 위치 기록을 관리해요</h1><small>필요한 순간에만 수집하고, 보관 기간을 직접 정할 수 있어요.</small></header><ScreenSection title="위치 기록"><div className="settings-row-list detail-row-list"><button type="button"><span><strong>여행 중 위치 기록</strong><small>코스 진행 중에만 수집</small></span><b className="row-state active">켜짐</b></button><button type="button"><span><strong>사진 좌표 인증</strong><small>방문 인증할 때만 사용</small></span><b className="row-state active">켜짐</b></button></div></ScreenSection><ScreenSection title="보관 기간"><div className="settings-segment"><button type="button">30일</button><button type="button" className="selected">90일</button><button type="button">1년</button></div></ScreenSection><ScreenSection title="공개 설정"><div className="settings-segment"><button type="button" className="selected">나만</button><button type="button">친구</button><button type="button">전체</button></div></ScreenSection><ScreenSection title="기록 다운로드"><div className="settings-row-list detail-row-list"><button type="button"><span><strong>여행 기록 내보내기</strong><small>사진과 이동 기록을 파일로 받아요</small></span><b className="row-chevron">›</b></button><button type="button"><span><strong>전체 위치 기록 삭제</strong><small>삭제하면 되돌릴 수 없어요</small></span><b className="row-danger">삭제</b></button></div></ScreenSection><StatusBanner tone="blue" title="위치 기록은 추천과 도착 감지에만 사용해요" copy="설정 변경은 현재 진행 중인 코스부터 적용돼요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>변경사항 저장</ActionButton></div></section>;
  if (screen === 'app-permissions') return <section className="phone standard-screen permissions-v3"><BackHeader title="앱 권한 설정" onBack={() => go('my')} /><main className="page-scroll settings-detail-scroll"><header className="settings-page-heading"><p>권한 관리</p><span>기능별 설정</span><h1>필요한 순간에만 사용해요</h1><small>각 권한은 여행 기능에 맞춰 언제든 바꿀 수 있어요.</small></header><ScreenSection title="현재 권한"><div className="settings-row-list detail-row-list"><button type="button"><span><strong>위치</strong><small>길 안내와 도착 감지</small></span><b className="row-state active">허용됨</b></button><button type="button"><span><strong>카메라</strong><small>촬영지 구도 맞추기</small></span><b className="row-state">허용 안 함</b></button><button type="button"><span><strong>알림</strong><small>혼잡 변화와 도착 안내</small></span><b className="row-state active">허용됨</b></button><button type="button"><span><strong>사진</strong><small>방문 인증 사진 저장</small></span><b className="row-state">선택 안 함</b></button></div></ScreenSection><ScreenSection title="권한 사용 방식"><div className="permission-note-grid"><article><strong>위치</strong><span>코스 시작부터 종료까지</span></article><article><strong>카메라</strong><span>촬영 화면을 열었을 때만</span></article></div></ScreenSection><StatusBanner tone="blue" title="권한이 없어도 장소 탐색은 계속할 수 있어요" copy="권한이 필요한 기능을 누르면 다시 요청할게요." /></main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>시스템 설정 열기</ActionButton></div></section>;
  if (screen === 'support') return <section className="phone standard-screen support-v3"><BackHeader title="공지·문의" onBack={() => go('my')} /><main className="page-scroll support-scroll"><header className="support-heading"><span>?</span><p>고객센터</p><h1>무엇을 도와드릴까요?</h1><small>공지와 자주 묻는 질문을 빠르게 확인할 수 있어요.</small></header><div className="support-stats"><button type="button"><strong>2</strong><span>공지</span></button><button type="button"><strong>24</strong><span>FAQ</span></button><button type="button"><strong>1:1</strong><span>문의</span></button></div><ScreenSection title="최근 공지" action="전체보기"><button type="button" className="support-notice-card"><span><b>서비스 안내</b><small>2026.08.08</small></span><strong>촬영지 이미지 제공 정책 안내</strong><p>장면 이미지와 현장 정보의 출처를 더 투명하게 표시해요.</p><i>›</i></button></ScreenSection><ScreenSection title="빠른 도움"><div className="support-help-list"><button type="button"><span><strong>코스가 멈췄어요</strong><small>이동 중 문제가 생겼을 때</small></span><i>›</i></button><button type="button"><span><strong>장소 정보가 달라요</strong><small>운영시간과 위치를 알려주세요</small></span><i>›</i></button><button type="button"><span><strong>내 기록을 찾고 싶어요</strong><small>저장한 코스와 사진 확인</small></span><i>›</i></button></div></ScreenSection><p className="support-footnote">평일 10:00-18:00에 순서대로 답변드려요.</p></main><div className="sticky-actions"><ActionButton onClick={() => go('my')}>1:1 문의하기</ActionButton></div></section>;
  if (screen === 'server-error') return <section className="phone server-error-v3"><MapStage variant="home"><div className="map-top-fade" /><header className="server-map-heading"><p>안국동 · 내 주변</p><h1>오늘, 어디로 걸어볼까요?</h1><button type="button"><span><SearchIcon /></span>장소 · 지역 · 테마 검색</button><div><Chip active>전체</Chip><Chip>요즘</Chip><Chip>팝업</Chip><Chip>촬영지</Chip></div></header><div className="server-error-dim" /><BottomSheet className="server-error-sheet"><button className="server-error-close" type="button" onClick={() => go('map')} aria-label="닫기">×</button><h1>정보를 불러오지 못했어요</h1><p>서버 연결이 원활하지 않아 최신 정보를 표시할 수 없어요.</p><ActionButton tone="secondary" onClick={() => go('my')}>마지막으로 저장된 정보 보기</ActionButton><small>잠시 후 다시 시도하면 정상적으로 연결될 수 있어요.</small><ActionButton onClick={() => go('map')}>다시 시도</ActionButton></BottomSheet></MapStage></section>;
  if (screen !== 'my') {
    const [title, heading, copy, action, next] = settingsState[screen];
    const isLoading = screen === 'loading';
    return <section className="phone standard-screen system-screen"><BackHeader title={title} onBack={() => go('my')} /><main className="page-scroll centered-state">{isLoading ? <BrandLoading /> : <div className={`system-icon ${screen === 'server-error' ? 'error' : ''}`}>{screen === 'location-permission' ? '⌖' : screen === 'profile-edit' ? 'Y' : '⚙'}</div>}<h1>{heading}</h1><p>{copy}</p>{screen === 'notifications' && <div className="switch-list"><label>코스 출발 <input type="checkbox" defaultChecked /></label><label>현장 혼잡 <input type="checkbox" defaultChecked /></label><label>새로운 팝업 <input type="checkbox" /></label></div>}{screen === 'profile-edit' && <label className="field-label">닉네임<input defaultValue="유진" /></label>}{screen === 'privacy' && <div className="switch-list"><label>방문 기록 저장 <input type="checkbox" defaultChecked /></label><label>정확한 위치 사용 <input type="checkbox" defaultChecked /></label></div>}{screen === 'app-permissions' && <div className="permission-rows"><p><span>위치</span><b>허용됨</b></p><p><span>카메라</span><b>허용 안 함</b></p><p><span>알림</span><b>허용됨</b></p></div>}{screen === 'support' && <div className="support-list"><button type="button">공지사항 <span>›</span></button><button type="button">자주 묻는 질문 <span>›</span></button><button type="button">문의 내역 <span>›</span></button></div>}<ActionButton onClick={() => go(next)}>{action}</ActionButton></main></section>;
  }
  return <section className="phone standard-screen tab-screen my-screen"><main className="page-scroll my-scroll"><header className="my-title"><h1>MY</h1></header><section className="profile-hero"><div className="profile-row"><span className="avatar">Y</span><div><h2>유진</h2><p>이번 달 7곳을 걸었어요</p></div></div><div className="profile-stats"><span><b>3</b>내 코스</span><span><b>18</b>저장</span><span><b>6</b>후기</span></div></section><ScreenSection title="내 코스"><button type="button" className="my-course-card" onClick={() => go('active-course')}><VWorldMap ariaLabel="안국동 코스 지도" interactive={false} style={{ width: '100%', height: 122 }} /><span><strong>안국에서 성수까지, 여름 하루</strong><small>4곳 · 5시간 10분 · 8월 3일</small></span></button></ScreenSection><ScreenSection title="내 활동"><div className="activity-grid"><button type="button" onClick={() => go('saved-courses')}><span>저장한 장소</span><strong>18</strong></button><button type="button" onClick={() => go('reviews')}><span>내 후기</span><strong>6</strong></button></div></ScreenSection></main><BottomNav active="my" onNavigate={(tab) => go(rootRoutes[tab])} /></section>;
}

function AppScreenFrame({ children, go, hideHeader = false }) {
  return (
    <div className="screen-frame">
      {!hideHeader && <AppHeader onNotifications={() => go('notifications')} onProfile={() => go('my')} />}
      <div className={`screen-frame-content${hideHeader ? '' : ' with-app-header'}`}>{children}</div>
    </div>
  );
}

function RenderScreen({ screen, id, go }) {
  let renderedScreen;
  if (routeGroups.auth.includes(screen)) renderedScreen = <AuthScreen screen={screen} go={go} />;
  else if (screen === 'map') renderedScreen = <MapHome go={go} />;
  else if (screen === 'explore') renderedScreen = <ExploreScreen go={go} />;
  else if (screen === 'place') renderedScreen = <PlaceDetail go={go} placeId={id} />;
  else if (screen === 'event-detail') renderedScreen = <EventDetail go={go} eventId={id} />;
  else if (screen === 'search' || screen === 'search-empty') renderedScreen = <SearchResults screen={screen} go={go} />;
  else if (screen === 'saved') renderedScreen = <SavedConfirmation go={go} />;
  else if (screen === 'trending' || screen === 'filming-locations' || screen === 'popups') renderedScreen = <CollectionScreen screen={screen} go={go} />;
  else if (screen === 'live-talk') renderedScreen = <LiveTalk go={go} />;
  else if (screen === 'course-conditions') renderedScreen = <CourseConditions go={go} />;
  else if (screen === 'basket' || screen === 'basket-natural' || screen === 'basket-glass') renderedScreen = <CourseBasket screen={screen} go={go} />;
  else if (screen === 'compare' || screen === 'route-map') renderedScreen = <CourseCompare screen={screen} go={go} />;
  else if (routeGroups.travel.includes(screen)) renderedScreen = <TravelScreen screen={screen} go={go} />;
  else if (routeGroups.filming.includes(screen)) renderedScreen = <FilmingScreen screen={screen} go={go} id={id} />;
  else if (routeGroups.record.includes(screen)) renderedScreen = <RecordScreen screen={screen} go={go} />;
  else renderedScreen = <MyScreen screen={screen} go={go} />;

  return <AppScreenFrame go={go} hideHeader={screen === 'filming-work' || screen === 'event-detail'}>{renderedScreen}</AppScreenFrame>;
}

export default function ProductFlow() {
  const [{ screen, id }, setRoute] = useState(readHash);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const handleHashChange = () => setRoute(readHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const go = (next, nextId) => {
    if (!routes.has(next)) return;
    window.location.hash = nextId ? `/${next}/${nextId}` : `/${next}`;
    setRoute({ screen: next, id: nextId || null });
  };

  const pageMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, transform: 'perspective(1300px) translateY(18px) rotateX(3deg) rotateY(-1.5deg) translateZ(-22px) scale(.985)' },
        animate: { opacity: 1, transform: 'perspective(1300px) translateY(0px) rotateX(0deg) rotateY(0deg) translateZ(0px) scale(1)' },
        transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] },
      };

  return <main className="app-shell"><motion.div className="screen-transition" data-screen={screen} key={screen} {...pageMotion}><RenderScreen screen={screen} id={id} go={go} /></motion.div></main>;
}
