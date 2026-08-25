# 인프라

`infra/`는 로컬 데이터베이스와 개발 서버 배포에 필요한 설정을 관리합니다.
애플리케이션 실행과 테스트 방법은 [서버 README](../server/README.md)를 참고하세요.

## 구성

| 파일 | 용도 |
| --- | --- |
| `docker-compose.local.yml` | 로컬 PostgreSQL + PostGIS 실행 |
| `docker-compose.dev.yml` | 개발 서버 백엔드 컨테이너 실행 |
| `.env.example` | 로컬 데이터베이스 환경변수 예시 |

## 로컬 데이터베이스

로컬 개발에서는 PostgreSQL과 PostGIS를 Docker Compose로 실행합니다.

```bash
docker compose -f infra/docker-compose.local.yml up -d --wait
```

기본 접속 정보는 다음과 같습니다.

| 항목 | 기본값 |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `jumin` |
| Username | `jumin` |
| Password | `jumin` |

환경변수를 변경하려면 `infra/.env.example`을 참고해 `infra/.env`를 만들고
Compose를 실행합니다. `postgres-data` 볼륨은 데이터베이스 컨테이너를 종료한 뒤에도
데이터를 보존합니다.

```bash
docker compose -f infra/docker-compose.local.yml down
```

데이터까지 초기화할 때만 볼륨을 삭제합니다.

```bash
docker compose -f infra/docker-compose.local.yml down --volumes
```

> [!WARNING]
> Apple Silicon에서는 현재 PostGIS 이미지가 amd64 기반이므로 실행 명령 앞에
> `DOCKER_DEFAULT_PLATFORM=linux/amd64`를 붙여야 합니다. 자세한 실행·테스트 방법은
> [서버 README의 아키텍처별 실행](../server/README.md#1-호스트-아키텍처-확인)을 참고하세요.

## 개발 서버 배포

개발 서버 배포는 [`server-dev-cd.yml`](../.github/workflows/server-dev-cd.yml)이
담당합니다. `develop`에 변경사항이 반영되면 다음 순서로 배포합니다.

1. 백엔드 테스트와 JAR 빌드
2. 개발 서버용 Docker image 빌드
3. `jumin-dev` ARM64 self-hosted runner에서 백엔드 컨테이너 실행
4. `/actuator/health` 확인

개발 서버는 AWS RDS를 사용하므로 PostgreSQL 컨테이너와 `postgres-data` 볼륨을
사용하지 않습니다. RDS와 외부 API 접속 정보는 GitHub `development` Environment의
secret으로 전달합니다.

배포 환경에는 다음이 필요합니다.

- Docker Engine과 Docker Compose plugin
- `jumin-dev` self-hosted runner
- EC2에서 RDS로 연결할 수 있는 네트워크 권한
- EC2에 연결된 IAM Role의 `/jumin/dev/backend` 로그 기록 권한
- CloudWatch Logs로 나가는 outbound HTTPS 연결
- GitHub `development` Environment secret

## 로그

로컬은 애플리케이션의 stdout/stderr를 콘솔에서 확인합니다. 개발 서버의
`jumin-backend-dev` 컨테이너는 Docker `awslogs` logging driver로 stdout/stderr를
서울 리전(`ap-northeast-2`)의 `/jumin/dev/backend` CloudWatch Logs 그룹에 전송합니다.
로그 그룹은 배포 전에 생성하며 Docker가 자동으로 만들지 않습니다.

개발 서버의 CloudWatch 로그 설정은 다음을 사용합니다.

```text
로그 클래스: Standard
보존 기간: 7일
전송 방식: non-blocking
버퍼 크기: 10m
```

EC2에 연결된 IAM Role에는 해당 로그 그룹의 로그 스트림 조회·생성·기록 권한만
부여합니다. 로그 수집 설정을 변경하면 backend 컨테이너를 재생성해야 반영됩니다.
운영 환경의 로그 수집·검색·알림도 CloudWatch Logs를 사용합니다.

## 관련 문서

- [서버 README](../server/README.md): 애플리케이션 실행과 테스트
- [팀 컨벤션](../docs/team-conventions.md): 브랜치와 커밋 규칙
- [Server CI](../.github/workflows/server-ci.yml): 백엔드 검증 workflow
- [Server CD](../.github/workflows/server-dev-cd.yml): 개발 서버 배포 workflow
