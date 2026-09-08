# 프론트 Docker 이미지

프론트만 대상으로 합니다. VM 배포, 백엔드 이미지, DB 복원, 전체 Compose 구성은 다음 단계입니다.

## 구조

```text
Node 24에서 npm ci → Vite 빌드
                      ↓ dist만 복사
Nginx 이미지 → 컨테이너의 80번 포트
                ├─ /, /assets/... : 화면 파일
                └─ /api/...       : BACKEND_UPSTREAM으로 전달
```

최종 이미지는 Node, node_modules, React 소스, `.env` 원본을 포함하지 않습니다.
회사 VM은 x86_64이므로 `linux/amd64`로 빌드합니다. 빌드 단계는 맥의 CPU에서 실행하고,
최종 Nginx 단계만 대상 플랫폼에 맞춥니다.

## 이미지 만들기

프로젝트 루트에서 실행합니다. Docker Desktop이 실행 중이어야 합니다.

```bash
docker buildx build --builder desktop-linux \
  --platform linux/amd64 \
  --secret id=vite_env,src=FE/.env \
  --no-cache-filter build \
  --load -t ddemachim-web:vm-amd64 FE
```

`desktop-linux`는 이 맥에서 확인한 빌더 이름입니다. 다른 컴퓨터에서는 `docker buildx ls`로
사용 가능한 빌더를 확인해서 바꾸거나 `--builder` 옵션을 생략합니다.

- 빌드 컨텍스트는 저장소 전체가 아닌 `FE`입니다. 백엔드 환경변수는 전달하지 않습니다.
- `.env`는 BuildKit secret으로 빌드 중에만 연결합니다.
- **Vite에서 사용하는 `VITE_*` 값은 빌드된 JS에 들어가 브라우저에서 볼 수 있습니다.**
  프론트용 VWorld 키 등만 넣고 DB 비밀번호나 서버 전용 API 키는 넣지 않습니다.
- secret 내용 변경은 빌드 캐시를 자동 무효화하지 않으므로 위 명령은 빌드 단계를 다시 실행합니다.
- 프론트 환경변수 변경은 새 이미지 빌드가 필요합니다. `docker run -e VITE_...`로 바뀌지 않습니다.
- VWorld 키의 허용 도메인은 실제 회사 서비스 주소에 맞춰 별도로 확인해야 합니다.

## 웹만 실행해서 확인

```bash
docker run --rm --name ddemachim-web-preview \
  --platform linux/amd64 \
  -p 127.0.0.1:18080:80 \
  -e BACKEND_UPSTREAM=http://host.docker.internal:8080 \
  ddemachim-web:vm-amd64
```

브라우저에서 `http://localhost:18080`을 엽니다. 이 예시는 Docker Desktop에서 맥의
백엔드 8080번 포트로 연결합니다. 백엔드가 없으면 화면 파일과 `/healthz`는 정상 응답하고,
API 요청만 502를 반환합니다. 터미널에서 Ctrl+C로 종료합니다.

실제 Compose에서는 같은 Docker 네트워크의 백엔드 서비스 이름을 사용합니다.
기본값은 `BACKEND_UPSTREAM=http://backend:8080`이며, 주소에는 경로와 끝의 `/`를 붙이지 않습니다.
설정 변경은 컨테이너를 새 환경변수로 다시 생성하면 됩니다. 이미지를 다시 빌드할 필요는 없습니다.

## 자동 실행 검증

```bash
python3 FE/docker/smoke-test.py ddemachim-web:vm-amd64
```

Python 표준 라이브러리와 Docker를 사용합니다. 임시 Docker 네트워크, 웹 컨테이너,
`node:24-alpine` 기반 테스트 API를 만들며 정상 종료나 테스트 실패 시 정리합니다.
기존 개발 DB나 백엔드는 사용하지 않습니다.

검증 범위:

- linux/amd64 이미지 여부, 백엔드 없는 상태의 웹 시작 및 health 응답
- HTML·JS·CSS 제공, index 재검증 정책, 없는 정적 파일의 404 응답
- `.env` 접근 차단, 최종 이미지의 Node·소스·환경변수 원본 제외
- API 경로·쿼리·POST 본문·Authorization·Origin·HTTPS 전달 정보 보존
- 백엔드의 오류 상태 코드 보존

이는 실제 브라우저의 지도·카메라·로그인 통합 테스트를 대신하지 않습니다.

## 회사 Nginx 연결 전 확인

- 현재 이미지는 도메인의 루트(`/`)에서 제공하는 구성을 기준으로 합니다.
  `/yujin/` 같은 하위 경로로 서비스한다면 프론트의 `/api`, `/assets` 절대 경로와
  회사 Nginx 경로 분기를 함께 조정해야 합니다.
- 회사 Nginx가 VM의 웹 포트로만 전달하게 하고, VM 웹 포트는 신뢰하는 프록시에서
  접근하도록 설정합니다. HTTPS를 회사에서 종료하면 `Host`, `X-Forwarded-Proto`를 전달해야 합니다.
- 이 Nginx는 Origin을 삭제하거나 모든 출처에 CORS를 허용하지 않습니다.
  백엔드 연결 단계에서 실제 서비스 주소의 CORS 및 신뢰하는 프록시 설정을 함께 확인합니다.
- `/healthz`는 웹 서버 상태만 확인하며, 백엔드·DB 가용성을 의미하지 않습니다.
- HTTPS 인증서, VM 방화벽, 최종 공개 포트는 이번 이미지 작업에 포함하지 않습니다.
- 카메라의 테스트용 참고 이미지와 실기기 검증 조건은 `FE/README.md`의 릴리스 참고사항을 따릅니다.

## 나중에 VM으로 옮길 때

```bash
docker image save -o /tmp/ddemachim-web-amd64.tar ddemachim-web:vm-amd64
```

이 파일을 VM으로 전송하고 VM에서 `docker image load -i 파일경로`로 등록합니다.
DB 데이터는 이 이미지에 포함하지 않습니다.
