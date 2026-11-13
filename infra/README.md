# 인프라

로컬 DB, 개발 서버의 단일 컨테이너 배포, 운영 서버의 블루·그린 배포와 HTTPS·관측성 설정을 관리합니다.
아래 명령은 저장소 루트에서 실행합니다.

## 로컬 데이터베이스

Docker Engine 또는 Docker Desktop과 Docker Compose plugin이 필요합니다.

```bash
docker compose -f infra/docker-compose.local.yml up -d --wait
```

| 항목 | 기본값 |
| --- | --- |
| 접속 주소 | `127.0.0.1:5432` |
| 데이터베이스 | `jumin` |
| 사용자 / 비밀번호 | `jumin` / `jumin` |

환경변수 예시는 [.env.example](.env.example)에서 확인합니다.
Apple Silicon에서는 명령 앞에 `DOCKER_DEFAULT_PLATFORM=linux/amd64`를 붙입니다.

```bash
# 종료
docker compose -f infra/docker-compose.local.yml down

# 데이터까지 초기화
docker compose -f infra/docker-compose.local.yml down --volumes
```

애플리케이션 실행 방법은 [서버 README](../server/README.md)를 참고합니다.

## 로컬에서 배포 흐름 검증

Docker, Docker Compose plugin과 Python 3.9 이상이 필요합니다.

```bash
# 실제 Docker Nginx에서 연속 요청을 보내며 전환·롤백 검증
python3 infra/scripts/tests/test-blue-green-local.py

# 종료 신호와 오류 경로를 포함한 배포 스크립트 회귀 테스트
bash infra/scripts/tests/test-viewport-cache.sh
```

Docker 테스트는 운영 Compose와 Nginx 설정으로 긴 요청 유지, 블루·그린 전환, 수동 롤백과 health 실패 시 자동 복구를 확인합니다.
실행마다 별도 이름과 임시 loopback 포트를 사용하고, 종료 시 생성한 리소스를 정리합니다.
첫 실행에서는 테스트 이미지를 내려받습니다. 테스트용 HTTP 백엔드를 사용하며 Spring·DB 검증은 서버 테스트에서 수행합니다.

## 백엔드 배포

브랜치에 변경이 반영되면 GitHub Actions가 해당 환경에 배포합니다.

| 환경 | 브랜치 | 배포 방식 | GitHub Environment / Runner | 배포 workflow |
| --- | --- | --- | --- | --- |
| 개발 | `develop` | 단일 컨테이너 교체 | `development` / `jumin-dev` | [백엔드](../.github/workflows/server-dev-cd.yml) · [프록시](../.github/workflows/proxy-dev-cd.yml) |
| 운영 | `main` | 블루·그린 무중단 전환 | `production` / `jumin-prod` | [백엔드](../.github/workflows/server-prod-cd.yml) · [프록시](../.github/workflows/proxy-prod-cd.yml) |

개발은 `backend` 컨테이너를 교체하므로 배포 중 잠시 중단됩니다.
health 확인에 실패하면 이전 이미지를 다시 기동하고 배포를 실패로 기록합니다.
운영은 다음 순서로 배포합니다.

1. 비활성 슬롯에 새 이미지를 기동하고 Spring·DB readiness를 확인합니다.
2. Nginx를 리로드해 요청을 새 슬롯으로 전환합니다.
3. 이전 요청이 끝나면 기존 슬롯을 정지해 롤백용으로 보관합니다.

운영의 기존 단일 백엔드에서 처음 전환할 때는 **프록시 CD → 백엔드 CD** 순서로 실행합니다.
이 단계에서 프록시 컨테이너를 재생성하므로 짧게 연결이 끊길 수 있습니다.
새 환경의 설치 순서와 필수 설정은 [배포 운영 가이드](deployment.md)를 참고합니다.

## 상태 확인과 롤백

해당 EC2의 저장소에서 runner 계정으로 실행합니다. 아래는 운영 환경 기준입니다.

```bash
curl -fsSi http://127.0.0.1:18080/health
docker ps -a --filter name=jumin-backend-prod \
  --format '{{.Names}} {{.Image}} {{.Status}}'
```

이전 성공 슬롯을 선택해 롤백합니다.

```bash
BACKEND_RELEASE_ROOT=/opt/jumin-prod/backend \
  bash infra/scripts/deploy-backend.sh prod rollback backend-blue
```

롤백 대상은 `backend-blue`, `backend-green` 또는 최초 전환 전의 `backend`입니다.
슬롯 선택 롤백은 운영 전용입니다. 개발 상태는 `curl -fsS http://127.0.0.1:8080/actuator/health`로 확인합니다.
활성 슬롯과 관리자·DB·외부 API·Redis 설정이 다른 보관 슬롯은 롤백이 차단됩니다.
Redis를 사용하면 읽기 전용 CA 마운트의 파일 내용도 일치해야 합니다. DB 마이그레이션은 롤백 후에도 유지됩니다.
복구와 지연 정리 절차는 [배포 운영 가이드](deployment.md#배포와-복구)를 참고합니다.

## 관측성

[Grafana](https://grafana.jucha.info)에서 `environment`로 개발·운영을 선택합니다.

| 데이터 | 수집 경로 |
| --- | --- |
| 애플리케이션·프록시 로그 | Docker journald → Alloy → Loki |
| 애플리케이션·EC2 지표 | Actuator·Alloy → Prometheus |

```bash
bash infra/observability/scripts/validate-stack.sh
```

인증 설정, 보존 기간과 경보는 [관측성 운영 안내](deployment.md#관측성)를 참고합니다.

## 구성

| 경로 | 용도 |
| --- | --- |
| `docker-compose.local.yml` | 로컬 PostgreSQL·PostGIS·pgRouting |
| `docker-compose.dev.yml`, `docker-compose.prod.yml` | 개발 단일 백엔드·운영 블루·그린 슬롯 |
| `docker-compose.proxy*.yml`, `nginx/` | Nginx·Certbot와 프록시 설정 |
| `docker-compose.viewport*.yml`, `redis/` | 환경별 Viewport 캐시 CA 마운트와 Redis 배포 |
| `scripts/` | 배포·드레인 정리·인증서 갱신·데이터 적재 |
| `scripts/tests/` | 배포 회귀 테스트와 로컬 Docker 테스트 |
| `observability/` | Grafana·Loki·Prometheus·Alloy |
| `docker-compose.loadtest.yml` | 격리 부하 테스트 환경 |

## 보행망 수동 적재

보행망은 로컬 또는 별도 작업 호스트에서 변환·적재합니다.
실행 명령은 [서버 안내](../server/README.md#osm-보행-네트워크-적재), 환경별 준비 사항은
[수동 적재 절차](deployment.md#보행망-수동-적재)를 참고합니다.

## 관련 문서

- [서버 실행과 테스트](../server/README.md)
- [서버 부하 테스트](../server/loadtest/README.md)
- [배포 운영 가이드](deployment.md)
- [Viewport 캐시·Redis 배포](viewport-cache-deployment.md)
