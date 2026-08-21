# Jumin Server

![Java](https://img.shields.io/badge/Java-21-007396)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.1-6db33f)
![Database](https://img.shields.io/badge/DB-PostgreSQL%20%2B%20PostGIS-336791)

Spring Boot 백엔드 애플리케이션입니다. 애플리케이션은 로컬에서 직접 실행하고,
PostgreSQL은 Docker Compose로 실행합니다.

> [!NOTE]
> 아래 명령은 모두 `server/` 디렉터리에서 실행합니다.
> `infra/`의 구성 설명은 [infra README](../infra/README.md)를 참고하세요.

## 준비 사항

- Java 21
- Docker Desktop 또는 Docker Engine
- Docker Compose

## 빠른 시작

### 1. 호스트 아키텍처 확인

```bash
uname -m
```

| 결과     | 실행 방식                                              |
| -------- | ------------------------------------------------------ |
| `x86_64` | amd64 명령을 그대로 실행                               |
| `arm64`  | `DOCKER_DEFAULT_PLATFORM=linux/amd64`를 명령 앞에 추가 |

### 2. 로컬 PostgreSQL 실행

#### amd64

```bash
docker compose -f ../infra/docker-compose.local.yml up -d --wait
```

#### arm64 (Apple Silicon)

현재 로컬 PostGIS 이미지는 amd64 전용입니다. arm64에서는 Docker가 amd64 이미지를 에뮬레이션하도록 임시 환경변수를 붙입니다.

```bash
DOCKER_DEFAULT_PLATFORM=linux/amd64 \
docker compose -f ../infra/docker-compose.local.yml up -d --wait
```

> [!TIP]
> 위 환경변수는 해당 명령에만 적용됩니다. 별도로 `export`했다면 작업 후
> `unset DOCKER_DEFAULT_PLATFORM`으로 해제하세요.

### 3. Spring Boot 실행

```bash
./gradlew bootRun --args='--spring.profiles.active=local'
```

애플리케이션이 실행되면 헬스 체크를 확인합니다.

```bash
curl http://localhost:8080/actuator/health
```

## 환경변수

별도 설정이 없으면 기본값을 사용합니다.

환경변수를 변경하려면 `../infra/.env.example`을 `../infra/.env`로 복사해
Compose 설정을 변경하고, 같은 값을 셸이나 IDE의 Spring 실행 설정에도 지정합니다.

외부 검색 API를 사용하려면 `LOCAL_SEARCH_CLIENT_ID`와
`LOCAL_SEARCH_CLIENT_SECRET`도 실행 환경에 설정해야 합니다.

> [!WARNING]
> `postgres-data` 볼륨이 이미 존재하면 DB 이름·사용자·비밀번호 변경이 기존
> 데이터베이스에 자동 반영되지 않습니다. 기존 DB에 직접 적용하거나 볼륨을
> 삭제하고 다시 초기화해야 합니다.

## 테스트

테스트는 Testcontainers가 PostgreSQL 컨테이너를 자동으로 실행하므로 Docker가
실행 중이어야 합니다.

### amd64

```bash
./gradlew clean check
./gradlew bootJar
```

`clean check bootJar`를 한 번에 실행할 수도 있습니다.

```bash
./gradlew clean check bootJar
```

### arm64 (Apple Silicon)

```bash
DOCKER_DEFAULT_PLATFORM=linux/amd64 ./gradlew clean check
```

> [!TIP]
> arm64에서도 Testcontainers가 amd64 이미지를 사용하도록 Compose와 동일한
> 환경변수를 적용합니다.

## PostGIS 확인

Spring Boot와 Flyway가 실행된 뒤 컨테이너에서 확장 버전을 확인할 수 있습니다.

```bash
container_id="$(docker compose -f ../infra/docker-compose.local.yml ps -q postgres)"
docker exec "$container_id" \
  psql -U jumin -d jumin -tAc 'SELECT postgis_full_version();'
```

정상적으로 실행되면 `POSTGIS="3.6...` 형식의 버전이 출력됩니다.

## 종료

컨테이너를 종료하되 데이터 볼륨은 보존합니다.

```bash
docker compose -f ../infra/docker-compose.local.yml down
```

데이터까지 초기화해야 할 때만 다음 명령을 사용합니다.

> [!CAUTION]
> 아래 명령은 `postgres-data` 볼륨과 로컬 PostgreSQL 데이터를 삭제합니다.

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
