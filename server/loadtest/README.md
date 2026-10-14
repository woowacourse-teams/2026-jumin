# API 부하 테스트

지도에서 주차장을 조회하는 **viewport API**와 **추천 검색 API**의 응답시간·실패율·처리량을 측정한다. k6와 전용 Docker Compose 환경에서 개별 Load, 혼합 Load, Stress·회복 테스트를 수행한다.

## 테스트 대상과 기준

| API | 선정 이유 | 기준 부하 | 응답시간 목표 |
| --- | --- | ---: | ---: |
| `GET /api/parking/viewport` | 지도에서 자주 호출되는 조회 API | 0.70 RPS | p95 < 300ms |
| `GET /api/parking/search` | 핵심 추천 로직과 도보거리 계산 | 0.05 RPS | p95 < 2초 |

Load는 예열 후 **10분**, API별 실패율 **1% 미만**, 요청 누락 **0건**을 기준으로 한다. 실패에는 HTTP 오류·timeout·응답 형식 검증 실패를 포함한다. RPS는 초당 요청 수, p95는 응답의 95%가 완료되는 시간이다.

> **부하 근거:** 운영의 피크 5분 평균 처리율인 viewport 0.6815 RPS·추천 0.0481 RPS를 소폭 올림했다. 혼합 부하는 두 API의 개별 피크가 동시에 발생한다고 가정한다. [산정 근거](../docs/decisions/2026-10-14-load-test-rps-from-observed-peaks.md)

Stress는 viewport **1.4 → 2.8 → 5.6 → … → 324 RPS**로 높이고 추천도 약 14:1 비율로 함께 보낸다. 단계별 **2분 탐색 → 경계 구간 10분 확인 → 기준 부하 10분 회복** 순서로 진행한다. 324 RPS는 설정 상한이다.

## 실행 환경

요청 경로는 **k6 → Nginx → Spring Boot → PostgreSQL**이며, 운영 자원 사양을 근사한 [전용 Compose](../../infra/docker-compose.loadtest.yml)를 사용한다.

| 구성 | 설정 |
| --- | --- |
| Backend | 2 CPU · 903 MiB · JVM 최대 힙 226 MiB · `prod` 프로필 |
| DB | 2 CPU · 1 GiB · PostgreSQL 18 / PostGIS 3.6 / pgRouting 3.8 |
| Nginx / k6 | `nginx:1.30.4-alpine` / `grafana/k6:2.3.0` |
| 공개 주소 | API `127.0.0.1:8081` · DB `127.0.0.1:55432` |
| DB 볼륨 | `jumin-loadtest-postgres-data` · 일반 개발 DB와 분리 |

컨테이너는 같은 호스트를 공유하고 DB는 amd64 이미지여서 ARM64에서 에뮬레이션된다. AWS의 네트워크·스토리지·CPU 크레딧은 재현하지 않으므로 결과는 해당 로컬 환경의 전후 비교로 해석한다.

## 준비

**Java 21, Docker Compose, Python 3**가 필요하다. 아래 명령은 저장소 루트에서 실행한다.

```bash
bash server/loadtest/build-backend-image.sh
docker compose --file infra/docker-compose.loadtest.yml up -d --no-build --wait
```

주차장 CSV와 전국 OSM 보행망은 별도로 적재한다. CSV 형식은 [ParkingCsvColumn](../src/main/java/jumin/domain/admin/parking/csv/ParkingCsvColumn.java), 보행망 적재 방법은 [서버 README](../README.md#osm-보행-네트워크-적재)를 참고한다. OSM 적재 시 `COMPOSE_FILE=infra/docker-compose.loadtest.yml`, `DB_NAME=jumin_loadtest`, `DB_USERNAME=loadtest`를 지정한다.

OSM 적재 스크립트는 V12 적용 후 주차장 주변 노드도 미리 저장한다. 기존 보행망을 유지하는 경우에는 두 데이터 적재 후 `SELECT refresh_parking_lot_walking_nodes(NULL::BIGINT[]);`를 한 번 실행한다. 첫 구축과 CSV 업로드는 순차적으로 진행한다.

보행망 출처는 [Geofabrik South Korea](https://download.geofabrik.de/asia/south-korea.html)이며 [OSM 저작자 표시·ODbL](https://www.openstreetmap.org/copyright)을 따른다.

## 실행 예시

강남역 주변의 두 API를 동시에 호출한다. 입출차는 **실행 시점보다 미래인 서울 시각·10분 단위**, 출차는 입차 후 24시간 이내로 지정한다. 실행 전 해당 좌표·지도 범위에서 주차장 결과가 반환되는지 확인한다.

```bash
export DESTINATION_LATITUDE=37.49795
export DESTINATION_LONGITUDE=127.02756
export ENTRY_AT='2026-10-20T12:00:00+09:00'
export EXIT_AT='2026-10-20T13:00:00+09:00'
export LOAD_PROFILE=both
export LOAD_RUN_ID="load-$(date +%Y%m%d-%H%M%S)"

mkdir -p "server/loadtest/results/$LOAD_RUN_ID"
docker compose --file infra/docker-compose.loadtest.yml run --rm --no-deps \
  --volume "$PWD/server/loadtest/parking-api-load.js:/scripts/parking-api-load.js:ro" \
  k6 run \
  --summary-export="/results/$LOAD_RUN_ID/summary.json" \
  --out="json=/results/$LOAD_RUN_ID/requests.jsonl" \
  /scripts/parking-api-load.js
```

`LOAD_PROFILE`을 `viewport` 또는 `recommendation`으로 바꾸면 API를 하나씩 측정한다. 기본 부하는 viewport 0.70 RPS·추천 0.05 RPS·10분이다. 요청 도착률을 고정하는 `constant-arrival-rate` 방식을 사용한다.

### 자동 실행 도구

| 파일 | 역할 |
| --- | --- |
| [run-individual-load.py](run-individual-load.py) | API별 예열·측정·자원 수집·이미지 복원 |
| [run-mixed-load.py](run-mixed-load.py) | 두 API 동시 측정·DB 연결 관측 |
| [run-stress-test.py](run-stress-test.py) | 단계 탐색·10분 확인·안전 중단·회복 측정 |
| [compare-mixed-load.py](compare-mixed-load.py) | 저장된 혼합 Load 결과·응답의 전후 비교 |
| [summarize-stress-test.py](summarize-stress-test.py) | 저장된 Stress 결과 집계 |

인자는 각 파일의 `--help`로 확인한다. 자동 실행기는 macOS의 `memory_pressure`를 사용한다. 혼합·Stress 실행에는 이미지 ID·코드 버전·JAR 항목별 SHA-256을 담은 manifest를 별도로 준비해야 한다. 이미지 빌드 스크립트는 manifest를 생성하지 않는다.

위 k6 직접 실행은 요청·응답 지표를 저장한다. 예열·서버 자원 수집·메모리 안전 중단·이미지 검증은 Python 자동 실행기에 포함돼 있다.

## 결과 해석

결과는 Git에서 제외되는 `results/`에 저장한다. **API별 p50/p95/p99, 실제 RPS, 완료 요청 수, 실패율, 누락 수**를 확인한다. 자동 실행기는 CPU·메모리·DB 연결·SQL 통계와 실행 조건도 저장한다.

| Stress 결과 | 의미 |
| --- | --- |
| `passed` | 누락·안전 중단 없이 목표 충족 |
| `threshold_failed` | 유효한 실행에서 목표 초과 |
| `invalid` | 재시도 후에도 누락이 남거나 안전 중단 발생 · 한계 판정 제외 |

자동 실행기는 DB working set이 한도의 90% 이상인 표본이 3회 연속이거나 Backend/DB에 새 OOM kill이 발생하면 안전 중단한다. Stress 시작 전·회복 후 응답은 같은 실행 안에서 비교하고, 확인 요청은 부하 지표에서 제외한다.

전후 비교에서는 **입력·전체 데이터·DB 버전·자원 제한·예열·요청량·측정 시간**을 동일하게 유지하고 코드·이미지 버전을 기록한다. 추천 0.05 RPS·10분은 약 30건이므로 p99와 낮은 실패율의 해석에 표본 한계가 있다. 2분 Stress 통과만으로 지속 처리 용량을 확정하지 않는다.

## 종료

```bash
docker compose --file infra/docker-compose.loadtest.yml down
```

DB 볼륨은 유지된다.
