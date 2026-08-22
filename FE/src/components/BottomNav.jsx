import { Compass, MapPinned, Route, Sparkles, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { bottomNavItems } from './bottomNavModel';

const icons = { map: MapPinned, explore: Compass, assistant: Sparkles, course: Route, my: UserRound };

export default function BottomNav({ active, onNavigate }) {
  return <nav className="bottom-nav" aria-label="주요 메뉴">
    {bottomNavItems.map(({ id, label }) => {
    const Icon = icons[id];
    const isActive = active === id;
    return <motion.button key={id} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => onNavigate(id)} aria-current={isActive ? 'page' : undefined} whileTap={{ scale: .96 }} transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}>{isActive && <motion.span layoutId="bottom-nav-active-bubble" className="nav-bubble" transition={{ type: 'tween', duration: .14, ease: [0.77, 0, 0.175, 1] }} />}<span className="nav-icon"><Icon aria-hidden="true" size={21} strokeWidth={1.9} /></span><span className="nav-label">{label}</span></motion.button>;
  })}</nav>;
}
