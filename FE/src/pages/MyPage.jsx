import { useState } from 'react';
import BottomNav from '../components/BottomNav';

const savedPlaces = [
  { name: '도토리가든', meta: '안국 · 저장한 지 2일', image: '/assets/cafe-garden.png' },
  { name: '창덕궁 후원', meta: '종로 · 가보고 싶은 촬영지', image: '/assets/palace-garden.png' },
];

export default function MyPage({ onNavigate }) {
  const [saved, setSaved] = useState(savedPlaces);

  return (
    <section className="phone my-page" aria-label="ddemachim 마이">
      <div className="scroll-content my-scroll-content">
        <header className="my-header">
          <button type="button" className="settings-button" aria-label="설정">···</button>
          <div className="profile-mark">Y</div>
          <div>
            <p>이번 주 2곳을 저장했어요</p>
            <h1>유진님의 산책</h1>
          </div>
        </header>

        <section className="my-stats" aria-label="나의 활동">
          <div><strong>12</strong><span>저장한 장소</span></div>
          <div><strong>4</strong><span>만든 코스</span></div>
          <div><strong>3</strong><span>다녀온 곳</span></div>
        </section>

        <section className="saved-places" aria-labelledby="saved-places-title">
          <div className="section-heading">
            <h2 id="saved-places-title">저장한 장소</h2>
            <button type="button" onClick={() => onNavigate('map')}>지도에서 보기</button>
          </div>
          <div className="saved-place-list">
            {saved.length ? saved.map((place) => (
              <article className="saved-place" key={place.name}>
                <img src={place.image} alt="" />
                <div><h3>{place.name}</h3><p>{place.meta}</p></div>
                <button
                  type="button"
                  aria-label={`${place.name} 저장 취소`}
                  onClick={() => setSaved((current) => current.filter((item) => item.name !== place.name))}
                >
                  ★
                </button>
              </article>
            )) : <p className="my-empty">저장한 장소가 없어요. 마음에 드는 곳을 저장해보세요.</p>}
          </div>
        </section>

        <section className="my-menu" aria-label="내 메뉴">
          <button type="button"><span>최근 본 장소</span><b>›</b></button>
          <button type="button"><span>알림 설정</span><b>›</b></button>
        </section>
      </div>
      <BottomNav active="my" onNavigate={onNavigate} />
    </section>
  );
}
