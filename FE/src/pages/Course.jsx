import { useState } from 'react';
import BottomNav from '../components/BottomNav';

const courses = [
  { id: 'morning', title: '안국동 느린 오전', detail: '도토리가든 · 북촌 · 창덕궁', time: '2시간 30분', places: 3, tone: 'sage' },
  { id: 'seongsu', title: '성수 전시 산책', detail: '블루 모먼트 · 서울숲 · 카페 레이어드', time: '3시간', places: 4, tone: 'blue' },
  { id: 'night', title: '을지로 저녁 한 바퀴', detail: '인현시장 · 을지다방 · 청계천', time: '2시간', places: 3, tone: 'coral' },
];

export default function Course({ onNavigate }) {
  const [saved, setSaved] = useState(['morning', 'seongsu']);
  const [notice, setNotice] = useState('');

  const toggleSave = (course) => {
    setSaved((current) => (
      current.includes(course.id)
        ? current.filter((id) => id !== course.id)
        : [...current, course.id]
    ));
    setNotice(currentNotice => currentNotice === course.id ? '' : course.id);
  };

  return (
    <section className="phone course-page" aria-label="ddemachim 코스">
      <div className="scroll-content course-scroll-content">
        <header className="page-header course-header">
          <p className="eyebrow">WALKING COURSE</p>
          <h1>오늘의 코스</h1>
          <p>지금의 기분과 동선에 맞춰 골라보세요.</p>
        </header>

        <section className="course-feature" aria-labelledby="course-feature-title">
          <p>이번 주 추천</p>
          <h2 id="course-feature-title">비 온 뒤, 서촌의 초록</h2>
          <span>경복궁역에서 시작하는 4곳</span>
          <button type="button" onClick={() => setNotice('feature')}>코스 보기</button>
        </section>

        <section className="course-list" aria-labelledby="recommended-courses-title">
          <div className="section-heading">
            <h2 id="recommended-courses-title">추천 코스</h2>
            <span className="count-label">{courses.length}</span>
          </div>
          {courses.map((course) => {
            const isSaved = saved.includes(course.id);
            return (
              <article className="course-card" key={course.id}>
                <div className={`course-visual ${course.tone}`} aria-hidden="true">
                  <span>01</span><i /><b>02</b><i /><strong>03</strong>
                </div>
                <div className="course-copy">
                  <p>{course.time} · {course.places}곳</p>
                  <h3>{course.title}</h3>
                  <span>{course.detail}</span>
                </div>
                <button
                  className={`save-button ${isSaved ? 'saved' : ''}`}
                  type="button"
                  aria-label={`${course.title} ${isSaved ? '저장 취소' : '저장'}`}
                  aria-pressed={isSaved}
                  onClick={() => toggleSave(course)}
                >
                  <span aria-hidden="true">{isSaved ? '★' : '☆'}</span>
                </button>
              </article>
            );
          })}
        </section>
      </div>
      {notice && <p className="toast" role="status">{notice === 'feature' ? '추천 코스를 열었어요.' : '저장 목록을 업데이트했어요.'}</p>}
      <BottomNav active="course" onNavigate={onNavigate} />
    </section>
  );
}
