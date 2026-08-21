# 인프라

![Scope](https://img.shields.io/badge/scope-local%20development-4c8bf5)
![Database](https://img.shields.io/badge/database-PostgreSQL%2018%20%2B%20PostGIS%203.6-336791)

`infra/`는 로컬 데이터베이스와 실행 환경 설정을 관리합니다. 비밀 값은 저장하지
않고, 필요한 환경변수 이름만 `.env.example`에 제공합니다.

> [!NOTE]
> 이 문서는 인프라 구성의 **소유 범위**를 설명합니다. 실제 실행 명령은
> [서버 README](../server/README.md)를 단일 기준으로 사용합니다.

## 구성

| 경로 | 역할 |
| --- | --- |
| `docker-compose.local.yml` | 로컬 PostgreSQL + PostGIS 컨테이너 |
| `.env.example` | 로컬 DB 접속 환경변수 예시 |

## 로컬 DB 구성

| 항목 | 값 |
| --- | --- |
| 이미지 | `postgis/postgis:18-3.6-alpine` |
| 기본 포트 | `127.0.0.1:5432` |
| 데이터 볼륨 | `postgres-data` |
| 아키텍처 | amd64 기본, arm64는 amd64 에뮬레이션 |

### 실행 가이드

호스트 아키텍처 확인, Compose 기동, Testcontainers 실행, PostGIS 확인,
종료·볼륨 초기화 명령은 [서버 README](../server/README.md)의
「아키텍처별 실행」과 「테스트」를 참고하세요.

## 운영 원칙

- 로컬 PostGIS 이미지는 amd64 전용 이미지를 유지합니다.
- Apple Silicon에서는 실행 명령에 `DOCKER_DEFAULT_PLATFORM=linux/amd64`를
  임시로 붙입니다.
- 운영 RDS와 배포 환경은 이 로컬 Compose 설정의 범위에 포함하지 않습니다.

`postgres-data` named volume은 로컬 PostgreSQL container의 데이터를 보존하기
위한 것입니다. 개발 서버용 Compose에는 PostgreSQL과 이 volume을 포함하지
않습니다.

## 개발 서버 backend 배포

개발 서버 배포는 `.github/workflows/server-dev-cd.yml`이 담당합니다. EC2의
`jumin-dev` ARM64 self-hosted runner에서 검증된 JAR로 Docker image를 만들고
Docker Compose로 backend container를 실행합니다. RDS 접속 정보는 GitHub
`development` Environment secret으로 전달합니다.

개발 서버의 데이터베이스는 AWS RDS입니다. 따라서 개발 서버에서
`postgres-data` volume을 만들거나 PostgreSQL container를 실행하지 않습니다.

배포 전 runner에 다음 경로와 권한을 준비합니다.

```bash
sudo install -d -m 2775 /opt/jumin-dev/backend/releases
sudo chown -R <runner-user>:<runner-user> /opt/jumin-dev/backend
```

Docker Compose의 `restart: unless-stopped`로 container 프로세스 장애와 Docker
daemon 재시작에 대응합니다. EC2 자체 재부팅 시 Docker 서비스가 자동 시작되도록
설정해야 합니다.
