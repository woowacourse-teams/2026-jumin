# 서버

Spring Boot 기반 백엔드 애플리케이션입니다.

## 준비 사항

- Java 21
- Docker 및 Docker Compose

## 로컬 실행

`server/` 디렉터리에서 실행합니다.

1. 로컬 PostgreSQL을 실행합니다.

```bash
docker compose -f ../infra/docker-compose.local.yml up -d --wait
```

2. 백엔드를 실행합니다.

```bash
./gradlew bootRun --args='--spring.profiles.active=local'
```

로컬 데이터베이스 기본값은 다음과 같습니다.

| 환경변수 | 기본값 |
| --- | --- |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `jumin` |
| `DB_USERNAME` | `jumin` |
| `DB_PASSWORD` | `jumin` |

기본값을 변경하려면 `infra/.env.example`을 참고해 `infra/.env`를 설정합니다.
외부 검색 API를 사용하려면 `LOCAL_SEARCH_CLIENT_ID`와
`LOCAL_SEARCH_CLIENT_SECRET`도 실행 환경에 설정해야 합니다.

서버가 실행되면 health check로 상태를 확인할 수 있습니다.

```bash
curl http://localhost:8080/actuator/health
```

## 테스트 및 빌드

Docker가 실행 중인 상태에서 다음 명령을 사용합니다.

```bash
./gradlew clean check
./gradlew bootJar
```

`clean check bootJar`를 한 번에 실행할 수도 있습니다.

```bash
./gradlew clean check bootJar
```

## 종료

PostgreSQL을 종료하고 데이터는 유지합니다.

```bash
docker compose -f ../infra/docker-compose.local.yml down
```

로컬 PostgreSQL 데이터까지 초기화할 때만 다음 명령을 사용합니다.

```bash
docker compose -f ../infra/docker-compose.local.yml down --volumes
```

## 배포

- `develop` 또는 `main` 대상 PR·push: [Server CI](../.github/workflows/server-ci.yml)
- `develop` push: 개발 서버 CD [workflow](../.github/workflows/server-dev-cd.yml)
- 개발 서버 데이터베이스: AWS RDS
- 개발 서버 실행: Docker Compose

배포 환경의 Secret은 GitHub Environment에서 관리하며 repository에 저장하지 않습니다.
자세한 인프라 준비 내용은 [인프라 문서](../infra/README.md)를 참고합니다.
