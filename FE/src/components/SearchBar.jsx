import { Search } from 'lucide-react';

export default function SearchBar({ placeholder, value, onChange }) { return <label className="search-bar"><span className="search-icon"><Search aria-hidden="true" size={20} strokeWidth={2} /></span><input aria-label="검색" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/></label>; }
