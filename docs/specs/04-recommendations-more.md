# 추천 결과·더보기 스펙

## 1. 범위

- 추천 응답 처리
- `거리순`, `가격순`, `균형순` 정렬
- 추천 카드·marker 선택 동기화
- 600m 전체 주차장 더보기
- 추천 0건 화면

API와 서버 추천 규칙: [`backend-api-contract.md`](../backend-api-contract.md#5-주차장-추천더보기-조회)

## 2. 응답 진입 처리

1. response contract를 검증한다.
2. 서버의 `entryAt`, `exitAt`, `durationMinutes`를 확정 방문 조건에 저장한다.
3. `selectedCategory = 'BALANCED'`로 설정한다.
4. `recommendationType === 'BALANCED'`인 ID를 선택한다.
5. BALANCED 추천이 없으면 API 추천 배열 첫 ID를 선택한다.
6. 선택 카드를 viewport로 이동하고 같은 ID의 marker를 강조한다.
7. 추천 배열이 비어 있으면 결과 없음 화면을 표시한다.

선택 key는 항상 `parkingLotId`다. 이름·배열 index를 key로 사용하지 않는다.

## 3. 정렬

시각적 label 순서는 `거리순`, `가격순`, `균형순`이며 최초 활성은 `균형순`이다.

| Category   | Rank                 |
| ---------- | -------------------- |
| `DISTANCE` | `sortRanks.distance` |
| `PRICE`    | `sortRanks.price`    |
| `BALANCED` | `sortRanks.balanced` |

정렬 comparator:

1. non-null rank를 null보다 앞에 배치
2. non-null rank 오름차순
3. 둘 다 null이면 `sortRanks.distance` 오름차순
4. 그래도 같으면 `parkingLotId` 오름차순

거리·요금·균형 점수로 rank를 다시 계산하지 않는다.

결과 화면에서 category를 바꾸면 같은 `recommendationType` 주차장을 선택한다. 해당 유형이 없으면 새 정렬의 첫 항목을 선택한다. 중복 제거 때문에 유형별 추천이 rank 1이 아닐 수 있으며, 이 경우 정렬을 바꾸지 않고 선택 카드만 이동한다.

## 4. 추천 결과 화면

표시 요소:

- 목적지명과 확정 입출차 요약
- 목적지 marker와 600m 원
- 추천 강조 marker 최대 3개
- 정렬 label 3개
- 추천 카드 carousel
- 추천이 있을 때 더보기 카드

추천 카드 정보:

- 추천 유형: `DISTANCE → 거리 우선`, `PRICE → 가격 우선`, `BALANCED → 균형`
- 주차장명
- 예상 요금 또는 `요금 계산 불가`
- 백엔드 `durationMinutes` 기반 예상 시간
- 목적지까지 거리
- 운영 상태
- `상세보기`

추천 이유와 실시간 여석은 표시하지 않는다.

## 5. 카드·지도 동기화

- 카드 swipe → 해당 ID 선택·marker 강조
- marker 선택 → 해당 카드로 scroll
- 추천 marker 번호 → 현재 category로 정렬된 추천 카드의 1-based 순서
- category 변경 → 카드 순서와 marker 번호를 함께 갱신
- 선택 변경 때문에 지도 객체나 marker 전체를 재생성하지 않음

## 6. 더보기

대상은 API `parkingLots` 전체다. 추천 여부, 운영 상태, 요금 계산 가능 여부 때문에 항목을 숨기지 않는다.

표시 요소:

- 목적지명
- 목적지·600m 원·전체 주차장 marker
- 정렬 label 3개
- 전체 주차장 목록
- 선택 항목 `길찾기 시작`

규칙:

- 결과 화면의 category와 선택 ID를 유지한다.
- 선택 ID가 전체 목록에 없으면 현재 정렬 첫 항목을 선택한다.
- category를 바꾸면 새 정렬 첫 항목을 선택하고 목록·지도를 이동한다.
- 추천 항목만 추천 유형 badge를 표시한다.
- pagination, infinite scroll, client 거리·요금 계산을 구현하지 않는다.

## 7. 추천 0건

`recommendedParkingLots`가 빈 배열인 정상 `200`에서만 표시한다.

- 본문: `검색 반경(600m) 안에서 이용 가능한 주차장을 찾지 못했어요.`
- CTA: `목적지 다시 검색`
- CTA → 검색 세션 초기화 후 `/search`

추천 카드, 더보기 진입점, `parkingLots` 목록은 표시하지 않는다. network·contract error를 0건으로 바꾸지 않는다.

## 8. 완료 조건

- BALANCED 추천을 최초 선택하고 없을 때만 API 첫 추천을 선택한다.
- 세 category가 대응 rank 순서로 표시된다.
- null rank 항목은 제거되지 않고 뒤로 배치된다.
- 카드·marker·목록 선택 ID가 항상 일치한다.
- 추천 1–2개면 확보된 카드만 표시한다.
