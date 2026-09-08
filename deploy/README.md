# VM 배포용 Compose

Rocky Linux 8.10 / x86_64 VM에 웹·백엔드·PostGIS·Redis를 실행하는 구성입니다.
저장소 루트의 `docker-compose.yml`은 기존 개발용으로 유지하고, 배포는 이 파일을 명시합니다.
회사 Nginx의 도메인·HTTPS 연결은 VM 컨테이너 실행 후 별도로 설정합니다.

```text
회사 Nginx → VM의 WEB_BIND_IP:WEB_PORT → web:80
                                            └─ /api → backend:8080
                                                         ├─ db:5432
                                                         └─ redis:6379
```

- VM 밖에 연결하는 포트는 웹 하나입니다. 백엔드/DB/Redis에는 호스트 포트가 없습니다.
- 백엔드와 웹은 외부 API에 접근할 수 있습니다. DB/Redis는 외부로 연결되지 않는 내부 네트워크를 사용합니다.
- 이미지 기본값: `ddemachim-web:vm-amd64`, `ddemachim-backend:vm-amd64`, `postgis/postgis:18-3.6`, `redis:8.8.0-alpine`.
- DB/Redis가 healthy가 된 뒤 백엔드, 웹 순서로 시작합니다. 백엔드 health는 TCP 포트 검사이며
  전체 기능 검증은 별도 HTTP 테스트로 수행합니다.
- `restart: unless-stopped`는 비정상 종료/호스트 재부팅 시 재시작을 위한 설정입니다.
  직접 중지한 컨테이너나 단순 unhealthy 상태를 자동으로 복구하는 기능은 아닙니다.
- 로그는 서비스별 최대 10MB × 3개로 순환합니다.

## 1. 실행 환경 파일 준비

프로젝트 루트에서:

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

`deploy/.env`는 Git에서 제외됩니다. API 키와 DB 비밀번호를 실제 값으로 바꾸세요.
`DB_PASSWORD`는 DB와 백엔드에 같은 값으로 전달됩니다. `JWT_SECRET`은 충분히 긴 무작위 값으로 정합니다.
기존 로그인 토큰을 유지할지 여부에 따라 이전 키 유지/교체를 결정합니다.

- `WEB_BIND_IP=127.0.0.1`, `WEB_PORT=8080`이 기본값입니다. 맥에서 이미 8080을 사용 중이면 로컬 테스트에만 다른 포트를 지정하세요.
- 회사 VM에서는 `WEB_BIND_IP`를 VM의 수신 IP 또는 `0.0.0.0`으로 바꾸고 회사 Nginx의 전달 대상을 `192.168.1.75:8080`으로 맞춥니다.
  웹 포트는 신뢰하는 회사 프록시에서 접근하도록 네트워크 정책을 설정합니다.
- `PUBLIC_ORIGIN`은 브라우저의 실제 출처입니다. 예: `https://yujin.company.example`.
  경로(`/yujin`)나 끝의 `/`를 넣지 않습니다. 여러 출처는 쉼표로 구분할 수 있습니다.
- 프론트는 루트(`/`)에 제공하는 구성이므로 `/yujin/` 하위 경로 배포는 추가 조정이 필요합니다.
- `AI_GUIDE_ENABLED=false`가 기본값입니다. 켜려면 true와 유효한 OpenAI 키를 지정하세요.
- 외부 API 키는 이 파일에 넣지만 프론트 VWorld 키는 웹 이미지 빌드 시 반영해야 합니다.
- Python 자동 수집기는 이 구성에 포함되지 않으며 수집 스케줄러는 비활성화합니다.

환경 파일의 `$`가 포함된 값은 Compose 보간을 피하도록 작은따옴표로 감쌉니다.
이 파일은 Compose `--env-file`용이고, 단일 컨테이너용 Docker `--env-file`과 파싱 규칙이 다릅니다.
또한 셸에 export한 같은 이름의 환경변수는 이 파일보다 우선하므로 배포 전에 확인하세요.

## 2. 필요한 이미지와 VM 실행 환경

VM에 Docker Engine + Compose 플러그인을 설치하고 Docker 서비스 자동 시작을 설정해야 합니다.
이 설정은 VM에 Java/Node/Nginx/PostgreSQL/Redis를 직접 설치하지 않습니다.

웹/백엔드는 로컬에서 만든 이미지를 각각 `docker image save`로 파일로 내보내 VM으로 전송한 뒤
`docker image load`로 등록합니다. DB/Redis는 VM에서 다운로드하거나 같은 방식으로 전달합니다.
태그 대신 digest를 사용하면 DB 이미지를 다운로드하는 시점에 따른 패치 버전 차이를 고정할 수 있습니다.

## 3. 최초 실행: DB 준비 → 백업 복원 → 전체 실행

항상 동일한 프로젝트 이름 `ddemachim-vm`을 사용하세요. 프로젝트 이름을 바꾸면 별도 볼륨을 사용합니다.

```bash
docker compose --project-name ddemachim-vm --env-file deploy/.env \
  -f deploy/compose.yaml config --quiet

docker compose --project-name ddemachim-vm --env-file deploy/.env \
  -f deploy/compose.yaml up -d --wait db redis
```

기존 맥 DB를 최신 상태로 백업한 custom-format `.dump` 파일을 **새 VM의 빈 DB에 한 번** 복원합니다.
아래 예시 파일명은 실제 백업 파일 경로로 바꾸세요. 기존 데이터가 있는 DB에 반복 복원하지 마세요.

```bash
docker compose --project-name ddemachim-vm --env-file deploy/.env \
  -f deploy/compose.yaml exec -T db \
  pg_restore -U postgres -d ddemachim --clean --if-exists --no-owner --no-privileges --single-transaction \
  < /path/to/ddemachim.dump
```

PostGIS가 초기 생성한 `tiger` 등과 백업의 스키마가 겹칠 수 있어 `--clean --if-exists`를 사용합니다.
이 명령은 복원 대상 객체를 삭제·재생성하므로 최초 VM 초기화에만 사용하세요.

이전 DB의 코스 유형 제한도 백업에 포함됩니다. 복원 후 아래 마이그레이션을 적용해야
`QUIET` 코스 저장이 가능합니다. 기존 `PLEASANT` 값은 `QUIET`로 변환됩니다.
저장소 없이 이미지·Compose만 전송하는 경우 이 SQL 파일도 VM에 복사하고 입력 경로를 맞추세요.

```bash
docker compose --project-name ddemachim-vm --env-file deploy/.env \
  -f deploy/compose.yaml exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d ddemachim \
  < data-pipeline/src/db/expand_course_route_strategy_quiet.sql
```

복원과 마이그레이션이 성공한 뒤:

```bash
docker compose --project-name ddemachim-vm --env-file deploy/.env \
  -f deploy/compose.yaml up -d --wait --wait-timeout 240

docker compose --project-name ddemachim-vm --env-file deploy/.env \
  -f deploy/compose.yaml ps
```

백엔드는 `ddl-auto=validate`를 유지합니다. 빈 DB에 전체 스택부터 실행하면 스키마 검증에서 실패합니다.
이 파일은 테이블을 생성하거나 운영 데이터를 덮어쓰지 않습니다.

## 4. 연결 확인과 운영

로컬 기본값 기준 `http://localhost:8080/`은 화면, `/api/places?size=1`은 API/DB 응답을 확인합니다.
회사에서는 담당자가 지정한 URL로 로그인·지도·검색·혼잡도·코스 생성 등을 확인합니다.
카메라는 HTTPS가 필요합니다. 실제 키/출처 제한과 권한이 있는 참고 이미지도 확인해야 합니다.

회사 Nginx는 원래 Host와 HTTPS 정보를 전달해야 합니다. 프론트 Nginx는 Origin을 삭제하지 않습니다.
비로그인 API 요청 제한은 백엔드가 보는 연결 IP 기준이라 프록시를 경유한 사용자가 제한을 공유할 수 있습니다.
실제 사용자별 제한은 회사 프록시 정책과 신뢰하는 프록시 주소 설정을 정한 뒤 조정합니다.

배포 업데이트는 새 웹/백엔드 이미지를 등록하고 Compose의 해당 서비스에 `up -d`를 실행합니다.
기존 DB를 다시 복원할 필요는 없습니다. 일반 `down`은 데이터를 유지하지만 **`down --volumes`는
배포 DB/Redis 데이터를 삭제**하므로 실제 배포 프로젝트에서 사용하지 마세요. 볼륨은 별도 백업을 대신하지 않습니다.
DB 볼륨 생성 후 `.env`의 비밀번호만 바꿔도 DB 사용자 비밀번호가 변경되지는 않습니다.

## 5. 맥에서 독립 통합 테스트

```bash
python3 deploy/smoke-test.py
```

스크립트는 매번 고유한 `ddemachim-stack-test-*` 프로젝트를 만들고 가짜 키를 사용합니다.
`deploy/.env`, 개발 DB, 실제 회원/장소 데이터는 읽지 않습니다.
스키마 자동 생성은 임시 override를 통해 **새 테스트 DB에만** 한 번 사용한 뒤
배포용 `validate`로 돌아와 네 컨테이너를 검증합니다.

검증 항목은 화면/API 연결, 허용/비허용 Origin, 회원가입, 챗봇 비활성화,
혼잡도 Redis 캐시 저장/TTL, 전체 컨테이너 삭제·재생성 후 DB/Redis 데이터 유지입니다.
테스트 종료 시 오직 이 임시 프로젝트의 컨테이너·네트워크·볼륨을 정리합니다.

이 테스트는 실제 데이터 백업 복원, 실제 회사 Nginx/HTTPS, 외부 API, 브라우저의 지도·카메라 동작을
대신하지 않습니다. 이 항목은 VM 배포 시 추가 검증해야 합니다.
