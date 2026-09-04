import { BrandLoading } from './MotionAssets.jsx';
import {
  ActionButton,
  BottomSheet,
  Chip,
  MapStage,
  SearchIcon,
} from './FlowPrimitives.jsx';

function MapPromptBackdrop() {
  return <>
    <div className="map-top-fade" />
    <header className="server-map-heading">
      <p>안국동 · 내 주변</p>
      <h1>오늘, 어디로 걸어볼까요?</h1>
      <button type="button"><span><SearchIcon /></span>장소 · 지역 · 테마 검색</button>
      <div><Chip active>전체</Chip><Chip>요즘</Chip><Chip>팝업</Chip><Chip>촬영지</Chip></div>
    </header>
    <div className="server-error-dim" />
  </>;
}

export function MapPermissionPrompt({ go, title, copy, detail, action, next }) {
  return <section className="phone map-permission-screen">
    <MapStage variant="home">
      <MapPromptBackdrop />
      <BottomSheet className="map-permission-sheet">
        <h1>{title}</h1>
        <p>{copy}</p>
        <article><strong>{detail[0]}</strong><small>{detail[1]}</small></article>
        <ActionButton onClick={() => go(next)}>{action}</ActionButton>
      </BottomSheet>
    </MapStage>
  </section>;
}

export function MapLoadingPrompt({ go }) {
  return <section className="phone map-permission-screen map-loading-screen">
    <MapStage variant="home">
      <MapPromptBackdrop />
      <BottomSheet className="map-permission-sheet map-loading-sheet">
        <BrandLoading />
        <h1>장소 정보를 불러오고 있어요</h1>
        <p>공공데이터와 실시간 혼잡 정보를 확인하는 중이에요.</p>
        <article><strong>잠시만 기다려주세요</strong><small>네트워크 상태에 따라 몇 초 걸릴 수 있어요.</small></article>
        <ActionButton tone="secondary" onClick={() => go('map')}>나중에 다시 보기</ActionButton>
      </BottomSheet>
    </MapStage>
  </section>;
}
