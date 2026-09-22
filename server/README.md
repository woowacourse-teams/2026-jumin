# Jumin Server

![Java](https://img.shields.io/badge/Java-21-007396)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-4.1-6db33f)
![Database](https://img.shields.io/badge/DB-PostgreSQL%20%2B%20PostGIS%20%2B%20pgRouting-336791)

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

현재 로컬 PostGIS + pgRouting 이미지는 amd64 전용입니다. arm64에서는 Docker가 amd64 이미지를 에뮬레이션하도록 임시 환경변수를 붙입니다.

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

Base URL은 별도 설정이 없으면 기본값을 사용하지만, 외부 API 인증 정보는 별도로 설정해야 합니다.

환경변수를 변경하려면 `../infra/.env.example`을 `../infra/.env`로 복사해
Compose 설정을 변경하고, 같은 값을 셸이나 IDE의 Spring 실행 설정에도 지정합니다.

외부 검색 API를 사용하려면 `LOCAL_SEARCH_CLIENT_ID`와
`LOCAL_SEARCH_CLIENT_SECRET`을, 역지오코딩 API를 사용하려면
`REVERSE_GEOCODING_CLIENT_ID`와 `REVERSE_GEOCODING_CLIENT_SECRET`을
각각 실행 환경에 설정해야 합니다.

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

## PostGIS·pgRouting 확인

Spring Boot와 Flyway가 실행된 뒤 컨테이너에서 확장 버전을 확인할 수 있습니다.

```bash
container_id="$(docker compose -f ../infra/docker-compose.local.yml ps -q postgres)"
docker exec "$container_id" \
  psql -U jumin -d jumin -tAc \
  "SELECT extname, extversion FROM pg_extension WHERE extname IN ('postgis', 'pgrouting') ORDER BY extname;"
```

정상적으로 실행되면 `postgis`와 `pgrouting`의 버전이 출력됩니다.

## 서울시 보행 네트워크 적재

도보거리 계산은 서울시 보행 네트워크와 PostgreSQL의 pgRouting을 사용합니다.
서울시 열린데이터광장에서 Open API 인증키를 발급받은 뒤 다음처럼 적재합니다.

```bash
export SEOUL_OPEN_DATA_API_KEY=발급받은_인증키
../infra/scripts/import-seoul-walking-network.sh
```

특정 자치구로 POC를 할 때만 아래처럼 범위를 제한할 수 있습니다. 운영용 전체 적재에는
`SEOUL_OPEN_DATA_SGG_NM`을 지정하지 않습니다. 자치구 경계를 넘는 링크는 POC 그래프에서
제외되므로, 이 데이터는 해당 자치구의 경로 정확도 검증용으로만 사용해야 합니다.

```bash
SEOUL_OPEN_DATA_SGG_NM=종로구 \
../infra/scripts/import-seoul-walking-network.sh
```

운영 RDS에 직접 적재할 때는 로컬 Docker 대신 `DB_TARGET=direct`를 사용합니다.
`psql`이 실행 가능한 환경에서 DB 접속 정보를 환경변수로 설정합니다.

```bash
DB_TARGET=direct \
DB_HOST=RDS_HOST DB_PORT=5432 DB_NAME=jumin \
DB_USERNAME=애플리케이션_DB_사용자 DB_PASSWORD=DB_비밀번호 \
../infra/scripts/import-seoul-walking-network.sh
```

`TbTraficWlkNet`은 `NODE`와 `LINK` 행이 섞여 반환됩니다. 스크립트는 각 유형을
분리하고, 소수점으로 표현되는 ID를 정수로 정규화한 뒤 적재합니다. 서울시 Sheet
화면에서는 전체 CSV도 내려받을 수 있지만, 자동 갱신에는 Open API를 사용합니다.

스크립트는 `TbTraficWlkNet` 데이터를 내려받아 `walking_nodes`와
`walking_edges`에 적재합니다. 서울시 API 인증키는 애플리케이션의 검색 요청마다
사용하지 않고, 보행 네트워크를 갱신할 때만 필요합니다.

검색 시 PostgreSQL의 `ST_DWithin`으로 직선거리 600m 이내 후보만 조회해 추천 결과로
반환합니다. 목적지와 주차장 좌표를 반경 100m 이내의 연결 가능한 보행 노드들에 연결하고,
연결된 조합 중 가장 짧은 경로를 `pgr_dijkstraCost`로 계산합니다. 도보거리가
600m를 넘어도 결과에는 유지합니다. 보행망에 연결되지 않아 경로를 찾지 못한 주차장은
`distanceMeters`를 `null`로 반환합니다. 보행망 자체가 아직 적재되지 않은 환경에서는
직선거리로 대체하지 않고 보행거리 계산 불가 오류를 반환합니다. 상세 조회에서 개별 경로를
찾지 못한 경우에는 `WALKING_ROUTE_NOT_FOUND`(404) 오류를 반환합니다.

현재 구현은 좌표를 가장 가까운 보행 링크의 임의 지점이 아니라 반경 내 보행 노드 후보에
연결합니다. 따라서 주차장 보행자 출입구 좌표와 보행망 노드가 크게 어긋나는 경우에는
적재 전에 좌표를 보정하거나 `MAX_SNAP_DISTANCE_METERS` 기준을 조정해야 합니다.
서울시 원본에 방향성 정보가 확인되지 않는 링크는 양방향(`reverse_cost = cost`)으로
적재하므로, 실제 일방 통행·출입 제한이 있는 구간은 별도 검증이 필요합니다.

로컬 DB 이미지는 pgRouting이 포함된 `pgrouting/pgrouting:18-3.6-3.8`을 사용합니다.
새 로컬 볼륨은 초기화 스크립트가 pgRouting 확장을 자동으로 생성합니다. 기존 볼륨과 dev·prod DB에는 Flyway V7이 pgRouting 확장을 생성합니다.
DB 서버에 pgRouting이 설치되어 있어야 하며, Flyway 계정에는 확장 생성 권한이 필요합니다.
권한이 없다면 DBA가 사전에 확장을 생성해야 합니다. 확장 생성 실패 시 마이그레이션도 실패합니다.
확장이 없으면 애플리케이션은 `503 SERVICE_UNAVAILABLE`로 보행거리 계산 실패를 반환합니다.

운영 RDS에서 다음 쿼리로 확인할 수 있습니다.

```sql
SELECT current_setting('server_version');
SELECT name, default_version
FROM pg_available_extensions
WHERE name IN ('postgis', 'pgrouting');
```

`pgrouting`이 조회되면 V7에서 활성화할 수 있습니다. 애플리케이션 DB 사용자가 해당
확장 함수를 호출할 수 있는지도 확인합니다. dev·prod 데이터 적재는
[수동 적재 workflow 운영 절차](../infra/README.md#보행망-수동-적재)를 따릅니다.

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
