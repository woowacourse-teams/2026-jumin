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
./gradlew bootRun --args='--spring.profiles.active=local'
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

`postgres-data` 볼륨이 이미 생성된 상태에서는 `DB_NAME`, `DB_USERNAME`,
`DB_PASSWORD`를 변경해도 기존 데이터베이스와 사용자에게 자동으로 반영되지 않습니다.
변경 사항은 기존 데이터베이스에서 직접 적용하거나, 아래의 볼륨 삭제 명령으로
PostgreSQL을 초기화한 후 다시 생성해야 합니다.

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

레포지토리 루트에서 다음 명령을 실행합니다.

PostgreSQL 컨테이너와 네트워크를 종료하되 데이터 볼륨은 보존합니다.

```bash
docker compose -f infra/docker-compose.local.yml down
```

다음 명령은 `postgres-data` 볼륨과 로컬 PostgreSQL 데이터를 모두 삭제하는
파괴적인 작업입니다.

```bash
docker compose -f infra/docker-compose.local.yml down --volumes
```
