# Ddemachim Frontend Instructions

이 파일은 `FE/` 아래 모든 파일에 적용된다. 프론트 코드를 계획/수정/리뷰하기 전에 읽어라.

## 프로젝트 구조 — 반드시 먼저 알아야 할 것

- **`src/App.jsx`는 `pages/ProductFlow.jsx` 하나만 렌더링한다.** 실제로 동작하는 화면은 전부 이 파일 안에 있다.
- **`pages/MapHome.jsx`, `pages/Explore.jsx`, `pages/Course.jsx`, `pages/MyPage.jsx`는 어디서도 import되지 않는 죽은 코드다.** 이름이 비슷해서 헷갈리기 쉬우니, 화면을 고칠 땐 반드시 `ProductFlow.jsx` 안의 해당 함수(`MapHome`, `ExploreScreen`, `CourseConditions` 등)를 찾아서 고쳐라. 죽은 페이지 파일을 고치면 아무 효과가 없다.
- `ProductFlow.jsx`는 라우팅을 자체 구현한 해시 기반 SPA다(React Router 안 씀). `window.location.hash`를 `#/{screen}` 또는 `#/{screen}/{id}` 형태로 파싱해서(`readHash()`) 화면을 전환한다. `go(screen, id?)` 함수로 이동하며, `id`는 상세 화면(예: 장소 상세)에 실제 리소스 id를 넘길 때 쓴다.
- 화면 전체 목록은 `routeGroups`(auth/discovery/course/travel/filming/record/my)에 정의돼 있고, `RenderScreen`이 화면 이름에 따라 실제 컴포넌트로 분기한다.

## 백엔드 연동 상태 (2026-08-10 기준)

- BE는 Spring Boot, `http://localhost:8080`에서 실행. FE는 `vite.config.js`의 `/api` 프록시로 접근한다(dev 서버 재시작해야 프록시 설정이 반영됨 — Vite는 config 변경을 핫리로드하지 않는다).
- API 클라이언트는 `src/api/client.js`에 있다. 새 API 호출을 추가할 땐 여기 함수를 추가해서 쓰고, 컴포넌트에서 직접 `fetch`를 흩어놓지 마라.
- **BE 응답은 공통 봉투(envelope)로 감싸져 있다**: `{ isSuccess, code, message, result }`. 실제 데이터는 `result` 필드 안에 있다. `client.js`의 `request()` 헬퍼가 이미 `result`를 벗겨서 반환하므로, 새로 API를 추가할 때도 이 헬퍼를 통해서 호출해야 한다.
- 실제 데이터가 있는 도메인: **장소(place)**, **문화행사(event)**, **작품(media-content)**, **촬영지 매칭(filming-location)**. 이 4개는 실제 DB에서 조회되는 진짜 데이터다.
- **백엔드가 아예 없는 영역**(전부 화면 프로토타입/목업 데이터로만 존재): 로그인/회원가입, 코스(바구니/비교/경로 안내), 저장/찜, 후기, 실시간 혼잡도·"지금톡", 도보 이동 시간·거리, 카메라 구도 맞추기. 이 화면들을 고칠 땐 실제 API가 없다는 걸 전제하고, 목업 데이터를 유지하거나 새로 백엔드 작업이 필요하다는 걸 사용자에게 먼저 확인해라.
- "도보 8분", "저장 1.2천", "요즘 인기" 같은 문구는 계산/추적할 방법이 없는 데이터라 실데이터 연동 시 의도적으로 제거했다. 비슷한 걸 새로 추가하고 싶으면 실제로 낼 수 있는 값인지부터 확인해라(지어내지 말 것).

## 이미지 처리

- `place.thumbnailUrl`, `event.mainImage` 등은 데이터가 없으면 `null`일 수 있다(대부분의 place가 이미지 없음 — RedTable/TourAPI 커버리지가 낮음). 항상 폴백 이미지(`images.cafe` 등 `ProductFlow.jsx` 상단 `images` 객체)를 준비해라.
- TMDB `posterPath`는 상대경로만 온다. 실제 이미지 URL은 `https://image.tmdb.org/t/p/{사이즈}/{posterPath}`로 직접 조합해야 한다(BE가 완성된 URL을 안 줌).

## 코딩 컨벤션

- Lombok 없는 순수 JS/JSX. 컴포넌트는 함수 선언식, 화면 단위 컴포넌트는 `{Screen}({ go, ...props })` 패턴을 따른다.
- 새 화면에 실제 API 데이터가 필요하면 `useState` + `useEffect`로 로딩하고, 반드시 `cancelled` 플래그로 언마운트 후 setState를 막아라(기존 코드 패턴 참고).
- 에러 발생 시 `console.error`로 로그만 남기고 화면은 깨지지 않게 폴백 UI를 보여준다(빈 배열, "불러오지 못했어요" 문구 등) — 이 앱엔 아직 전역 에러 바운더리가 없다.
- `motion/react`(Framer Motion 계열)로 화면 전환 애니메이션을 쓴다. 새 화면 추가 시 기존 화면들의 `initial`/`animate`/`transition` 패턴을 참고해서 톤을 맞춰라.

## 작업 순서

1. `ProductFlow.jsx`에서 실제로 렌더링되는 함수를 먼저 찾아라(죽은 `pages/*.jsx` 파일 아님).
2. 실데이터가 필요하면 BE에 해당 API가 있는지 먼저 확인해라(`BE/src/main/java/com/ddemachim/server/domain/*/controller`). 없으면 만들지 목업으로 둘지 사용자에게 확인해라.
3. `src/api/client.js`에 필요한 fetch 함수를 추가/재사용해라.
4. UI 수정 후 `npm run build`로 프로덕션 빌드가 깨지지 않는지 확인해라.
5. 가능하면 브라우저에서 실제 클릭까지 해보고 완료 보고해라(코드만 보고 "될 것 같다"고 하지 마라).
