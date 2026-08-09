import { SearchIcon } from './Icons';
export default function SearchBar({ placeholder, value, onChange }) { return <label className="search-bar"><span className="search-icon"><SearchIcon /></span><input aria-label="검색" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></label>; }
