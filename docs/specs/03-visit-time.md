# 방문 날짜·입출차 시각 스펙

## 1. 확정 규칙

- 서비스 시간대는 `Asia/Seoul`이다.
- 입차·출차 피커 단위는 10분이다.
- 추천 request에는 `entryAt`, `exitAt`만 보낸다.
- 체류시간은 백엔드 응답의 `durationMinutes`를 사용한다.
- V6는 출차 날짜를 따로 입력받지 않아 표현 범위가 10분–24시간이다.

## 2. 초기값

검색 흐름:

```ts
visitDate = todayInSeoul;
entryTime = null;
exitTime = null;
```

주변 흐름:

```ts
entryAt = nextTenMinuteSlot(nowInSeoul);
visitDate = datePart(entryAt);
entryTime = timePart(entryAt);
exitTime = timePart(addMinutes(entryAt, 60));
nearbyExitWasEdited = false;
```

- 검색: 날짜·입차·출차를 사용자가 입력한다.
- 주변: 날짜와 입차는 읽기 전용, 출차만 수정할 수 있다.
- 주변 입차의 `nextTenMinuteSlot`은 현재보다 반드시 큰 다음 10분 시각이다.

| 현재     | 주변 입차     |
| -------- | ------------- |
| 14:03:15 | 14:10         |
| 14:10:00 | 14:20         |
| 23:55:00 | 다음 날 00:00 |

## 3. 날짜 입력

- 검색 흐름에서만 native date input으로 변경할 수 있다.
- 서울 기준 오늘 이전 날짜는 선택할 수 없다.
- 날짜를 바꿔도 입차·출차 시각 문자열은 유지한다.
- 주변 흐름의 날짜는 자동 입차 날짜를 표시하고 수정할 수 없다.

## 4. 시각 피커

- 입차와 출차는 별도 dialog다.
- 시: `00–23`
- 분: `00`, `10`, `20`, `30`, `40`, `50`
- 검색 미입력 값은 `—:—`로 표시한다.
- 기존 값이 있으면 그 값에서 시작한다.
- 빈 입차는 다음 10분, 빈 출차는 입차가 있으면 입차 +1시간에서 시작한다.
- 입차도 없고 출차도 비어 있으면 출차 draft는 다음 10분에서 시작한다.

피커 상태는 session과 분리한다.

- `확인`: picker draft를 commit하고 dialog 닫기
- `취소`, 닫기, scrim, Escape, back: commit 없이 닫기
- 휠은 끝에서 자동 순환하지 않는다.

검색에서 입차를 변경해도 기존 출차 시각은 유지하고 출차 날짜만 다시 계산한다.

## 5. 출차 날짜 파생

```ts
const entryMinutes = hour(entryTime) * 60 + minute(entryTime);
const exitMinutes = hour(exitTime) * 60 + minute(exitTime);
const exitDate = exitMinutes > entryMinutes ? visitDate : addDays(visitDate, 1);
```

| 입차 → 출차   | 결과         |
| ------------- | ------------ |
| 19:00 → 21:00 | 당일, 2시간  |
| 23:30 → 00:30 | 익일, 1시간  |
| 09:00 → 09:00 | 익일, 24시간 |
| 21:00 → 19:00 | 익일, 22시간 |

## 6. 빠른 추가

버튼은 `+30분`, `+1시간`, `+2시간`이다.

- 입차가 없으면 비활성화한다.
- 출차가 없으면 `입차 + 버튼 시간`을 출차로 설정한다.
- 출차가 있으면 현재 파생 `exitAt`에 누적한다.
- 후보 출차가 입차 +24시간을 넘으면 해당 버튼을 비활성화한다.
- 버튼으로 변경한 출차도 피커에서 다시 수정할 수 있다.
- 주변 흐름에서 버튼·출차 피커 사용 시 `nearbyExitWasEdited = true`다.

## 7. 제출

필수 조건:

- 목적지·날짜·입차·출차 존재
- 분이 10의 배수
- `entryAt`이 제출 시점 서울 현재보다 미래
- 체류 10분–24시간
- 추천 요청 진행 중이 아님

주변 입차가 제출 전에 현재 또는 과거가 되면 다음 슬롯으로 갱신한다.

- 출차 미수정: 새 입차 +1시간
- 출차 수정: 출차 시각을 유지하고 당일·익일만 재계산

갱신된 화면 값으로 요청을 한 번만 보낸다.

API: [`GET /api/parking-lots/search`](../backend-api-contract.md#5-주차장-추천더보기-조회)

## 8. 서버 응답 반영

성공 응답의 `entryAt`, `exitAt`, `durationMinutes`를 `confirmedVisit`에 저장한다. 기존 `VisitDraft.source`는 유지하되 날짜·입차·출차 표시값을 서버 응답으로 동기화한다.

결과·상세·방문 조건으로 복귀했을 때 모두 서버 확정값을 표시한다.

## 9. 오류 문구

| 조건                      | 문구                                         |
| ------------------------- | -------------------------------------------- |
| 입차·출차 누락            | `입차 시간과 출차 시간을 모두 선택해주세요.` |
| 현재 또는 이전 입차       | `현재 이후의 입차 시간을 선택해주세요.`      |
| 10분 단위 아님            | `10분 단위의 시간을 선택해주세요.`           |
| 출차가 입차보다 늦지 않음 | `출차 시간은 입차 시간보다 늦어야 해요.`     |

서버 400 시간 오류 매핑:

- `INVALID_ENTRY_AT` → `entryAt`
- `INVALID_EXIT_AT` → `exitAt`
- `INVALID_TIME_RANGE` → `timeRange`

`timeRange` 오류는 입차·출차 입력 영역 아래에 표시하고, API 오류를 정상 0건으로 바꾸지 않는다.
