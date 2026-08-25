import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
} from 'lucide-react';
import BottomNav from './BottomNav';
import CourseActionButton from './CourseActionButton';
import VWorldMap from './VWorldMap';
import {
  addKakaoPlaceToCourseBasket,
  addPlaceToCourseBasket,
  fetchCourses,
  fetchKakaoPlaces,
  fetchPlaces,
  getAccessToken,
} from '../api/client.js';
import {
  publicCourses,
  visiblePublicCourses,
} from './courseHomeModel';
import { importPublicCourseForCreation } from './publicCourseImport.js';

const personalTabs = [
  { id: 'scheduled', label: '예정' },
  { id: 'completed', label: '완료' },
];

function formatScheduledTime(value) {
  const normalizedValue = String(value ?? '').trim();
  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(normalizedValue)) return null;
  const [hourValue, minuteValue] = normalizedValue.split(':').map(Number);
  if (!Number.isInteger(hourValue) || !Number.isInteger(minuteValue)) return null;

  const period = hourValue < 12 ? '오전' : '오후';
  const hour = hourValue % 12 || 12;
  return `${period} ${hour}:${String(minuteValue).padStart(2, '0')}`;
}

function scheduledCourseView(course) {
  const date = course?.serviceDate ? new Date(`${course.serviceDate}T00:00:00`) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(date)
    : '날짜 정보 없음';
  const duration = Number(course?.totalDurationMinutes);
  const scheduledStart = formatScheduledTime(course?.scheduledStart);
  const rawTitle = String(course?.title ?? '').trim();
  return {
    id: course.id,
    title: rawTitle ? (rawTitle.endsWith('코스') ? rawTitle : `${rawTitle} 코스`) : `${course.firstPlaceName || '나만의'} 코스`,
    dateLabel,
    scheduleLabel: scheduledStart ? `${dateLabel} · ${scheduledStart} 출발` : dateLabel,
    district: '서울',
    area: course.firstPlaceName || '코스',
    placeCount: course.stopCount || 0,
    duration: Number.isFinite(duration) ? `${Math.floor(duration / 60) ? `${Math.floor(duration / 60)}시간 ` : ''}${duration % 60 ? `${duration % 60}분` : ''}`.trim() : '시간 정보 없음',
    image: course.firstPlaceImageUrl || null,
    routeCoordinates: Array.isArray(course?.routeCoordinates)
      ? course.routeCoordinates
        .map((point) => [Number(point?.longitude), Number(point?.latitude)])
        .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))
      : [],
    status: 'scheduled',
  };
}

function CourseRouteThumbnail({ course }) {
  const coordinates = course.routeCoordinates;
  const routeLegs = coordinates.slice(1).map((coordinate, index) => ({
    mode: 'WALK',
    geometry: { coordinates: [coordinates[index], coordinate] },
  }));

  if (coordinates.length < 2) {
    return <span className="course-home-image-fallback" aria-hidden="true">{course.area.slice(0, 1)}</span>;
  }

  return (
    <div className="course-home-route-thumbnail" aria-label={`${course.title} 전체 동선 지도`}>
      <VWorldMap
        ariaLabel={`${course.title} 전체 동선 지도`}
        interactive={false}
        showCongestionAreas={false}
        routeAppearance="focus"
        routeLegs={routeLegs}
        routeFitCoordinates={coordinates}
        routeFitKey={`course-home-${course.id}`}
        routeFitPadding={[16, 16, 16, 16]}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

function completedCourseView(course) {
  return { ...scheduledCourseView(course), status: 'completed' };
}

function EmptyCourseState({ status, onCreate }) {
  const copy = status === 'scheduled'
    ? '예정된 코스가 없어요.'
    : '완료한 코스가 아직 없어요.';

  return (
    <div className="course-home-empty" role="status">
      <p>{copy}</p>
      <button type="button" className="ui-button secondary" onClick={onCreate}>
        새 코스 만들기
      </button>
    </div>
  );
}

function PersonalCourseRow({ course, onSelect }) {
  const StatusIcon = course.status === 'completed' ? CheckCircle2 : CalendarDays;

  return (
    <div className="course-home-list-item" role="listitem">
      <button
        type="button"
        className="place-row course-home-row"
        aria-label={`${course.title}, ${course.scheduleLabel}, ${course.area}, ${course.placeCount}곳, ${course.duration}`}
        onClick={onSelect}
      >
        <CourseRouteThumbnail course={course} />
        <div className="place-row-copy">
          <span className="place-row-labels">
            <span><StatusIcon aria-hidden="true" size={14} />{course.scheduleLabel}</span>
            <span>{course.status === 'completed' ? '완료' : '예정'}</span>
          </span>
          <h3>{course.title}</h3>
          <p>
            <MapPin aria-hidden="true" size={13} />
            {course.district} · {course.area} · {course.placeCount}곳
            <Clock3 aria-hidden="true" size={13} />
            {course.duration}
          </p>
        </div>
        <ChevronRight className="row-next" aria-hidden="true" size={20} />
      </button>
    </div>
  );
}

function normalizePlaceName(value) {
  return String(value ?? '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

async function addPublicCoursePlace(placeName, signal) {
  const normalizedName = normalizePlaceName(placeName);
  let internalPlaces = [];
  try {
    const internalResult = await fetchPlaces({ keyword: placeName, size: 10, signal });
    internalPlaces = Array.isArray(internalResult?.content) ? internalResult.content : [];
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error;
  }
  const internalPlace = internalPlaces.find((place) => normalizePlaceName(place?.name) === normalizedName);
  if (internalPlace?.id !== undefined && internalPlace?.id !== null) {
    return addPlaceToCourseBasket(internalPlace.id, { signal });
  }

  const kakaoPlaces = await fetchKakaoPlaces(placeName, { signal });
  const kakaoPlace = (Array.isArray(kakaoPlaces) ? kakaoPlaces : []).find(
    (place) => normalizePlaceName(place?.name) === normalizedName,
  ) || kakaoPlaces?.[0];
  if (!kakaoPlace) throw new Error(`${placeName} 장소를 찾지 못했어요.`);
  return addKakaoPlaceToCourseBasket(kakaoPlace, { signal });
}

function PublicCourseRoutePreview({ course }) {
  const coordinates = Array.isArray(course.routeCoordinates) ? course.routeCoordinates : [];
  const routeLegs = coordinates.slice(1).map((coordinate, index) => ({
    mode: 'WALK',
    geometry: { coordinates: [coordinates[index], coordinate] },
  }));

  return (
    <div className="course-home-public-map" aria-label={`${course.title} 코스 동선 미리보기`}>
      <VWorldMap
        ariaLabel={`${course.title} 코스 동선 미리보기`}
        interactive={false}
        showCongestionAreas={false}
        routeAppearance="focus"
        routeLegs={routeLegs}
        routeFitCoordinates={coordinates}
        routeFitKey={`public-course-${course.id}`}
        routeFitPadding={[30, 30, 30, 30]}
        style={{ width: '100%', height: '100%' }}
      />
      <ol className="course-home-public-map-stops" aria-hidden="true">
        {course.places.map((place, index) => <li key={`${course.id}-${place.name}`}><span>{index + 1}</span></li>)}
      </ol>
    </div>
  );
}

function PublicCourseCard({ course, importStatus, onImport }) {
  const isImporting = importStatus === 'loading';

  return (
    <article className="course-home-public-item" role="listitem">
      <div className="course-home-public-card">
        <PublicCourseRoutePreview course={course} />
        <div className="course-home-public-copy">
          <span className="course-home-public-author">{course.author}님의 코스</span>
          <h3>{course.title}</h3>
          <p>{course.placeCount}곳 · {course.duration} · {course.distance}</p>
          <ol className="course-home-public-places" aria-label={`${course.title} 장소 순서`}>
            {course.places.map((place, index) => (
              <li key={`${course.id}-${place.name}`}>
                <span>{index + 1}</span>
                <div><strong>{place.name}</strong><small>{place.category}</small></div>
              </li>
            ))}
          </ol>
          <CourseActionButton
            disabled={isImporting || importStatus === 'blocked'}
            aria-busy={isImporting || undefined}
            onClick={onImport}
          >
            {isImporting ? '가져오는 중…' : '내 코스로 가져오기'}
          </CourseActionButton>
        </div>
      </div>
    </article>
  );
}

export function CourseHome({ go, onNavigate, onAuthRequired, onBasketAdded, onBasketRefresh, onCreateCourse }) {
  const [activeTab, setActiveTab] = useState('scheduled');
  const [courseState, setCourseState] = useState({ active: null, scheduled: [], completed: [], status: 'loading' });
  const [importState, setImportState] = useState({ courseId: null, status: 'idle', error: null });
  const importControllerRef = useRef(null);
  const tabRefs = useRef({});
  const courses = activeTab === 'scheduled' ? courseState.scheduled : courseState.completed;
  const sharedCourses = visiblePublicCourses(publicCourses);

  const loadCourses = useCallback(() => {
    const controller = new AbortController();
    setCourseState((current) => ({ ...current, status: 'loading' }));
    Promise.all([
      fetchCourses({ status: 'READY', signal: controller.signal }),
      fetchCourses({ status: 'IN_PROGRESS', signal: controller.signal }),
      fetchCourses({ status: 'COMPLETED', signal: controller.signal }),
    ]).then(([scheduled, active, completed]) => {
      if (controller.signal.aborted) return;
      setCourseState({
        scheduled: (Array.isArray(scheduled) ? scheduled : []).map(scheduledCourseView),
        active: Array.isArray(active) && active.length > 0 ? scheduledCourseView(active[0]) : null,
        completed: (Array.isArray(completed) ? completed : []).map(completedCourseView),
        status: 'success',
      });
    }).catch((error) => {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      if (error?.status === 401) onAuthRequired?.({ screen: 'course-home' });
      else setCourseState((current) => ({ ...current, status: 'error' }));
    });
    return () => controller.abort();
  }, [onAuthRequired]);

  useEffect(() => loadCourses(), [loadCourses]);

  useEffect(() => () => importControllerRef.current?.abort(), []);

  const createCourse = () => go('course-conditions');
  const importPublicCourse = async (course) => {
    if (importState.status === 'loading') return;
    if (!getAccessToken()) {
      onAuthRequired?.({ screen: 'course-home' });
      return;
    }

    const controller = new AbortController();
    importControllerRef.current = controller;
    setImportState({ courseId: course.id, status: 'loading', error: null });
    try {
      await importPublicCourseForCreation({
        course,
        addPlace: addPublicCoursePlace,
        onPlaceAdded: onBasketAdded,
        onBasketRefresh,
        onCreateCourse: (importedItems) => {
          setImportState({ courseId: course.id, status: 'success', error: null });
          if (onCreateCourse) onCreateCourse(importedItems);
          else go('course-conditions');
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return;
      if (error?.status === 401) {
        onAuthRequired?.({ screen: 'course-home' });
        return;
      }
      setImportState({ courseId: course.id, status: 'error', error: '일부 장소를 가져오지 못했어요. 다시 누르면 이어서 가져올 수 있어요.' });
    } finally {
      if (importControllerRef.current === controller) importControllerRef.current = null;
    }
  };
  const selectPersonalCourse = (course) => {
    go('saved-course-preview', course.id);
  };

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    tabRefs.current[tabId]?.focus();
  };

  const handleTabKeyDown = (event, currentIndex) => {
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex += 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex -= 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = personalTabs.length - 1;
    if (nextIndex === currentIndex) return;

    event.preventDefault();
    const nextTab = personalTabs[(nextIndex + personalTabs.length) % personalTabs.length];
    selectTab(nextTab.id);
  };

  return (
    <section className="phone standard-screen course-home-screen" aria-label="코스 홈">
      <main className="page-scroll course-home-scroll">
        <div className="course-home-content">
          <section className="content-section course-home-personal" aria-labelledby="course-home-personal-title">
            <header className="my-title">
              <h1 id="course-home-personal-title">내 코스</h1>
              <button
                type="button"
                className="icon-button"
                aria-label="새 코스 만들기"
                title="새 코스 만들기"
                onClick={createCourse}
              >
                <Plus aria-hidden="true" size={20} />
              </button>
            </header>
            {courseState.active && (
              <section className="course-home-active" aria-label="진행 중인 코스">
                <div>
                  <span>진행 중</span>
                  <h2>{courseState.active.title}</h2>
                  <p>{courseState.active.placeCount}곳 · {courseState.active.duration}</p>
                </div>
                <button type="button" onClick={() => go('active-course', courseState.active.id)}>이어가기 <ChevronRight aria-hidden="true" size={16} /></button>
              </section>
            )}
            <div className="detail-tabs course-home-tabs" role="tablist" aria-label="내 코스 상태">
              {personalTabs.map((tab, index) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={(element) => { tabRefs.current[tab.id] = element; }}
                    type="button"
                    className={isActive ? 'is-active' : ''}
                    role="tab"
                    id={`course-home-tab-${tab.id}`}
                    aria-selected={isActive}
                    aria-controls={`course-home-panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => selectTab(tab.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div
              className="course-home-panel"
              id={`course-home-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`course-home-tab-${activeTab}`}
              tabIndex={0}
            >
              {activeTab === 'scheduled' && courseState.status === 'loading' ? (
                <p className="course-home-state" role="status">예정 코스를 불러오는 중이에요.</p>
              ) : activeTab === 'scheduled' && courseState.status === 'error' ? (
                <div className="course-home-state" role="alert"><span>코스를 불러오지 못했어요.</span><button type="button" onClick={loadCourses}>다시 시도</button></div>
              ) : courses.length === 0 ? (
                <EmptyCourseState status={activeTab} onCreate={createCourse} />
              ) : (
                <div className="course-home-list" role="list" aria-label={`${activeTab === 'scheduled' ? '예정' : '완료'} 코스 목록`}>
                  {courses.map((course) => (
                    <PersonalCourseRow
                      key={course.id}
                      course={course}
                      onSelect={() => selectPersonalCourse(course)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="content-section course-home-public" aria-labelledby="course-home-public-title">
            <div className="section-title-row">
              <h2 id="course-home-public-title">다른 사람의 코스</h2>
            </div>
            <div className="horizontal-cards course-home-public-list" role="list" aria-label="공개 코스 목록">
              {sharedCourses.map((course) => (
                <PublicCourseCard
                  key={course.id}
                  course={course}
                  importStatus={importState.courseId === course.id ? importState.status : importState.status === 'loading' ? 'blocked' : 'idle'}
                  onImport={() => importPublicCourse(course)}
                />
              ))}
            </div>
            {importState.error && <p className="course-home-import-error" role="alert">{importState.error}</p>}
          </section>
        </div>
      </main>

      {typeof onNavigate === 'function' && (
        <BottomNav active="course" onNavigate={onNavigate} />
      )}
    </section>
  );
}

export default CourseHome;
