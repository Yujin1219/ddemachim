import { useState } from 'react';
import BottomNav from '../components/BottomNav';
import SearchBar from '../components/SearchBar';
import VWorldMap from '../components/VWorldMap';

const filters = ['전체','요즘','팝업','촬영지'];
export default function MapHome({ onNavigate }) {
 const [filter,setFilter] = useState('전체'); const [query,setQuery] = useState('');
 return <section className="phone map-page" aria-label="ddemachim 지도 홈">
   <VWorldMap className="map-background" center={[126.985, 37.579]} zoom={15} ariaLabel="안국동 주변 지도" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
   <div className="map-fade"/>
   <header className="map-header"><p className="location">안국동 · 내 주변</p><h1>오늘, 어디로 걸어볼까요?</h1><SearchBar value={query} onChange={setQuery} placeholder="장소·지역·테마 검색"/><div className="filter-row">{filters.map(item => <button className={`filter-chip ${filter === item ? 'selected':''}`} onClick={()=>setFilter(item)} key={item}>{item}</button>)}</div></header>
   <div className="route-line" aria-hidden="true"/>
   <aside className="nearby-sheet"><div className="sheet-handle"/><div className="section-heading"><h2>지금 가기 좋은 곳</h2><button onClick={()=>onNavigate('explore')}>전체보기</button></div><article className="nearby-card"><img src="https://www.figma.com/api/mcp/asset/7bd7835b-b9c4-4727-abb5-0ef566c6dbb3.png" alt="도토리가든 외관"/><div><span className="popup-badge">D-3 팝업</span><h3>도토리가든</h3><p>도보 8분 · 저장 1.2천</p></div></article></aside>
   <BottomNav active="map" onNavigate={onNavigate}/>
 </section>;
}
