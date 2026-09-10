import { withBasePath } from '../utils/appPath.js';
import { MessageCircle, ShoppingBasket } from 'lucide-react';

const ASSET_BASE = withBasePath('/assets/app-header');

export default function AppHeader({ basketCount = 0, onHome, onBasket, onLiveTalk }) {
  return (
    <header className="app-header" aria-label="때마침 공통 헤더">
      <div className="app-header-brand">
        <button type="button" className="app-header-brand-button app-header-logo" onClick={onHome} aria-label="지도 홈으로 이동">
          <img className="app-header-logo-mark" src={`${ASSET_BASE}/logo.svg`} alt="" />
          {/* <img className="app-header-logo-spark" src={`${ASSET_BASE}/logo-vector.svg`} alt="" /> */}
        </button>
        <button type="button" className="app-header-brand-button app-header-wordmark" onClick={onHome}>때마침</button>
      </div>
      <div className="app-header-actions">
        <button type="button" className="app-header-action" onClick={onBasket} aria-label={`코스 장바구니${basketCount > 0 ? `, 담은 장소 ${basketCount}개` : ''}`} title="코스 장바구니">
          <ShoppingBasket aria-hidden="true" size={22} strokeWidth={2} />
          {basketCount > 0 && <span className="app-header-basket-count" aria-hidden="true">{basketCount > 99 ? '99+' : basketCount}</span>}
        </button>
        <button type="button" className="app-header-action" onClick={onLiveTalk} aria-label="내 주변 지금톡" title="내 주변 지금톡">
          <MessageCircle aria-hidden="true" size={23} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
