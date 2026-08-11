# 주차장 상세 스펙

## 1. 진입

Route: `/parking-lots/:parkingLotId`

| Origin             | 상세 request                          |
| ------------------ | ------------------------------------- |
| 추천 결과·더보기   | 목적지 좌표, `entryAt`, `exitAt` 포함 |
| 최근 이용·직접 URL | 검색 조건 전부 생략                   |

검색 조건 네 값은 모두 보내거나 모두 생략한다.

API: [`GET /api/parking-lots/{parkingLotId}`](../backend-api-contract.md#6-주차장-상세)

## 2. 표시 정보

- 주차장명과 주소
- 지도 위치
- 현재 검색의 추천 주차장이면 추천 유형 badge
- 기본시간·기본요금
- 추가 단위시간·추가요금
- 값이 있을 때 일 최대요금
- 검색 문맥이 있을 때 예상 총액·체류시간·목적지까지 거리
- 운영 상태와 운영시간
- 정보 출처와 마지막 확인 시각
- `길찾기 시작`

표시하지 않는다.

- 추천 이유
- 실시간 여석
- 최근 이용에 저장된 과거 요금·거리

## 3. 조건별 표시

| 값                                         | 처리                 |
| ------------------------------------------ | -------------------- |
| `estimatedFee === 0`                       | `무료`               |
| `feeCalculationStatus === 'UNAVAILABLE'`   | `요금 계산 불가`     |
| `feeCalculationStatus === 'NOT_REQUESTED'` | 예상 요금 행 숨김    |
| `distanceMeters === null`                  | 거리 행 숨김         |
| `dailyMaxFee === null`                     | 일 최대요금 행 숨김  |
| `businessHours === null`                   | `운영시간 확인 필요` |
| source URL 없음                            | 출처명만 text 표시   |

조건 없는 상세는 저장된 최근 이용 좌표를 최신 상세 정보처럼 표시하지 않는다.

## 4. Loading·오류

- 결과·더보기 요약이 있으면 상세 loading 중 요약을 유지할 수 있다.
- ID·이름·좌표가 잘못된 response는 부분 rendering하지 않고 contract error로 처리한다.
- `404`: `주차장 정보를 찾을 수 없어요.`와 origin 복귀 CTA
- `INVALID_SEARCH_CONDITION`: 검색 문맥을 제거한 조건 없는 상세를 사용자가 다시 시도할 수 있음
- network·5xx: 기존 요약을 유지하고 수동 재시도

## 5. History

- 결과·더보기·최근 이용에서 진입하면 `detailOrigin`을 기록한다.
- back은 기록된 origin으로 돌아간다.
- 직접 URL·새로고침은 조건 없는 상세로 조회한다.
- 직접 진입 상세의 header back은 홈으로 `replace`한다.
- 길찾기 sheet를 닫거나 외부 앱에서 돌아오면 상세와 선택 상태를 유지한다.

## 6. 완료 조건

- 검색 문맥 유무에 따라 query와 표시 행이 정확히 달라진다.
- 검색 조건 일부만 보내지 않는다.
- 요금 0과 null을 구분한다.
- 상세에서 여석·추천 이유가 DOM에 없다.
