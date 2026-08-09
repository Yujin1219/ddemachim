import { MapIcon, ExploreIcon, CourseIcon, UserIcon } from './Icons';

const items = [{id:'map', label:'지도', Icon:MapIcon}, {id:'explore', label:'탐색', Icon:ExploreIcon}, {id:'course', label:'코스', Icon:CourseIcon}, {id:'my', label:'MY', Icon:UserIcon}];

export default function BottomNav({ active, onNavigate }) {
  return <nav className="bottom-nav" aria-label="주요 메뉴">{items.map(({id,label,Icon}) => <button key={id} className={`nav-item ${active === id ? 'active' : ''}`} onClick={() => onNavigate(id)} aria-current={active === id ? 'page' : undefined}><span className="nav-icon"><Icon /></span><span>{label}</span></button>)}</nav>;
}
