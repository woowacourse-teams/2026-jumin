# 서버

Spring Boot 백엔드 애플리케이션입니다. 애플리케이션은 로컬에서 직접 실행하고,
PostgreSQL만 Docker Compose로 실행합니다.

## 준비 사항

- Java 21
- Docker와 Docker Compose

## 로컬 실행

레포지토리 루트에서 PostgreSQL을 실행합니다.

```bash
docker compose -f infra/docker-compose.local.yml up -d --wait
```

서버를 실행합니다.

```bash
cd server
./gradlew bootRun
```

별도의 환경변수가 없으면 다음 기본값을 사용합니다.

| 환경변수 | 기본값 |
| --- | --- |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5432` |
| `DB_NAME` | `jumin` |
| `DB_USERNAME` | `jumin` |
| `DB_PASSWORD` | `jumin` |

환경변수를 변경하려면 `infra/.env.example`을 `infra/.env`로 복사해 Docker Compose
설정을 변경하고, 같은 값을 셸이나 IDE의 Spring 실행 설정에도 지정합니다.

애플리케이션이 실행되면 헬스 체크를 확인할 수 있습니다.

```bash
curl http://localhost:8080/actuator/health
```

## 테스트

테스트는 Testcontainers가 PostgreSQL 컨테이너를 자동으로 실행하므로 Docker가 실행
중이어야 합니다.

```bash
./gradlew clean check
```

## 종료

PostgreSQL 컨테이너와 네트워크를 종료하되 데이터 볼륨은 보존합니다.

```bash
docker compose -f infra/docker-compose.local.yml down
```

다음 명령은 로컬 PostgreSQL 데이터까지 삭제합니다.

```bash
docker compose -f infra/docker-compose.local.yml down --volumes
```
