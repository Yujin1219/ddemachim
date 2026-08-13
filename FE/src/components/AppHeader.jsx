const ASSET_BASE = '/assets/app-header';

export default function AppHeader({ onNotifications, onProfile }) {
  return (
    <header className="app-header" aria-label="때마침 공통 헤더">
      <div className="app-header-brand" aria-label="때마침 홈">
        <span className="app-header-logo" aria-hidden="true">
          <img className="app-header-logo-mark" src={`${ASSET_BASE}/logo.svg`} alt="" />
          {/* <img className="app-header-logo-spark" src={`${ASSET_BASE}/logo-vector.svg`} alt="" /> */}
        </span>
        <strong>때마침</strong>
      </div>
      <div className="app-header-actions">
        <button type="button" className="app-header-action" onClick={onNotifications} aria-label="알림">
          <img src={`${ASSET_BASE}/notification.svg`} alt="" />
        </button>
        <button type="button" className="app-header-profile" onClick={onProfile} aria-label="프로필">
          <img src={`${ASSET_BASE}/avatar.svg`} alt="" />
        </button>
      </div>
    </header>
  );
}
