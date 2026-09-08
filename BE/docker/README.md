# 백엔드 Docker 이미지

Java 21에서 Gradle로 Spring Boot JAR를 빌드한 뒤, Java 21 JRE와 JAR만 최종 이미지에 넣습니다.
최종 이미지는 비루트 사용자 `app`(UID 10001)로 실행하며 8080번 포트를 사용합니다.
Rocky Linux x86_64 VM용으로 `linux/amd64`를 지정합니다. Java 빌드는 맥의 네이티브 플랫폼에서 수행합니다.

## 빌드

프로젝트 루트에서 Docker Desktop을 실행한 상태로:

```bash
docker buildx build --builder desktop-linux \
  --platform linux/amd64 --load \
  -t ddemachim-backend:vm-amd64 BE
```

다른 컴퓨터에서는 `docker buildx ls`로 빌더 이름을 확인하세요.
`.env`, 로컬 Gradle 캐시, 테스트, 개발 빌드 결과는 빌드 컨텍스트에서 제외합니다.
빌드에는 DB와 실제 API 키가 필요하지 않습니다. 테스트는 이미지 빌드와 별도로 실행합니다.

## 실행 설정

```bash
cp BE/docker/runtime.env.example BE/.env.docker
chmod 600 BE/.env.docker
```

`BE/.env.docker`의 예시 값을 실제 값으로 수정합니다. 이 경로는 Git과 Docker 빌드에서 제외됩니다.
백엔드는 `.env` 파일을 자동으로 읽지 않습니다. Docker 실행 시 `--env-file`로 전달해야 합니다.

| 설정 | 의미 |
|---|---|
| `SPRING_DATASOURCE_URL` | 기본 `jdbc:postgresql://db:5432/ddemachim` |
| `SPRING_DATASOURCE_USERNAME` | 기본 `postgres` |
| `DB_PASSWORD` | DB 컨테이너에서 지정한 비밀번호와 일치해야 함 |
| `REDIS_HOST`, `REDIS_PORT` | 기본 `redis`, `6379` |
| `JWT_SECRET` | 충분히 긴 무작위 서명 키. 실제 서비스를 재배포할 때 유지 |
| `KAKAO_REST_API_KEY`, `TMAP_APP_KEY`, `ODSAY_API_KEY` | 각 서버 API 인증 키 |
| `AI_GUIDE_ENABLED`, `OPENAI_API_KEY` | 챗봇 기본 비활성화. 사용하려면 활성화와 유효한 키 필요 |
| `CORS_ALLOWED_ORIGINS` | 실제 브라우저 출처. 여러 값은 쉼표로 구분 |
| `JAVA_TOOL_OPTIONS` | 필요 시 JVM 메모리·시간대 옵션 지정 |

프론트 이미지와 달리 **백엔드 키·비밀번호는 빌드하지 않고 실행할 때 주입**합니다.
환경변수를 변경하면 새 설정으로 컨테이너를 다시 생성합니다. 이미지 재빌드는 필요 없습니다.
키가 컨테이너 환경변수로 전달되므로 Docker 관리 권한이 있는 사용자는 볼 수 있습니다.

## 실행 예시

이 명령은 `ddemachim` 네트워크와 `db`, `redis`라는 서비스가 **이미 준비되어 있는 경우**의 예시입니다.
전체 네트워크와 DB/Redis 실행은 이후 Compose에서 구성합니다.

```bash
docker run --rm --name ddemachim-backend-preview \
  --platform linux/amd64 --network ddemachim \
  --network-alias backend \
  --env-file BE/.env.docker \
  -p 127.0.0.1:18081:8080 \
  ddemachim-backend:vm-amd64
```

실제 배포에서는 웹 컨테이너가 `http://backend:8080`으로 전달하므로 백엔드의 호스트 포트 공개는
필수가 아닙니다. 위 `18081`은 로컬 확인용입니다. DB는 `localhost`가 아닌 서비스 이름 `db`로 찾습니다.

## 실제 컨테이너 검증

```bash
python3 BE/docker/smoke-test.py ddemachim-backend:vm-amd64
```

독립된 임시 네트워크, PostGIS/Redis, 백엔드 컨테이너를 만듭니다. API 키는 테스트용 가짜 값이며
외부 API를 호출하지 않습니다. 개발 DB나 실제 `.env`는 사용하지 않습니다.

- 이미지의 `linux/amd64`, 비루트 실행, 키·비밀번호 미포함 확인
- 임시 PostGIS 준비 및 Redis 8.8.0 PING 확인
- 테스트 격자 조회로 Redis 캐시 저장·TTL 확인, 저장값을 바꿔 API가 Redis 값을 읽는지 검증
- 임시 빈 DB에서만 스키마를 생성하고 장소 조회·회원가입 확인
- 인증된 챗봇 요청의 비활성화 응답 `AIGUIDE5032` 확인
- 백엔드를 교체한 뒤 기본 `ddl-auto=validate`로 재기동하고 기존 회원 로그인 확인
- 완료/실패 시 테스트 컨테이너와 임시 저장 공간·네트워크 정리

이 테스트는 실제 지도 전체의 혼잡도 표시, 외부 API, 실제 데이터 백업 복원,
회사 프록시의 HTTPS/CORS를 검증하지 않습니다. 해당 항목은 전체 Compose와 VM 연결 단계에서 확인합니다.

## 배포 시 전제

- 운영 설정은 기존 `ddl-auto=validate`를 유지합니다. **DB 백업을 먼저 복원해야** 백엔드가 기동합니다.
  실제 DB에 `create`, `create-drop`을 설정하지 마세요. smoke test의 `create`는 전용 임시 DB만 대상으로 합니다.
- 이 이미지에는 Python 및 `data-pipeline` 수집 스크립트가 없습니다.
  `DATA_PIPELINE_SCHEDULER_ENABLED=false`를 유지하고, 자동 수집은 별도 배포 단계에서 구성합니다.
- `.env`는 Docker 형식인 `KEY=value`로 작성합니다. 셸의 `export`나 명령 치환을 넣지 않습니다.
- 공개 출처와 프록시 신뢰 설정은 회사의 최종 접속 주소가 정해진 뒤 연결합니다.
- VM으로 옮길 때는 아래 명령으로 이미지 파일을 만들 수 있습니다. DB 데이터는 포함하지 않습니다.

```bash
docker image save -o /tmp/ddemachim-backend-amd64.tar ddemachim-backend:vm-amd64
```
