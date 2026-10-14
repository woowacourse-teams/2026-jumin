# 결정: 지도 주차장 필터와 TSK-171 변경 요약

- 상태: Accepted
- 결정일: 2026-10-13
- 범위: 지도 목록 API, 오늘 무료 판정, 기계식 정보의 CSV 입력과 DB 저장
- 문서 정리: 미커밋 후속 문서 3개를 통합했다. 최종 정책은 본문, 대체된 정책은 아래 결정 이력에 기록한다.

## 변경 요약

| 변경 | 담당 코드와 역할 |
| --- | --- |
| 숫자형 LOD 점수 | [계산기](../src/main/java/jumin/domain/parking/service/ParkingLodScoreCalculator.java)가 구획 수로 계산하고 [응답 DTO](../src/main/java/jumin/domain/parking/dto/ParkingLotViewportResponse.java)가 `score`를 반환 |
| 필터 입력 | [요청 DTO](../src/main/java/jumin/domain/parking/dto/ParkingLotViewportRequest.java)가 생략한 필터를 `false`로 처리 |
| 오늘 무료 판정 | [서비스](../src/main/java/jumin/domain/parking/service/ParkingSearchService.java)가 한국 요일을 구하고 [저장소](../src/main/java/jumin/domain/parking/repository/ParkingLotRepository.java)가 두 필터를 기존 공간 쿼리에 적용 |
| 기계식 데이터 | [엔티티](../src/main/java/jumin/domain/parking/entity/ParkingLot.java)와 [CSV 모델](../src/main/java/jumin/domain/admin/parking/model/ParkingLotValues.java)에 `boolean mechanical` 추가 |
| CSV 입력과 저장 | [열 정의](../src/main/java/jumin/domain/admin/parking/csv/ParkingCsvColumn.java), [파서](../src/main/java/jumin/domain/admin/parking/csv/ParkingCsvRowReader.java), [CSV 저장소](../src/main/java/jumin/domain/admin/parking/repository/ParkingCsvRepository.java)에 기계식 변환, 조회, 추가와 갱신 반영 |
| DB 전환 | V11에서 `NOT NULL DEFAULT FALSE`인 기계식 컬럼을 추가하고 기존 행에도 false 적용 |

요일 처리는 기존 서비스와 `Clock`을 사용한다. 별도 요일 enum이나 판별 컴포넌트는 추가하지 않는다.
추천 검색의 요금 계산과 운영시간 판정, 프론트엔드 구현은 이번 변경 범위 밖이다.

## API 계약

```text
GET /api/parking/viewport
    ?southLatitude=37.5600&westLongitude=126.9700
    &northLatitude=37.5750&eastLongitude=126.9900
    &freeOnly=true&excludeMechanical=true
```

| 파라미터 | 기본값 | `true`일 때 포함 조건 |
| --- | --- | --- |
| `freeOnly` | `false` | 오늘 요일에 해당하는 유료 여부가 `false` |
| `excludeMechanical` | `false` | 기계식 여부가 `false` |

두 필터를 켜면 두 조건을 모두 만족해야 한다. 생략하거나 `false`이면 해당 필터를 적용하지 않는다.
응답 항목은 `id`, `latitude`, `longitude`, 숫자형 `score`이며 [LOD 정책과 응답 예시](2026-10-13-parking-lod-score.md)를 따른다.
기존 활성 상태, 위치와 이름과 주소 존재, 지도 경계 포함 조건과 ID 오름차순을 유지한다.
`totalCount`는 필터 적용 후 목록 크기다. 결과가 없으면 200과 빈 목록을 반환한다.

## 오늘 무료 판정

서버가 주입된 `Clock`과 `Asia/Seoul`로 요청 시점의 날짜를 구한다. 클라이언트 날짜 입력은 없다.

| 요일 번호 | 오늘의 요일 | 판정 컬럼 |
| --- | --- | --- |
| 1~5 | 월요일부터 금요일 | `weekday_paid` |
| 6 | 토요일 | `saturday_paid` |
| 7 | 일요일 | `holiday_paid` |

- 해당 값이 `false`인 운영 정보가 있을 때만 포함한다. `true`, `null`, 운영 정보 없음은 제외한다.
- 다른 요일의 유료 여부나 공통 요금은 오늘의 `false` 판정을 바꾸지 않는다.
- 오늘의 값이 `null`일 때 요금 0원이나 기본 무료시간으로 무료를 추정하지 않는다.
- 요일만 구분한다. 평일 공휴일은 평일, 토요일 공휴일은 토요일로 처리한다.
- 현재 영업 여부와 시간대별 무료는 판정하지 않는다. 공휴일 달력과 함께 별도 작업이다.

## 기계식 DB와 CSV 계약

- `parking_lots.mechanical`은 `BOOLEAN NOT NULL DEFAULT FALSE`, Java에서는 기본형 `boolean`이다.
- CSV 헤더 `parking_lots.mechanical`은 필수다. 빠지면 기존 헤더 검증에 따라 422를 반환한다.
- 대문자 `Y`는 `true`, `N`과 빈 값은 `false`다. 기존 공백 제거 규칙에 따라 일반 공백만 있는 값도 빈 값으로 처리한다.
- 그 외 값은 검증 오류다. 다른 불리언 열의 `true/false` 입력 규칙과 유료 여부의 `null` 의미는 유지한다.
- 기계식 변경도 CSV 비교와 저장에 반영하며 동일한 입력은 재저장하지 않는다.

[V11](../src/main/resources/db/migration/V11__add_parking_mechanical.sql)에서 `BOOLEAN NOT NULL DEFAULT FALSE` 컬럼을 추가한다.
기존 행에도 `false`가 적용되고, 새 행에서 값을 생략하면 `false`가 저장된다. 명시적인 `null`은 거부한다.
이번 작업의 컬럼 추가와 기본값 설정은 사용자 요청에 따라 배포 전 단일 마이그레이션으로 통합했다.
최신 develop의 좋아요 테이블 마이그레이션이 V10을 사용하므로, 기계식 컬럼은 V11로 적용한다.
실제 dev DB에는 이번 작업에서 적용하지 않았으며, 배포 시 마이그레이션과 CSV 새 헤더 적용이 필요하다.

## 결정 이력

사용자 요청에 따른 변경 순서다. 각 행의 이전 정책은 오른쪽 결정으로 대체되었다.

| 항목 | 이전 정책 | 최종 결정과 이유 |
| --- | --- | --- |
| 무료 범위 | 평일, 토요일, 공휴일이 모두 무료 | 주말 무료 주차장도 해당 날짜에 조회하도록 오늘 요일만 판정 |
| CSV 기계식 빈 값 | `null`로 저장 | 빈 값도 N으로 판정하도록 `false`로 변환 |
| DB 기계식 `null` | 기존 데이터는 미확인으로 유지, 재업로드 때 변환 | CSV, 엔티티, DB를 일치시키도록 V11에서 기존 행도 `false`로 초기화하고 `null` 금지 |

공휴일 달력은 이번 범위에서 제외하기로 합의했다. 무료 여부의 `null`을 0원 요금으로 보완하는 방안은 건수만 조사했고 정책에 적용하지 않았다.

## 검증 결과

| 범위 | 검증 내용 |
| --- | --- |
| API | 필터 생략, 한 개만 지정, 조합, 잘못된 입력, 숫자형 점수 |
| 서비스와 저장소 | 모든 요일, 한국 자정 경계, 유료와 미확인 제외, 다른 요일과 공통 요금의 영향, 기존 공간 조건과 순서 |
| CSV와 DB | Y/N/빈 값, 잘못된 값과 누락 헤더, 변경 저장과 반복 업로드, DB 기본값과 엔티티 매핑 |
| 마이그레이션 | 기존 행의 false 초기화, 신규 true/false 저장, 생략 시 false, 명시적 null 거부 |
| 통합과 회귀 | CSV 업로드 후 평일과 주말의 지도 필터와 LOD 점수, 기존 추천 검색 |

2026-10-13, Java 21.0.12와 Docker Testcontainers에서
`DOCKER_DEFAULT_PLATFORM=linux/amd64 ./gradlew clean check bootJar` 성공.
전체 **357개 테스트 통과**, 실패, 오류, 건너뜀 0개다.

공휴일 달력, 방문 시간 기준 무료 판정이나 기계식 입력 정책이 바뀌면 해당 결정을 재검토한다.
