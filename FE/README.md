# ddemachim

Figma `07 Visual Direction / Clean Product` 톤을 기반으로 한 장소 탐색 서비스 `ddemachim`의 모바일 프론트엔드입니다.

## 실행

```bash
npm ci
npm run dev
```

검증 명령은 `npm test`, `npm run build`입니다.

## 포함된 동작

- 하단 `지도` / `탐색` / `코스` / `MY` 탭 화면 전환
- 지도 화면 카테고리 필터 선택
- 탐색 화면 장소·메뉴·촬영지 검색 및 결과 필터링
- 탐색 화면의 `요즘 이곳에서는`, `장면 속으로`, `이번 주 팝업` 카드 목록
- 코스 추천과 코스 저장 상태 변경
- MY 화면의 저장 장소 관리 및 빈 상태
- 실제 장소 API의 촬영지 응답 ID(`filmingLocationId`)를 장면 상세 → 카메라 → 결과까지 유지하는 장면 구도 촬영
- 390 × 844 기준 모바일 레이아웃 및 작은 화면 대응

## 장면 카메라 운영 참고

- 브라우저 카메라는 HTTPS secure context에서만 사용합니다. 로컬 개발의 `localhost`는 예외지만, 휴대폰에서 연 HTTP LAN IP 주소는 실기기 검증 환경으로 사용할 수 없습니다.
- 릴리스에는 API의 실제 `filmingLocationId`와 연결된, 권리 승인이 완료된 same-origin 참고 스틸 및 메타데이터가 필요합니다. 에셋은 `public/assets/scenes/` 관례를 따르며, 승인 항목이 없으면 카메라 진입은 안내와 함께 차단됩니다.
- `filmingLocationId=1`에는 장면 카메라 기능 확인을 위해 사용자가 제공한 경향신문 이미지가 same-origin 임시 에셋으로 예외 등록되어 있습니다. 이는 테스트 전용이며 권리 승인을 의미하지 않으므로 배포 전 제거하거나 배포 권한이 확인된 에셋으로 교체해야 합니다.
- 카메라 스트림과 촬영 결과는 메모리에서만 처리하며 백엔드나 브라우저 영구 저장소에 보관하지 않습니다.
- 결과는 Web Share 파일 공유를 우선 사용하고, 지원되지 않거나 공유에 실패하면 다운로드를 제공합니다.
- 이 MVP는 일반 HTTPS 브라우저용이며 PWA 설치, 서비스 워커, 오프라인 동작을 제공하거나 약속하지 않습니다.

릴리스 전에는 실제 HTTPS URL에서 아래 항목을 수동 확인합니다. 이 목록은 수행 완료 기록이 아닙니다.

- iOS Safari와 Android Chrome: 카메라 권한 허용·거부·재시도, 후면 카메라 우선 요청과 일반 카메라 fallback, 화면 회전과 촬영/참고 이미지 crop 일치, 백그라운드 이동·복귀 시 카메라 lifecycle
- safe area, 320 × 568, 세로·가로 화면, 200% 확대
- iOS VoiceOver와 Android TalkBack의 핵심 흐름
- Web Share 성공·취소·실패와 다운로드 폴백

## 참고

탐색·MY 화면에 사용하는 사진은 `public/assets`에 포함되어 있습니다. 지도 원본 이미지 에셋은 Figma MCP 주소를 사용합니다.
