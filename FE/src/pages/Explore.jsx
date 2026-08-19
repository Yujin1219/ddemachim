import { useEffect, useMemo, useState } from 'react';
import BottomNav from '../components/BottomNav';
import SearchBar from '../components/SearchBar';
import { fetchPlaceTrends } from '../api/client';

const sections = [{ id: 'trending', title: '요즘 이곳에서는', action: '전체보기', subtitle: '최근 메뉴·사진·공간이 주목받는 장소', badge: '요즘 핫한 장소' }];

const popups = [
  {
    title: '블루 모먼트 전시 팝업',
    meta: '성수 · 8월 31일까지',
    image: '/assets/palace-garden.png',
  },
  {
    title: '아무개 서점 여름 마켓',
    meta: '서촌 · 이번 주말',
    image: '/assets/cafe-garden.png',
  },
];

export default function Explore({ onNavigate }) {
  const [query, setQuery] = useState('');
  const [trendPlaces, setTrendPlaces] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    fetchPlaceTrends({ limit: 6, signal: controller.signal })
      .then((items) => setTrendPlaces(Array.isArray(items) ? items : []))
      .catch((error) => { if (error?.name !== 'AbortError') setTrendPlaces([]); });
    return () => controller.abort();
  }, []);
  const normalizedQuery = query.trim();
  const visibleSections = useMemo(
    () => sections.map((section) => ({ ...section,
      places: trendPlaces.filter((place) => (
        `${place.name || ''} ${place.description || place.trend?.reason || ''}`.includes(normalizedQuery)
      )),
    })),
    [normalizedQuery, trendPlaces],
  );
  const visiblePopups = popups.filter((popup) => (
    `${popup.title} ${popup.meta}`.includes(normalizedQuery)
  ));
  const hasResults = visibleSections.some((section) => section.places.length) || visiblePopups.length;

  return (
    <section className="phone explore-page" aria-label="ddemachim 탐색">
      <div className="scroll-content explore-scroll-content">
        <header className="explore-header">
          <h1>탐색</h1>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="장소, 메뉴, 촬영지를 검색해보세요"
          />
        </header>

        {hasResults ? (
          <>
            {visibleSections.map((section) => section.places.length > 0 && (
              <section className="discover-section" key={section.id} aria-labelledby={`${section.id}-title`}>
                <div className="section-heading">
                  <h2 id={`${section.id}-title`}>{section.title}</h2>
                  <button type="button">{section.action}</button>
                </div>
                <p className="section-sub">{section.subtitle}</p>
                <div className="card-scroller" aria-label={`${section.title} 장소 목록`}>
                  {section.places.map((place) => (
                    <article className="place-card" key={place.name}>
                      <div className="place-image">
                        <img src={place.imageUrl || '/assets/cafe-garden.png'} alt={`${place.name} 모습`} />
                        <span>{section.badge}</span>
                      </div>
                      <h3>{place.name}</h3>
                      <p>{place.description || place.trend?.reason || '최근 주목받는 장소'}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}

            {visiblePopups.length > 0 && (
              <section className="popup-section" aria-labelledby="popup-title">
                <div className="section-heading">
                  <h2 id="popup-title">이번 주 팝업</h2>
                  <button type="button">더보기</button>
                </div>
                <div className="popup-list">
                  {visiblePopups.map((popup) => (
                    <article className="popup-row" key={popup.title}>
                      <img src={popup.image} alt="" />
                      <div>
                        <h3>{popup.title}</h3>
                        <p>{popup.meta}</p>
                      </div>
                      <span className="row-chevron" aria-hidden="true">›</span>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : <p className="search-empty">'{query}'에 대한 장소를 찾지 못했어요.</p>}
      </div>
      <BottomNav active="explore" onNavigate={onNavigate} />
    </section>
  );
}
