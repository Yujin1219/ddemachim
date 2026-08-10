import { Compass, MapPinned, Route, UserRound } from 'lucide-react';
import { motion } from 'motion/react';

const items = [{id:'map', label:'지도', Icon:MapPinned}, {id:'explore', label:'탐색', Icon:Compass}, {id:'course', label:'코스', Icon:Route}, {id:'my', label:'MY', Icon:UserRound}];

export default function BottomNav({ active, onNavigate }) {
  return <nav className="bottom-nav" aria-label="주요 메뉴">{items.map(({ id, label, Icon }) => {
    const isActive = active === id;
    return <motion.button key={id} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => onNavigate(id)} aria-current={isActive ? 'page' : undefined} whileTap={{ transform: 'perspective(700px) translateY(1px) rotateX(-2deg) scale(.95)' }} transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}><motion.span className="nav-icon" initial={false} animate={{ transform: isActive ? 'perspective(700px) translateY(-2px) rotateX(8deg) translateZ(6px)' : 'perspective(700px) translateY(0px) rotateX(0deg) translateZ(0px)' }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}><Icon aria-hidden="true" size={21} strokeWidth={1.9} /></motion.span><span>{label}</span></motion.button>;
  })}</nav>;
}
