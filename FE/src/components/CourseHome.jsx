import { useRef, useState } from 'react';
import {
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
} from 'lucide-react';
import BottomNav from './BottomNav';
import {
  completedCourses,
  publicCourses,
  scheduledCourses,
} from './courseHomeModel';

const personalTabs = [
  { id: 'scheduled', label: '예정' },
  { id: 'completed', label: '완료' },
];

const personalCourses = {
  scheduled: scheduledCourses,
  completed: completedCourses,
};

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
        aria-label={`${course.title}, ${course.dateLabel}, ${course.area}, ${course.placeCount}곳, ${course.duration}`}
        onClick={onSelect}
      >
        <img src={course.image} alt={`${course.title} 대표 이미지`} />
        <div className="place-row-copy">
          <span className="place-row-labels">
            <span><StatusIcon aria-hidden="true" size={14} />{course.dateLabel}</span>
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

function PublicCourseCard({ course, onSelect }) {
  return (
    <div className="course-home-public-item" role="listitem">
      <button
        type="button"
        className="place-card-v3 course-home-public-card"
        aria-label={`${course.title}, ${course.author}`}
        onClick={onSelect}
      >
        <div className="place-card-image">
          <img src={course.image} alt={`${course.title} 대표 이미지`} />
        </div>
        <div className="place-card-copy">
          <span className="place-card-kicker">{course.author}</span>
          <h3>{course.title}</h3>
          <p>{course.placeCount}곳 · {course.duration}</p>
          <span className="course-home-save-count">
            <Bookmark aria-hidden="true" size={14} />
            저장 {course.saveCount}
          </span>
        </div>
      </button>
    </div>
  );
}

export function CourseHome({ go, onNavigate }) {
  const [activeTab, setActiveTab] = useState('scheduled');
  const tabRefs = useRef({});
  const courses = personalCourses[activeTab];

  const createCourse = () => go('course-conditions');
  const selectPersonalCourse = (course) => {
    go(course.status === 'completed' ? 'record-detail' : 'route-map');
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
            <div className="course-home-tabs" role="tablist" aria-label="내 코스 상태">
              {personalTabs.map((tab, index) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={(element) => { tabRefs.current[tab.id] = element; }}
                    type="button"
                    className={`ui-chip ${isActive ? 'is-active' : ''}`}
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
              {courses.length === 0 ? (
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
              {publicCourses.map((course) => (
                <PublicCourseCard
                  key={course.id}
                  course={course}
                  onSelect={() => go('route-map')}
                />
              ))}
            </div>
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
