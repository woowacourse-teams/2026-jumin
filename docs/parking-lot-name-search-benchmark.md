# 주차장 이름 검색 인덱스 실험

[PR #420 리뷰](https://github.com/woowacourse-teams/2026-jumin/pull/420#discussion_r4538970560)에서 제안한 `LIKE + pg_trgm`을 이름 검색에 적용해 비교했다. 기본 실행 계획에서는 일부 검색어가 크게 빨라졌고, 두 글자 검색어와 대부분의 행에 일치하는 검색어에서는 지연이 반복해서 늘었다. PR #420에서는 `strpos`를 유지한다.

## 실험 조건

- 로컬 PostgreSQL 18.3과 프로젝트의 pgJDBC 42.7.11을 사용했다. DB는 Apple Silicon에서 amd64 이미지를 실행했다.
- `parking_lots`에 합성 데이터 30,000건을 적재했다. 101번째마다 이름에 `강남역`을 넣었고, 모든 이름에 `주차장`을 넣었다. 나머지 행은 `광화문`을 포함한 여덟 지역으로 나눴다. 29번째마다 비활성으로 지정했고 모든 좌표는 유효했다.
- 같은 DB에서 두 쿼리를 번갈아 실행했다. 연결별 준비 실행 후 라운드마다 동일한 검색어 순서를 사용하고, 전후 실행 순서를 교대했다. JDBC에서 결과를 읽었고 매 실행의 ID와 정렬 순서를 비교했다.
- 표의 지연은 JDBC 실행과 결과 읽기에 걸린 시간이며, 라운드 전체 표본에서 계산했다. 처리량은 라운드별 처리량의 중앙값이다. 운영 데이터, 실제 검색어 분포, 카카오 호출을 포함한 API 응답 시간은 측정 범위 밖이다.

비교할 때 [저장소 쿼리](../server/src/main/java/jumin/domain/parking/repository/ParkingLotRepository.java)의 이름 조건만 아래처럼 바꿨다. 활성 여부, 좌표 조건, 이름·ID 정렬, 15건 제한은 양쪽에 동일하게 적용했다. 이스케이프 문자 `!`를 먼저 처리한 뒤 `%`와 `_`를 이스케이프해 검색어를 문자 그대로 매칭했다.

```sql
-- 기존 이름 조건
AND strpos(lower(parking_lot.name), lower(:query)) > 0

-- 실험의 이름 조건
AND lower(parking_lot.name) LIKE
    '%' || replace(replace(replace(lower(:query), '!', '!!'), '%', '!%'), '_', '!_') || '%'
    ESCAPE '!'
```

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_parking_lots_lower_name_trgm
    ON parking_lots USING GIN (lower(name) gin_trgm_ops);
VACUUM ANALYZE parking_lots;
```

## 기본 실행 계획

`plan_cache_mode = auto`에서 다섯 검색어를 같은 비중으로 섞었다. 연결 1개와 4개에서 각각 6라운드를 실행했다. 조건별로 검색어마다 기존·실험 쿼리를 각 960회 측정했다.

동시 연결 4개 결과다. 단위는 ms다.

| 검색어 | p50 기존 → 실험 | p95 기존 → 실험 | p99 기존 → 실험 | 최댓값 기존 → 실험 |
| --- | ---: | ---: | ---: | ---: |
| `강남역` | 38.83 → 3.78 | 49.55 → 6.67 | 58.24 → 8.27 | 91.27 → 111.62 |
| `강남` | 38.48 → 84.79 | 48.17 → 107.77 | 58.57 → 200.51 | 91.98 → 816.99 |
| `주차장` | 97.85 → 141.78 | 120.81 → 178.48 | 147.33 → 315.37 | 191.65 → 1,174.22 |
| `광화문` | 53.56 → 29.06 | 66.67 → 36.24 | 78.31 → 49.19 | 95.12 → 464.14 |
| `없는이름` | 37.10 → 1.06 | 47.31 → 3.80 | 61.06 → 4.82 | 99.89 → 8.19 |

전체 처리량은 초당 72.5건에서 71.8건으로 바뀌었고 라운드별 범위는 각각 69.3~74.8건, 59.6~76.4건이었다. `강남`과 `주차장`의 p99는 6라운드 모두 증가했다. 단일 연결에서도 두 검색어의 p50은 증가했으며 p99 증가는 `강남` 4라운드, `주차장` 3라운드에서 관찰됐다.

`EXPLAIN (ANALYZE, BUFFERS)`에서 `strpos`는 순차 스캔을 했다. JDBC 실행을 반복하자 실험 쿼리는 검색어 값과 무관한 공통 계획을 재사용했다. 그 계획에서 GIN은 `강남역`의 후보를 297행으로 줄였다. `강남`에는 검색 패턴에서 추출할 수 있는 세 글자 조각이 없었고 `주차장`은 모든 이름에 들어 있었다. 두 검색어 모두 GIN이 30,000행을 후보로 반환했고 PostgreSQL은 테이블을 읽어 조건을 다시 검사했다. [PostgreSQL 준비된 문장의 실행 계획](https://www.postgresql.org/docs/18/sql-prepare.html) · [pg_trgm 인덱스](https://www.postgresql.org/docs/18/pgtrgm.html#PGTRGM-INDEX)

## 검색어별 실행 계획

실험 쿼리의 JDBC 문장에만 `PGStatement.setPrepareThreshold(0)`을 적용했다. 검색어를 계속 바인딩하면서 실행 시점에 PostgreSQL이 해당 검색어로 계획을 세우게 했다. 동시 연결 4개에서 아래 세 검색어를 같은 비중으로 섞어 6라운드 동안 검색어당 전후 각 480회 측정했다. [pgJDBC 문장별 준비 임계값](https://jdbc.postgresql.org/documentation/publicapi/org/postgresql/PGStatement.html)

| 검색어 | 실험 쿼리의 계획 | p50 기존 → 실험 | p99 기존 → 실험 | 최댓값 기존 → 실험 |
| --- | --- | ---: | ---: | ---: |
| `강남역` | GIN 인덱스 | 38.46 → 3.89 ms | 61.20 → 8.49 ms | 77.50 → 33.39 ms |
| `강남` | 순차 스캔 | 38.24 → 38.08 ms | 60.02 → 54.06 ms | 67.22 → 114.65 ms |
| `주차장` | 순차 스캔 | 94.61 → 94.21 ms | 146.02 → 136.61 ms | 148.20 → 179.98 ms |

`강남역`의 p99는 모든 라운드에서 낮아졌다. `강남`과 `주차장`의 p50은 비슷했고 p99는 각각 3라운드에서 증가했다. 두 검색어 모두 최댓값은 늘었다. 별도로 단일 연결에 `force_custom_plan`을 설정해 서버 처리 시간과 JDBC 왕복을 나눠 계측한 결과, 긴 지연의 대부분은 PostgreSQL 안에서 발생했다. 다만 이 계측에서는 두 검색어의 p99가 같은 방향으로 움직이지 않아 순차 스캔에서 남은 지연 차이의 원인은 특정하지 못했다.

후속 실험에서는 이 검색 쿼리에만 준비 임계값을 적용하거나 DB 조회 트랜잭션에서 `SET LOCAL plan_cache_mode = force_custom_plan`을 적용할 수 있다. 실제 검색어 분포와 동시성에서 p99를 비교하고, `SET LOCAL`을 사용하면 추가 DB 왕복도 측정에 포함한다. 마이그레이션을 적용할 RDS에서 `pg_trgm` 사용 가능 여부와 확장 생성 권한을 확인한다. [PostgreSQL 트랜잭션 범위 설정](https://www.postgresql.org/docs/18/sql-set.html) · [RDS 확장 설치 권한](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Extensions.html)
