# 앱 셸·홈·내비게이션 스펙

## 1. 범위

- 스플래시와 홈 지도
- 하단 탭 `주변`, `홈`, `최근 이용`
- route guard, browser history, Android back
- 검색 세션의 화면 간 유지·초기화

## 2. Route

| 화면        | Path                          | 필수 상태            | 상태가 없을 때                         |
| ----------- | ----------------------------- | -------------------- | -------------------------------------- |
| 홈          | `/`                           | 없음                 | 항상 허용                              |
| 목적지 검색 | `/search`                     | 없음                 | 빈 검색으로 시작                       |
| 목적지 확정 | `/destination`                | 확정 목적지          | `/search`로 `replace`                  |
| 방문 조건   | `/visit`                      | 목적지·visit draft   | `/`로 `replace`                        |
| 추천 결과   | `/results`                    | 검색 응답            | `/`로 `replace`                        |
| 더보기      | `/parking-lots`               | 추천 1개 이상인 응답 | 응답 없음은 `/`, 추천 0개는 `/results` |
| 상세        | `/parking-lots/:parkingLotId` | 유효한 ID            | 검색 세션 없이 조건 없는 조회 허용     |
| 최근 이용   | `/recent`                     | 없음                 | 항상 허용                              |

검색어·주소·좌표·입출차 일시는 URL에 넣지 않는다.

## 3. 스플래시

- 앱 설정과 셸 초기화 동안만 표시한다.
- 초기화가 끝나면 `/`로 `replace`한다.
- 고정 노출 시간을 두지 않는다.
- 지도 SDK 로드는 스플래시 완료를 막지 않는다.

## 4. 홈

표시 요소:

- 네이버 지도
- `어디에 방문하세요?` 검색 버튼
- 확대·축소와 현재 위치 버튼
- 하단 탭

초기 지도 중심은 강남역 `37.4981, 127.0279`, 줌 `16`이다. 이 좌표는 목적지로 확정되지 않는다.

동작:

- 검색 버튼 → `/search`
- 현재 위치 버튼 → 권한을 얻어 지도 중심과 현재 위치 marker만 이동
- `주변` → 위치 획득 후 현재 위치를 목적지로 설정하고 `/visit`
- `홈` → 검색 세션과 overlay를 초기화하고 `/`
- `최근 이용` → `/recent`

현재 route의 탭을 다시 선택하면 history entry를 추가하지 않는다.

## 5. History state

```ts
interface AppHistoryState {
  appHistoryIndex: number;
  route: AppRoute;
  overlay: "NONE" | "VISIT_TIME_PICKER" | "DIRECTIONS";
  detailOrigin?: "RESULTS" | "PARKING_LOTS" | "RECENT";
}
```

- 일반 route·탭 이동은 `pushState`한다.
- 스플래시 완료·guard·직접 상세의 홈 복귀는 `replaceState`한다.
- 시간 피커와 길찾기 sheet는 같은 URL에 overlay history entry를 추가한다.
- overlay 닫기·취소·확인은 `history.back()`으로 처리한다.
- 결과·더보기·최근 이용에서 상세를 열 때 `detailOrigin`을 기록한다.
- 직접 상세 진입은 origin이 없으며 상세 back은 `/`로 `replace`한다.
- 새로고침은 검색 세션을 복원하지 않는다. 상세만 조건 없는 조회로 복원한다.

## 6. Back 우선순위

1. 길찾기 sheet 닫기
2. 시간 피커 닫기
3. 상세 → 기록된 origin
4. 더보기 → 추천 결과
5. 추천 결과 → 방문 조건
6. 검색 방문 조건 → 목적지 확정, 주변 방문 조건 → 홈
7. 목적지 확정 → 검색
8. 검색 → 홈
9. Android 홈에서 앱 소유 이전 entry가 없을 때만 `App.exitApp()`

Android back listener는 앱 전체에서 한 곳만 등록한다.

## 7. 완료 조건

- 직접 URL·새로고침·browser back·Android back이 route 표와 일치한다.
- overlay를 닫으면 trigger로 focus가 돌아간다.
- 외부 지도에서 복귀해도 직전 route·정렬·선택·scroll이 유지된다.
- route guard가 redirect loop를 만들지 않는다.
