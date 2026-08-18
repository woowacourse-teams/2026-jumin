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
