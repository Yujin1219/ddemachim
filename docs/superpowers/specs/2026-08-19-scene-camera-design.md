# 장면 구도 카메라 모바일 웹 설계

- 상태: 사용자 UX·기술 방향 승인 완료
- 작성일: 2026-08-19
- 적용 범위: `FE/**` 및 향후 참고 스틸 응답 계약
- 현재 전달물: iOS Safari와 Android Chrome의 브라우저 모드에서 동작하는 HTTPS 모바일 웹 MVP

## 1. 목표

촬영지의 특정 장면을 선택한 사용자가 모바일 브라우저에서 참고 스틸을 실제 후면 카메라 위에 겹쳐 구도를 맞추고, 촬영 직후 원본과 참고 장면을 비교한 뒤 기기에 공유하거나 내려받을 수 있게 한다.

핵심 경험은 다음 한 문장으로 정의한다.

> 장면 선택 → 실제 카메라 위에서 구도 맞춤 → 촬영 → 전후 비교 → 기본 50/50 결과 공유 또는 다운로드

이 MVP는 자동 AR 정합이나 점수 산정이 아니라, 사용자가 직접 참고 스틸과 카메라 프레임을 맞추는 신뢰 가능한 수동 도구를 목표로 한다. secure context가 필수이므로 배포와 실기기 검증은 HTTPS에서 수행한다. `localhost`는 로컬 개발 예외이지만 휴대폰에서 여는 HTTP LAN IP는 유효한 실기기 테스트 환경이 아니다.

촬영 데이터는 앱 메모리에만 두며 다운로드는 사용자가 시작하는 기기 파일 생성이지 서비스 기록 생성이나 앱 영속화가 아니다.

## 2. 현재 저장소 기준과 문제 정의

현재 실행 앱은 `FE/src/App.jsx`가 `FE/src/pages/ProductFlow.jsx` 하나를 렌더링한다. `ProductFlow`는 `#/{screen}/{id}` 형식의 커스텀 해시 라우팅을 사용하고, 화면 전환 `motion.div`를 `screen`으로 키잉한다. 앱은 React Strict Mode에서 실행되므로 카메라 획득과 정리 코드는 중복 마운트·효과 정리를 견뎌야 한다.

현재 촬영 흐름에는 다음 제약이 있다.

- `ProductFlow.jsx`의 `scene-detail`, `camera-permission`, `camera`, `shot-result` 분기는 정적 목업이다.
- `CameraScreen`은 이미지 파일을 라이브 카메라처럼 표시하고, 별도 권한 화면은 실제 미디어 권한 요청 없이 다음 화면으로 이동한다.
- 장면 상세에서 카메라와 결과로 이동할 때 `filmingLocationId`가 보존되지 않는다.
- 결과는 고정 이미지와 근거 없는 `86%` 일치 점수를 표시한다.
- `AppScreenFrame`은 카메라와 결과에도 전역 `AppHeader`를 남긴다.
- 현재 카메라 CSS의 고정 목업 치수는 새 기능의 좌표계나 반응형 템플릿으로 사용하지 않는다.
- `FE/src/api/client.js`가 API 호출을 중앙화하지만, 현재 백엔드 `FilmingLocationResponse`에는 `id`, `sceneDescription` 등만 있고 참고 스틸 필드는 없다.

따라서 기존 화면을 꾸미는 수준이 아니라, 라우트 전환에도 살아 있는 메모리 카메라 세션, 실제 스트림 수명주기, DOM·canvas 공통 기하, 메모리 전용 촬영 결과를 하나의 브라우저 기능 경계로 도입한다.

## 3. 현재 범위와 비범위

### MVP 포함

- 기존 `filmingLocationId`를 장면 상세, 카메라, 결과 라우트 전체에서 보존
- 사용자 제스처로 시작하는 실제 후면 카메라 권한·스트림 획득
- 같은 출처의 참고 스틸을 라이브 영상 위에 겹치고 위치·크기·불투명도를 수동 조절
- shutter 시 현재 프레임을 `Blob`으로 캡처
- 기본 50 위치의 좌우 before/after 비교와 키보드 조작 가능한 슬라이더
- 고정 50/50 분할 PNG 기본 내보내기와 선택 가능한 overlay PNG 내보내기
- Web Share 지원 시 공유, 그 외 다운로드 폴백
- 안전 영역, 작은 화면, 가로 모드, 줌, 보조기술, reduced motion 대응
- 자동·빌드·HTTPS runtime·브라우저 실기기 검증과 명확한 복구 경로
- 향후 백엔드의 additive nullable 참고 스틸 계약 설계

### MVP 제외

- 자동 AR 정렬, 컴퓨터 비전, 구도 추천·정합 분석, 일치율 또는 점수
- 촬영 이미지 업로드, 서버 저장, 갤러리·방문 인증·코스 기록 연결
- 현재 `photo-saved` 흐름이나 `CourseComplete(... photoSaved)`의 재사용
- 앨범 가져오기, 전·후면 카메라 전환, 렌즈 선택, 디지털 줌, `1×` 제어
- 사용자 계정 또는 backend photo persistence 변경
- 사용자 이미지나 프레임을 대상으로 한 분석 이벤트·analytics
- 범용 네트워크 불가 모드, background sync, 사진 업로드 큐

설치형 앱과 애플리케이션 관리형 네트워크 불가 동작은 현재 범위가 아니다. 관련 항목은 10장의 별도 승인 대상에만 정의한다. 현재 MVP에는 이를 위한 패키지, 산출물, 등록, UI, 저장소 또는 자리표시자 hook을 추가하지 않는다.

## 4. 사용자 흐름과 라우팅

### 라우트

장면 식별자는 모든 전환에서 유지한다.

```text
#/scene-detail/{filmingLocationId}
  → #/camera/{filmingLocationId}
  → #/shot-result/{filmingLocationId}
```

- `ProductFlow`는 계속 해시를 읽고 쓰는 라우트 어댑터로 남는다.
- 장면 상세는 유효한 `filmingLocationId`와 참고 스틸 메타데이터를 세션에 설정한 뒤, 사용자가 `구도 맞추기`를 누른 동일한 사용자 제스처 체인에서 카메라 획득을 시작하고 `camera/{id}`로 이동한다.
- 카메라와 결과는 full-bleed 화면이며 `AppScreenFrame`의 `AppHeader`를 숨긴다.
- 이 두 화면에는 현재 perspective/rotate 3D 화면 전환을 적용하지 않는다. reduced motion에서는 전환이 없고, 그 외에는 짧은 opacity fade만 허용한다.
- 카메라의 닫기와 브라우저 뒤로 가기는 해당 ID의 `scene-detail`로 돌아가며 스트림을 중단한다.
- 결과 화면의 `다시 촬영`은 캡처 결과를 폐기하고 같은 ID의 카메라를 재획득한다.
- 새 장면 ID로 이동하면 이전 세션의 스트림·Blob·object URL·조절값을 정리하고 새 reference metadata를 immutable snapshot으로 설정한다.
- 직접 접근 또는 reload로 `shot-result/{id}`에 왔는데 해당 ID의 메모리 캡처가 없으면, 설명 메시지를 한 번 표시할 수 있는 라우트 상태를 남기고 `scene-detail/{id}`로 redirect한다. 빈 결과 UI나 예시 사진을 보여주지 않는다.

### 화면별 경험

1. 장면 상세는 참고 스틸이 준비됐는지 확인하고 카메라 진입 행동을 제공한다. 스틸이 없거나 export 안전성을 확인할 수 없으면 이유와 복구 행동을 먼저 보여준다.
2. 카메라는 실제 영상, 참고 overlay, 프레이밍 제어, 닫기, shutter만 제공한다. MVP에서 앨범·카메라 전환·`1×` 버튼은 제거한다.
3. 결과는 캡처와 참고 스틸의 before/after 비교, `다시 촬영`, export 모드 선택, `공유` 또는 `다운로드`를 제공한다. 점수나 저장 완료·방문 기록 문구는 표시하지 않는다.

## 5. 프런트엔드 아키텍처와 상태 소유권

### 모듈 경계

- `ProductFlow`: 해시 route parsing/navigation과 ID 전달만 담당하는 라우트 어댑터
- `SceneCameraSession` provider + `sceneCameraReducer`: keyed route subtree보다 위에서 메모리 세션을 소유
- `SceneCameraFlow`: route와 세션 상태를 연결하고 진입 guard·복구 화면을 선택
- `CameraStage`: video, reference overlay, 프레이밍 안내와 shutter UI를 합성
- `OverlayControls`: 위치 방향, scale, opacity, reset의 비제스처 제어 제공
- `BeforeAfterComparison`: 접근 가능한 비교 slider와 두 이미지 preview 제공
- `useCameraStream`: 스트림 획득, token 경쟁 방지, track 이벤트, 정리를 담당
- `sceneGeometry`: DOM과 canvas가 공유하는 cover crop 및 overlay 변환 계산
- `sceneCanvas`: 캡처, orientation normalization, PNG export를 담당
- `shareSceneCapture`: Web Share capability 판단, 취소/실패 구분, 다운로드 폴백 담당
- `sceneReferenceStills`: MVP의 ID별 로컬 reference metadata와 missing fallback 정의
- `FE/src/api/client.js`: 향후 API `referenceStill` 정규화가 생길 경우 유일한 네트워크 계약 경계

실제 파일명은 구현 시 저장소 관례에 맞출 수 있으나 책임을 다시 하나의 거대 `ProductFlow.jsx` 분기로 합치지 않는다.

이 경계가 향후 확장을 막지 않는다는 뜻은 안정적인 해시 라우트, 격리된 기능 모듈, same-origin asset/data seam, 메모리 전용 카메라 상태를 유지한다는 뜻뿐이다. 미래 설치형 작업을 위한 빈 hook, 의존성, 등록 코드 또는 설정을 MVP에 미리 두지 않는다.

### 세션 상태

`SceneCameraSession`은 `ProductFlow` 내부이되 `key={screen}`인 routed motion subtree 위에 위치한다. reducer가 소유하는 값은 다음과 같다.

- `filmingLocationId`
- 세션 진입 시 snapshot한 immutable reference metadata
- overlay `{ x, y, scale, opacity }`: stage에 정규화된 값
- captured `{ blob, objectUrl, width, height }`
- comparison position: 정수 `0..100`, 초기값 `50`
- export mode: 기본 `split`, 선택 `overlay`
- flow state: `idle`, `preparing`, `camera-ready`, `capturing`, `result-ready`, `exporting`, `error`
- operation token과 정규화된 오류 정보

`MediaStream`, `HTMLVideoElement`, `HTMLImageElement`, canvas, AbortController는 직렬화 가능한 reducer 상태에 넣지 않는다. 스트림은 provider에 결합된 controller/ref가 소유하며 UI는 준비 상태와 명령만 주고받는다. object URL은 교체·retake·닫기·새 세션·unmount 때 반드시 revoke한다. 카메라 데이터는 localStorage, sessionStorage, IndexedDB에 기록하지 않는다.

## 6. 참고 스틸 데이터 계약

### MVP: 로컬 동일 출처 계약

MVP는 기존 `filmingLocationId`를 키로 하는 정적 map을 프런트엔드에 둔다. 각 asset은 배포 전에 저작권·재배포 권한을 확인한 승인본이어야 하고 `FE/public/assets/...` 아래 같은 출처 URL로 제공한다.

```js
{
  [filmingLocationId]: {
    url: '/assets/scenes/example-reference.png',
    altText: '노안당을 등지고 이로당 방향을 바라본 참고 장면',
    attribution: '권리 확인된 제공자와 출처',
    width: 1080,
    height: 1440,
  },
}
```

- `width`와 `height`는 양의 정수이며 실제 asset 고유 크기와 일치해야 한다.
- `altText`는 장면 구도를 설명하고 작품명만 반복하지 않는다.
- `attribution`은 preview UI에서 확인 가능하게 표시하되 export PNG에는 UI chrome으로 넣지 않는다.
- map에 ID가 없거나 파일 load/decode가 실패하면 `missing` 상태다. 다른 장면 이미지를 대신 사용하지 않으며, 장면 상세로 돌아가거나 재시도하는 복구 UI를 제공한다.
- 로컬 asset도 배포 대상에 포함하기 전에 작품 스틸 사용권, 2차 가공, 앱 내 표시와 파일 export/재배포 범위를 명시적으로 확인한다.

### 향후 API: additive nullable 계약

현재 백엔드는 이 계약을 지원하지 않는다. 향후 `FilmingLocationResponse`에 기존 소비자를 깨지 않는 nullable 필드를 추가할 수 있다.

```json
{
  "id": 42,
  "sceneDescription": "노안당 앞에서 대화하는 장면",
  "referenceStill": {
    "url": "/assets/scenes/42.png",
    "altText": "노안당 처마와 마당이 함께 보이는 참고 장면",
    "attribution": "권리 확인된 제공자와 출처",
    "width": 1080,
    "height": 1440
  }
}
```

- `referenceStill`이 `null`이거나 필수 필드·크기·URL 검증에 실패하면 로컬 map fallback을 조회하고, 둘 다 없으면 명시적 missing 상태를 사용한다.
- URL은 같은 출처 경로나 백엔드 image proxy URL을 우선한다.
- `FE/src/api/client.js`가 필드 타입·크기·URL을 정규화하며 컴포넌트가 원시 응답을 직접 해석하지 않는다.
- API 필드 추가는 미래 계약일 뿐 이 설계가 기존 backend support를 주장하지 않는다.

## 7. 카메라 스트림 수명주기

### 획득

- 카메라 권한은 `구도 맞추기` 버튼의 실제 사용자 제스처에서 `navigator.mediaDevices.getUserMedia`를 호출해 요청한다. Permissions API 결과를 선행 조건으로 삼지 않는다.
- secure context와 `mediaDevices.getUserMedia` 지원 여부를 먼저 확인한다. 개발 `localhost`는 허용되지만 실제 휴대폰에서 LAN IP의 HTTP 주소는 유효한 카메라 테스트 환경이 아니다.
- 첫 요청은 `video: { facingMode: { ideal: 'environment' } }`, `audio: false`를 사용한다. 해당 constraint가 `OverconstrainedError`를 내면 범용 `video: true`로 한 번 fallback한다.
- 성공한 스트림을 controller ref에 등록한 뒤 현재 token과 ID가 여전히 일치할 때만 `video.srcObject`에 연결한다. 이미 stale이면 모든 track을 즉시 stop한다.
- `loadedmetadata`와 유효한 `videoWidth/videoHeight`를 기다린 뒤 `video.play()`가 완료돼야 shutter를 활성화한다.

### 정리와 복구

다음 사건은 현재 operation token을 무효화하고 모든 track을 stop하며 `video.srcObject = null`로 만든다.

- 캡처 성공
- 닫기 또는 다른 hash/back route로 이동
- retry 전 기존 스트림 폐기
- track `ended`
- `pagehide`
- 페이지가 background/hidden 상태가 되어 스트림 사용을 계속 보장할 수 없을 때
- provider 또는 controller unmount
- 새 장면 세션 시작

visibility 복귀 시 자동으로 카메라를 다시 켜지 않는다. 사용자에게 중단 메시지와 `카메라 다시 켜기` 제스처를 제공한다. Strict Mode의 effect setup/cleanup 또는 늦게 완료된 이전 promise가 최신 스트림을 덮어쓰지 못하도록 증가 token과 disposed flag를 함께 사용한다. retake도 기존 object URL을 revoke한 뒤 사용자 제스처로 새 스트림을 획득한다.

## 8. Preview와 export 공통 기하

DOM preview와 canvas export는 `sceneGeometry`의 동일한 계산 결과를 사용한다. CSS에서 별도의 눈대중 crop 값을 만들지 않는다.

stage 크기를 `W × H`, source intrinsic 크기를 `sw × sh`라고 할 때 cover crop은 다음과 같다.

```text
coverScale = max(W / sw, H / sh)
dw = sw × coverScale
dh = sh × coverScale
dx = (W - dw) / 2
dy = (H - dh) / 2
```

source는 `(dx, dy, dw, dh)`에 그린다. reference overlay의 `x`, `y`는 stage 중심으로부터 각각 stage 폭·높이에 대한 offset 비율이며 둘 다 `-0.5..0.5`로 clamp한다. `scale`은 `0.5..2`, `opacity`는 `0.1..1`로 clamp한다. DOM과 canvas는 reducer의 같은 값을 사용해 cover된 reference 중심을 먼저 stage 중심에 놓고, `(x × W, y × H)`만큼 translate한 뒤 중심을 transform origin으로 `scale`한다. opacity는 합성 단계에 적용한다. reset은 `{ x: 0, y: 0, scale: 1, opacity: 0.5 }`다.

- stage와 export는 모두 정확한 `3:4`다. 화면 남는 영역은 UI chrome이 차지하며 stage 자체 비율을 늘리거나 letterbox 없는 임의 비율로 바꾸지 않는다.
- export PNG는 항상 `1080 × 1440`이다. decode된 입력의 긴 변이 1440보다 크면 orientation normalization 단계에서 비율을 유지해 긴 변 1440으로 downsample하고, 중간 bitmap/canvas는 이 크기를 넘지 않는다. 입력이 더 작으면 별도 고해상도 중간 bitmap을 만들지 않고 최종 1080×1440 canvas에 직접 보간해 확대한다.
- video metadata, image decode와 고유 크기를 모두 확인하기 전에는 shutter와 export를 비활성화한다.
- 후면 카메라 preview와 결과는 mirror하지 않는다.
- 캡처 전에 video frame의 실제 orientation을 확인하고 canvas에 upright portrait 결과가 되도록 회전·크기 normalization한 다음 cover 계산을 적용한다. CSS orientation만 바꾸고 원본 픽셀 방향을 방치하지 않는다.
- preview와 export가 같은 3:4 crop과 변환을 공유하므로 기준 브라우저에서 픽셀 수준 framing parity가 성립해야 한다.

### 결과 비교

`BeforeAfterComparison`은 reference를 왼쪽, capture를 오른쪽에 놓는다. native `input[type=range]` 값 `0..100`, step `1`, 기본 `50`을 사용해 경계 위치를 바꾸며 visual clip과 accessible 값이 일치해야 한다. 이 slider는 preview 전용이다.

### 내보내기

- 기본 `split`: reference를 왼쪽 540px, capture를 오른쪽 540px에 각각 동일한 3:4 cover 규칙으로 렌더링한 `1080 × 1440` PNG다. 경계는 항상 정확히 50/50이다.
- 사용자가 비교 slider를 움직여도 기본 split export 경계는 바뀌지 않는다.
- 선택 `overlay`: capture를 바닥에 그린 뒤 reference still을 preview와 같은 framing transform·opacity로 위에 그린 `1080 × 1440` PNG다.
- 버튼, label, slider thumb, attribution, guide line 등 UI chrome은 어떤 export에도 포함하지 않는다.
- canvas `toBlob('image/png')`가 `null`을 반환하거나 예외를 내면 export 실패로 처리한다.

## 9. 공유와 다운로드

- export가 준비되면 PNG `File`을 만들고 `navigator.canShare({ files: [file] })`가 true인 경우에만 파일 공유를 주 행동으로 제공한다.
- `navigator.share`의 `AbortError`는 사용자가 share sheet를 취소한 정상 결과로 취급해 오류 경고를 띄우지 않는다.
- 지원되지 않거나 공유가 실패하면 동일 PNG를 `<a download>` object URL로 내려받을 수 있게 한다. 공유 실패 시 사용자가 다운로드 폴백을 선택할 수 있도록 결과를 유지한다.
- 다운로드 click 자체가 실패하거나 브라우저가 막으면 파일을 보관했다고 주장하지 않고, 지원 브라우저 안내와 재시도를 제공한다.
- 네트워크를 요구하는 외부 share target은 네트워크가 없거나 대상 서비스가 실패하면 완료되지 않을 수 있다. 이 경우 애플리케이션 관리형 네트워크 불가 동작을 약속하지 않고 로컬 다운로드 폴백을 유지한다.
- 공유·다운로드용 object URL은 동작 완료 또는 세션 종료 후 revoke한다.

## 10. 미래/범위 밖: 설치형 PWA와 애플리케이션 관리형 오프라인

이 장의 모든 항목은 별도 승인이 필요한 미래 개념이다. MVP의 전제 조건, 전달물, release gate 또는 acceptance check가 아니며 현재 MVP는 다음을 하나도 추가하지 않는다.

- web manifest
- install/app icons와 apple-touch metadata
- service worker 등록 또는 생성된 service worker
- Workbox 또는 `vite-plugin-pwa`
- installability 판정, install prompt 또는 설치 UI
- offline shell 또는 reference asset caching
- Cache Storage, cache versioning 또는 update policy
- background sync 또는 offline upload
- push notification 또는 subscription
- installed-PWA acceptance 또는 홈 화면 실행 검사

향후 별도 설계가 승인되면 개인정보, reference 권리, 인증/API 제외, 업데이트 중 활성 카메라 세션 보호, 캐시 만료와 기기별 설치 동작을 그때 정의한다. 현재의 안정적인 해시 라우트, 격리된 기능 모듈, same-origin asset/data seam, 메모리 전용 카메라 상태는 이 미래 작업을 막지 않지만, 이를 이유로 빈 PWA hook이나 dependency를 선행 구현하지 않는다.

## 11. CORS와 이미지 export 안전성

MVP asset은 same-origin이므로 canvas export가 origin-clean 상태를 유지한다. 향후 cross-origin reference URL을 허용할 경우 다음 조건을 모두 만족해야 한다.

- 이미지 서버가 wildcard credential 조합이 아니라 앱의 정확한 origin을 `Access-Control-Allow-Origin`으로 허용
- `<img>`의 `crossOrigin = 'anonymous'`를 `src`보다 먼저 설정
- redirect가 있다면 최종 응답까지 CORS 헤더 유지
- shutter 활성화 전에 fetch/load, decode, intrinsic size, canvas draw/read 또는 동등한 origin-clean preflight 검증 완료

이미지가 화면에 보이는 것과 canvas export 가능 여부는 다르다. preview는 성공해도 export 시 canvas가 tainted될 수 있으므로, CORS·decode 검증에 실패하면 shutter 전에 `참고 이미지를 내보낼 수 없어요`를 표시하고 same-origin/proxy asset 재시도 또는 장면 상세 복귀를 제공한다. 권리·재배포 허가는 CORS 성공과 별개의 필수 조건이다.

## 12. 오류와 복구 계약

| 분류 | 판단 | 사용자 표현과 복구 |
| --- | --- | --- |
| insecure/unsupported | secure context 아님, API 없음 | HTTPS 또는 지원 브라우저 안내, 장면 상세 복귀 |
| `NotAllowedError` | 첫 prompt 거부 또는 persisted 차단 | 브라우저 설정 안내, 사용자가 누르는 재시도; 둘을 단정적으로 구분하지 않음 |
| `NotFoundError` | camera device 없음 | 사용 가능한 카메라가 없음을 표시, 복귀 |
| `NotReadableError` | 다른 앱 점유 또는 장치 오류 | 다른 앱 종료 안내와 재시도 |
| `OverconstrainedError` | environment constraint 불가 | `video: true`로 한 번 fallback, 재실패 시 오류 표시 |
| `AbortError`/`SecurityError` | 브라우저·보안 중단 | 재시도 또는 HTTPS 안내 |
| metadata/decode timeout | video metadata 또는 reference decode 미완료 | shutter 비활성, timeout 후 reload 아닌 부분 재시도 |
| ended stream | track가 예기치 않게 종료 | freeze된 preview를 성공으로 보이지 않고 사용자 제스처 재획득 |
| capture failure | draw/orientation 처리 실패 | 결과로 이동하지 않고 카메라에서 재시도 |
| `toBlob` failure | null 또는 예외 | 결과 유지, export 재시도 |
| missing reference | 로컬/API 모두 없음 | 다른 이미지 대체 금지, 장면 상세 복귀 |
| CORS/tainted reference | origin-clean 검증 실패 | shutter/export 전 차단, same-origin/proxy 복구 안내 |
| direct result without capture | 메모리 capture 없음 | 같은 ID 장면 상세로 메시지와 함께 redirect |
| share cancelled | `AbortError` | 오류 없이 결과 유지 |
| share failed/unsupported | capability 실패 또는 기타 예외 | 다운로드 폴백 제공 |
| download failure | click/URL 생성 실패 | 저장 완료 주장 금지, 재시도·지원 안내 |
| network unavailable | 외부 share target 또는 네트워크 의존 요청 실패 | 결과 유지, 다운로드 또는 온라인 재시도 안내; 앱 관리형 오프라인 동작을 주장하지 않음 |

오류 메시지는 마지막으로 성공한 캡처를 불필요하게 폐기하지 않는다. 단, 스트림과 reference의 export 안전성이 깨진 상태에서는 shutter를 허용하지 않는다. 오류가 화면을 바꾸면 heading 또는 alert로 focus를 이동하고, 동일 화면의 일시적 상태는 적절한 live region으로 알린다.

## 13. 안전 영역과 접근성

- full-bleed 카메라의 상단 닫기/상태와 하단 shutter/제어는 각각 `env(safe-area-inset-top)`과 `env(safe-area-inset-bottom)`을 더해 notch와 home indicator를 피한다.
- 320×568의 짧은 화면, 일반·긴 화면, landscape에서 3:4 stage와 핵심 동작이 겹치지 않는다. 짧은 화면에서는 보조 설명을 줄이고 제어 영역을 스크롤할 수 있지만 닫기와 shutter를 가리지 않는다.
- 모든 touch target은 최소 44×44 CSS px다.
- 비교 slider는 native range, `min=0`, `max=100`, 기본 `50`이며 label과 `aria-valuetext`로 `참고 장면 50%, 내 사진 50%`처럼 알린다. 화살표·Page Up/Down·Home/End의 네이티브 키보드 동작을 보존한다.
- drag만으로 overlay를 조절하지 않는다. 상·하·좌·우 이동, 확대·축소, reset 버튼과 label이 있는 opacity range를 함께 제공한다.
- 각 화면에는 고유 heading이 있고 진입 시 heading에 focus를 둔다. blocking error는 오류 heading/alert, redirect 메시지는 장면 상세 안내, 닫기·복귀 후에는 가능한 경우 원래 `구도 맞추기` 버튼으로 focus를 돌린다.
- 권한·카메라 준비·캡처·export 상태는 과도하게 반복되지 않는 polite live region으로 알리고, 즉시 행동이 필요한 실패만 assertive alert를 사용한다.
- 실제 의미를 전달하는 reference/capture 이미지에는 대체 설명을 제공한다. 라이브 video는 화면의 별도 상태 문구가 같은 정보를 전달하므로 accessible tree에서 제외하고, 장식 guide에는 `aria-hidden="true"`를 적용한다. shutter 버튼 자체에는 `사진 촬영`이라는 명확한 이름을 둔다.
- 고대비와 200% zoom에서도 상태·동작이 색상에만 의존하지 않는다. reduced motion에서는 3D 전환을 제거하고 불필요한 움직임 없이 즉시 상태를 바꾼다.
- VoiceOver, TalkBack, 외부 키보드로 닫기, 프레이밍 조절, 촬영, 비교, export를 완료할 수 있어야 한다.

## 14. 개인정보와 보안

- 일반적인 HTTP 브라우저 캐시는 브라우저 정책에 따라 존재할 수 있다. MVP는 application-managed offline cache, Cache Storage 또는 service worker를 추가하지 않는다.
- MediaStream, camera frame, captured Blob, object URL과 export는 앱 메모리에만 존재하며 localStorage, sessionStorage, IndexedDB 같은 영구 웹 저장소에 기록하지 않는다.
- 캡처·프레임·Blob·export를 API로 전송하거나 analytics 또는 애플리케이션 로그에 남기지 않는다.
- 스트림 track은 사용 목적이 끝나는 즉시 stop하고 모든 object URL을 revoke한다.
- 다운로드는 사용자가 시작하는 기기 파일 생성이며 앱의 persistence, 사진 저장 기록, 방문 인증 또는 코스 기록이 아니다. 기존 `photo-saved`와 기록 화면을 연결하지 않는다.
- 카메라 상태 telemetry가 필요해도 오류 종류와 capability처럼 이미지가 아닌 최소 기술 정보만 별도 동의·정책 검토 후 도입한다. 기본 설계에는 사용자 이미지 analytics가 없다.

## 15. 현재 MVP 검증 전략

### 자동 검증

- `sceneGeometry` cover crop, normalized translation, 3:4 orientation, preview/export parity의 pure unit tests
- reducer의 유효 상태 전이, ID 교체 reset, immutable reference snapshot, slider 기본값 50, export 기본값 `split`
- split export가 slider 값과 무관하게 정확히 540/540인 테스트
- overlay export layer 순서가 capture → transformed reference이고 UI chrome이 포함되지 않는 테스트
- mocked `getUserMedia`로 environment 성공/fallback, Strict Mode setup/cleanup, stale promise, retry, capture, route change, track ended, pagehide/visibility cleanup과 `srcObject = null` 검증
- object URL 생성·교체·retake·세션 종료 revoke 검증
- `scene-detail/{id}` → `camera/{id}` → `shot-result/{id}`와 back/close ID 보존, direct result guard 검증
- range label/aria value, keyboard 조작, focus 이동, live region에 대한 접근성 테스트
- `canShare` 지원·미지원, share 취소·실패, download fallback 테스트

### 빌드·HTTPS runtime 검증

- clean dependency 상태에서 `npm ci`, `npm test`, `npm run build`
- production build가 성공하고 camera/reference/export 코드와 asset이 포함되는지 확인
- HTTPS 환경 또는 실제 배포 URL에서 production runtime을 열어 secure context, console, permission prompt, camera lifecycle, memory/object URL 정리를 확인
- HTTP LAN IP가 실기기 검증 URL로 사용되지 않았는지 기록

### 브라우저 실기기 매트릭스

| 플랫폼 | 실행 형태 | 필수 시나리오 |
| --- | --- | --- |
| iOS Safari | 브라우저 | 첫 허용/거부/설정 차단, background 복귀, rotation, retake, share 취소·성공·실패, download fallback |
| Android Chrome | 브라우저 | environment camera, 장치 점유 오류, track ended, rotation, retake, share와 download fallback |

두 브라우저에서 320×568 상당의 짧은 viewport, tall viewport, landscape, safe area, 200% zoom, 고대비, reduced motion을 확인한다. iOS VoiceOver와 Android TalkBack으로 전체 핵심 흐름을 실행하고, 가능한 경우 외부 키보드 range 조작도 검증한다. 실제 휴대폰 검증 URL은 유효한 HTTPS여야 한다.

네트워크가 없거나 외부 share target이 실패하는 경우 결과가 유실되지 않고 다운로드 또는 온라인 재시도 안내가 제공되는지는 확인한다. 이는 애플리케이션 관리형 오프라인 운용을 보장하는 검사가 아니다.

## 16. 현재 전달 순서와 단계별 사용자 관찰 기준

다음 순서는 구현 작업 목록이 아니라, 각 능력이 어떤 순서와 가시적 기준으로 완성돼야 하는지를 정의한다.

1. **HTTPS/secure-context plus route/session foundation** — 유효한 HTTPS 브라우저에서 secure context를 확인할 수 있고, `filmingLocationId`가 상세→카메라→결과 hash에 보존되며 keyed 화면 전환 위의 메모리 세션이 reload/direct-result guard와 새 ID 정리를 결정적으로 수행한다.
2. **Camera permission/stream plus overlay framing** — 같은 사용자 제스처에서 실제 권한 prompt와 후면 preview가 시작되고, same-origin reference overlay의 위치·크기·불투명도를 touch 이외의 접근 가능한 제어로도 조절하며 닫기·background·오류 시 스트림이 남지 않는다.
3. **Shutter/capture handoff** — metadata와 reference가 준비된 상태에서 shutter를 누르면 보이는 3:4 프레임과 일치하는 upright 메모리 캡처가 결과 세션에 전달되고 스트림이 즉시 종료된다.
4. **Interactive before/after** — 결과 화면에서 reference 왼쪽/capture 오른쪽 비교가 기본 50에 열리고 touch·키보드로 경계를 바꿀 수 있으며 retake가 같은 장면 카메라를 다시 연다.
5. **Default 50/50 plus optional overlay exports** — 기본 PNG는 slider 위치와 무관하게 정확한 50/50 `1080×1440`이고, 사용자가 선택하면 동일 framing·opacity의 overlay PNG가 UI chrome 없이 만들어진다.
6. **Share/download fallback** — 지원 브라우저에서는 `canShare`를 통과한 PNG share sheet가 열리고, 미지원·실패 시 같은 결과를 다운로드할 수 있으며 취소는 오류로 오인되지 않는다.
7. **Browser-mode automated/build/real-device verification** — geometry, reducer, media lifecycle, navigation, object URL, share, accessibility 자동 검증과 production build, HTTPS runtime, iOS Safari 브라우저·Android Chrome 브라우저 실기기 검증이 통과하고 결과가 기록된다.

각 단계는 이전 단계의 계약을 깨지 않고 해당 관찰 기준을 만족해야 한다. 7단계 완료 전에는 HTTPS 브라우저 장면 카메라 경험이 release-ready라고 판단하지 않는다.

## 17. 현재 MVP 완료 기준

- iOS Safari와 Android Chrome 브라우저 모드의 유효한 HTTPS URL에서 핵심 흐름을 완료한다.
- 유효한 장면 ID가 상세, 카메라, 결과 전체에서 보존되고 reload/direct result guard가 결정적으로 동작한다.
- 카메라 권한은 실제 사용자 제스처로 요청되며 허용·거부·장치 오류마다 복구 가능한 UI가 있다.
- route, capture, close, retry, background, track ended, Strict Mode cleanup에서 카메라가 남지 않는다.
- DOM preview와 PNG가 동일한 3:4 cover·overlay 기하를 사용하고 후면 카메라가 mirror되지 않는다.
- 기본 export는 slider와 무관한 정확한 reference-left/capture-right 50/50 `1080×1440` PNG다.
- optional overlay export는 capture 아래, transformed reference 위 순서이며 UI chrome이 없다.
- 촬영·export 데이터가 영구 웹 저장소, API, analytics 또는 로그로 나가지 않는다.
- same-origin 또는 검증된 CORS reference만 shutter/export에 사용하며 권리·재배포 승인이 확인된다.
- 핵심 흐름이 작은 화면, safe area, 키보드, VoiceOver/TalkBack, reduced motion에서 완료된다.
- geometry/reducer/media lifecycle/navigation/object URL/share/accessibility 자동 테스트, production build, HTTPS runtime과 두 브라우저 실기기 매트릭스가 통과하고 실패 항목은 release 전에 해소된다.

## 18. 알려진 위험과 결정 경계

- 모바일 Safari와 Chrome의 camera lifecycle, 권한 상태, background·rotation 동작은 버전과 기기별 차이가 크다. token 기반 정리와 두 브라우저 실기기 검증을 release gate로 둔다.
- 고해상도 이미지 두 장의 canvas 합성은 모바일 메모리를 압박한다. export를 1080×1440, 처리 긴 변을 최대 1440으로 고정하고 중간 canvas와 object URL을 즉시 폐기한다.
- Web Share와 다운로드 지원·실패 표현은 브라우저와 외부 share target에 따라 다르다. capability를 실제로 확인하고 결과를 유지한 채 다운로드 폴백을 제공한다.
- cross-origin 이미지는 preview 성공 후에도 export를 실패시킬 수 있다. same-origin/proxy 우선과 shutter 전 origin-clean 검증을 유지한다.
- 작품 스틸 권리는 기술적 접근 가능성과 무관하다. 앱 표시, 합성 export, 사용자 재공유까지 포함한 허가 범위가 없으면 해당 스틸을 배포하지 않는다.
- safe area, 짧은 화면, landscape, zoom에서 카메라 chrome이 stage나 핵심 제어를 가릴 수 있다. 실제 viewport와 접근성 검증을 release gate로 둔다.
- 자동 점수, AR/CV, backend photo persistence, 방문 인증 연결은 이 MVP의 후속 단계가 아니다. 필요하면 별도 요구사항·개인정보·데이터 계약을 승인받아 독립 설계한다.
