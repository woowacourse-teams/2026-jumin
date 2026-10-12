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

관리자 인증을 사용하려면 `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD_HASH`,
`ADMIN_TOKEN_SECRET`, `ADMIN_ENV_LABEL`도 실행 환경에 설정해야 합니다.
비밀번호 원문 대신 BCrypt 해시를 사용하고, 토큰 서명 키는 32자 이상의 충분히
무작위한 값을 사용합니다. 로컬에서는 운영값이 아닌 테스트 전용 값만 사용합니다.

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

## OSM 보행 네트워크 적재

도보거리 계산은 OSM 보행 그래프와 PostgreSQL의 pgRouting을 사용합니다.
Flyway V7까지 적용한 기존 스키마를 사용합니다. 저장소 루트에서 Python 환경을 준비하고 적재합니다.

```bash
python3 -m venv build/osm-poc/venv
build/osm-poc/venv/bin/python -m pip install -r infra/scripts/osm_walking_poc/requirements.txt
OSM_PBF_DATE=260929 \
OSM_PYTHON="$PWD/build/osm-poc/venv/bin/python" \
  bash infra/scripts/import-osm-walking-network.sh
```

기본 실행은 Geofabrik 한국 전국 PBF를 받아 보행 태그와 방향·장벽을 반영합니다.
서울시 API 인증키는 필요하지 않습니다. 다운로드할 스냅샷 날짜를 `OSM_PBF_DATE`에
`YYMMDD` 형식으로 지정합니다. `OSM_PBF_FILE`로 이미 받은 파일을 사용할 수도 있습니다.
전국 변환의 좌표 캐시와 노드 중복 제거는 디스크를 사용하므로 실행 호스트에 원본·CSV·임시
파일을 저장할 공간이 필요합니다. GitHub Actions는 Geofabrik 최신 날짜를 자동으로 찾습니다.
로컬 실행은 `OSM_PBF_DATE`를 지정하고, 임시 파일을 둘 디렉터리는 필요하면 `OSM_TEMP_DIR`로 지정합니다.

```bash
DB_TARGET=direct DB_HOST=RDS_HOST DB_PORT=5432 DB_NAME=jumin \
DB_USERNAME=DB_사용자 DB_PASSWORD=DB_비밀번호 PGSSLMODE=require \
OSM_PYTHON="$PWD/build/osm-poc/venv/bin/python" \
OSM_PBF_FILE="$PWD/build/osm-poc/input/south-korea-260929.osm.pbf" \
  bash infra/scripts/import-osm-walking-network.sh
```

스크립트는 CSV 체크섬·행 수·참조·geometry를 검증한 뒤 트랜잭션으로 보행 노드·간선과
READY 메타데이터를 함께 교체합니다. 교체 중 오류는 롤백됩니다. 노드의 `source`는
`OSM`으로 명시하고 기존 간선·메타데이터 컬럼에 적재합니다. 원본 way ID·세그먼트 번호는
CSV에, 원천 해시·스냅샷 시각·정책 버전·범위는 `summary.json`에 기록합니다.
기본 적재에서 생성한 임시 파일은 종료 시 삭제합니다. 기록을 보관하려면 `export`로
미리 생성한 파일을 `OSM_GRAPH_DIR`로 지정합니다. 외부에 OSM 파생 데이터를 제공할 때는 ODbL과 출처 표시를 처리합니다.

전국 변환과 적재만 지원합니다. `OSM_GRAPH_DIR`를 지정하면 미리 생성한 CSV를 적재합니다.
저장소 루트에서 다음 명령으로 CSV를 생성할 수 있습니다.

```bash
build/osm-poc/venv/bin/python infra/scripts/build-osm-walking-poc.py export \
  --input build/osm-poc/input/south-korea-260929.osm.pbf \
  --output build/osm-poc/national-export

OSM_PYTHON="$PWD/build/osm-poc/venv/bin/python" \
OSM_GRAPH_DIR="$PWD/build/osm-poc/national-export" \
  bash infra/scripts/import-osm-walking-network.sh
```

출력은 `nodes.csv`, `edges.csv`, `excluded-ways.ndjson`, `summary.json`입니다.
연속 OSM 노드마다 간선을 만들고 차량 일방통행은 일반 보행 방향으로 사용하지 않습니다.
보행 역방향 전용 구간은 source/target과 geometry를 뒤집어 기존 양수 cost 제약을 만족합니다.
선형 장벽은 같은 층의 교차를 차단하고, 공유하는 허용 출입구 노드가 있으면 통과합니다.
노드 장벽의 기본 허용값은 `bollard`, `block`, `kerb`이며 나머지는 명시 접근 허용이 필요합니다.
연석(`kerb`)은 선형 장벽으로 표시돼도 일반 보행을 허용하며, 명시 접근 제한·잠금·해석하지 못한 조건은 유지합니다.
보행 회전 제한은 관련 도로를 제외합니다. CSV는 입력 전체를 변환한 결과만 적재할 수 있습니다.

변환·검증·적재·롤백의 기능 및 E2E 테스트는 저장소 루트에서 실행합니다.
별도 Docker DB를 생성하며 테스트 종료 시 삭제합니다.

```bash
build/osm-poc/venv/bin/python -m unittest discover -s infra/scripts/osm_walking_poc/tests -v
```

검색 시 PostgreSQL의 `ST_DWithin`으로 직선거리 600m 이내 후보만 조회해 추천 결과로
반환합니다. 목적지와 주차장 좌표를 반경 100m 이내의 연결 가능한 보행 노드들에 연결하고,
연결된 조합 중 주차장 → 목적지 방향의 가장 짧은 경로를 `pgr_dijkstraCost`로 계산합니다.
조회할 때만 간선 양 끝을 교환하고 비용은 유지한 그래프에서 목적지 노드를 시작점으로 탐색합니다. 저장된 그래프의
보행 방향은 유지하며, 검색과 상세 조회에 같은 기준을 적용합니다. 도보거리가
600m를 넘어도 결과에는 유지합니다. 보행망에 연결되지 않아 경로를 찾지 못한 주차장은
검색과 상세 조회 모두 `distanceMeters`와 `walkingDurationMinutes`를 `null`로 반환합니다.
상세 조회는 이 경우에도 200 응답으로 주차장의 요금과 운영 정보를 제공합니다.
보행망 자체가 아직 적재되지 않은 환경에서는 직선거리로 대체하지 않고
`WALKING_NETWORK_UNAVAILABLE`(503) 오류를 반환합니다.

현재 구현은 좌표를 가장 가까운 보행 링크의 임의 지점이 아니라 반경 내 보행 노드 후보에
연결합니다. 따라서 주차장 보행자 출입구 좌표와 보행망 노드가 크게 어긋나는 경우에는
적재 전에 좌표를 보정하거나 `MAX_SNAP_DISTANCE_METERS` 기준을 조정해야 합니다.
OSM의 보행 방향 태그를 반영하며 계단은 포함합니다. 휠체어 태그는 제외 기준으로 사용하지
않습니다. 바퀴 있는 차량의 통행성을 나타내는 `smoothness=impassable`도 보행 제외 기준으로
사용하지 않습니다. 소속을 확인하지 못한 고객·목적지 제한 통로와 해석하지 못한 조건은 제외합니다.
현재 좌표 접속은 출입구·담장 확인을 하지 않으므로 실제 경로 표본 확인이 필요합니다.

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
