# 공통 프론트엔드 계약

## 1. 목적

모든 기능이 공유하는 상태·책임·품질 규칙만 정의한다. 화면별 동작은 각 기능 스펙을 따른다.

## 2. 기술 기준

| 영역    | 기준                               |
| ------- | ---------------------------------- |
| UI      | React 19, TypeScript strict        |
| Build   | Webpack 5, pnpm                    |
| Style   | Emotion                            |
| HTTP    | `fetch`, `AbortController`         |
| Date    | `Intl`, date-fns                   |
| Routing | History API를 감싼 단일 route 모듈 |
| Native  | Capacitor 8 계열                   |

같은 역할의 router, HTTP client, 전역 상태관리, 날짜 라이브러리를 추가하지 않는다. 도입이 필요하면 스펙 또는 ADR을 먼저 변경한다.

## 3. 책임 경계

백엔드가 담당한다.

- 서울시 공영주차장·직선거리 600m 판정
- 체류시간, 운영 가능 여부, 예상 요금 계산
- 거리·가격·균형 rank 계산
- 추천 후보 선정과 중복 제거

프론트엔드가 담당한다.

- 입력 형식과 제출 가능 여부 검증
- API 응답의 runtime contract 검증
- 서버 rank를 이용한 표시 순서 변경
- 화면·지도·카드의 선택 ID 동기화
- 위치 권한, 외부 지도 연결, 최근 이용 로컬 저장

프론트엔드는 거리·요금·균형 점수·추천 여부를 다시 계산하지 않는다.

## 4. 공통 타입

```ts
type IsoDateTime = string; // YYYY-MM-DDTHH:mm:00+09:00
type LocalDate = string; // YYYY-MM-DD
type LocalTime = string; // HH:mm, 10분 단위

interface Coordinate {
  latitude: number;
  longitude: number;
}

type AsyncState<T> =
  | { status: "IDLE" }
  | { status: "LOADING" }
  | { status: "SUCCESS"; data: T }
  | { status: "ERROR"; error: AppError };

type ValidationField = "destination" | "entryAt" | "exitAt" | "timeRange";

type AppError =
  | { kind: "VALIDATION"; field: ValidationField }
  | { kind: "NETWORK" | "TIMEOUT" | "RATE_LIMIT"; retryable: true }
  | { kind: "NOT_FOUND" | "CONTRACT"; retryable: false }
  | { kind: "MAP" | "LOCATION" | "EXTERNAL_NAVIGATION" };
```

API wire 타입은 [`../backend-api-contract.md`](../backend-api-contract.md)를 기준으로 한다.

## 5. 검색 세션

```ts
interface SearchSession {
  destination: Destination | null;
  visitDraft: VisitDraft | null;
  confirmedVisit: ConfirmedVisitCondition | null;
  response: ParkingSearchResponse | null;
  selectedCategory: "DISTANCE" | "PRICE" | "BALANCED";
  selectedParkingLotId: string | null;
}
```

- 검색 문자열과 확정 목적지는 별도 상태다.
- 새 목적지를 확정하면 방문 조건·응답·선택을 초기화한다.
- 홈 탭을 다시 선택하면 검색 세션 전체를 초기화한다.
- 현재 위치는 메모리에만 저장하고 앱 foreground 동안만 유지한다.
- 최근 이용만 로컬에 영속화한다.

## 6. API 처리

- 응답은 화면에 전달하기 전에 API 경계에서 가벼운 type guard로 검증한다.
- JSON 여부, 필수 최상위 field·배열, enum, 필수 문자열, 좌표 범위, 금액·거리의 유한한 비음수 값, rank의 허용된 `null` 또는 양의 정수, `searchRadiusMeters === 600`, 추천 ID 참조 무결성을 확인한다.
- 필수 구조·좌표·ID 참조 무결성이 깨지면 부분 목록을 계속 사용하지 않고 전체 응답을 `CONTRACT` 오류로 거부한다.
- rank를 프론트에서 재계산하거나 백엔드 응답을 임의 보정하지 않는다. rank의 연속성·추천 계산 규칙은 백엔드 계약의 책임이다.
- 알 수 없는 구형 field를 호환 처리하지 않는다.
- 화면 이탈 시 요청을 abort하고 abort 자체는 오류로 표시하지 않는다.
- 사용자 제출 API는 effect가 아니라 event handler에서 시작한다.
- 진행 중인 동일 CTA는 비활성화한다.

## 7. 오류 표시

| 유형                | 처리                                             |
| ------------------- | ------------------------------------------------ |
| 입력 오류           | 해당 field 아래 표시하고 첫 오류로 focus 이동    |
| 정상 0건            | 오류와 분리된 전용 empty 화면                    |
| network·timeout·5xx | 마지막 요청을 사용자가 다시 실행할 수 있음       |
| contract error      | 재호출하지 않고 검색 세션 초기화 후 새 검색 안내 |
| 지도 오류           | 지도 영역만 대체하고 목록·상세·길찾기는 유지     |
| 위치 오류           | 현재 화면 위 dialog sheet                        |
| 외부 지도 오류      | 길찾기 sheet를 유지하고 다른 provider 안내       |

서버 `message`를 그대로 사용자에게 출력하지 않는다. `traceId`는 진단에만 사용한다.

## 8. 표시 형식

| 데이터          | 형식                                |
| --------------- | ----------------------------------- |
| 금액 0원        | `무료`                              |
| 금액 양수       | `Intl.NumberFormat('ko-KR')` + `원` |
| 거리 0–999m     | 정수 + `m`                          |
| 거리 1000m 이상 | 소수 첫째 자리 `km`                 |
| 같은 날 입출차  | `M월 d일 HH:mm–HH:mm`               |
| 익일 출차       | `M월 d일 HH:mm–다음 날 HH:mm`       |
| 체류 60분 미만  | `N분`                               |
| 체류 정시       | `N시간`                             |
| 체류 혼합       | `N시간 N분`                         |
| 마지막 확인     | `yyyy.MM.dd HH:mm 기준`             |

| Wire                    | 화면 label       |
| ----------------------- | ---------------- |
| operation `AVAILABLE`   | `이용 가능`      |
| operation `UNAVAILABLE` | `운영 불가`      |
| operation `UNKNOWN`     | `운영 확인 필요` |
| fee `UNAVAILABLE`       | `요금 계산 불가` |
| `DISTANCE`              | `거리 우선`      |
| `PRICE`                 | `가격 우선`      |
| `BALANCED`              | `균형`           |

`null`, 빈 문자열, 숫자 0을 같은 값으로 처리하지 않는다. 운영 상태와 요금 상태의 `UNAVAILABLE`은 서로 다른 enum으로 관리한다.

## 9. 접근성·개인정보

- 목표는 WCAG 2.2 AA다.
- 모든 dialog는 focus trap, Escape·플랫폼 back 닫기, trigger focus 복원을 지원한다.
- 터치 영역은 최소 44×44 CSS px다.
- 상태를 색상만으로 전달하지 않는다.
- 지도 없이 목록만으로 상세와 길찾기를 완료할 수 있어야 한다.
- 검색어·주소·좌표·입출차 시각·외부 URL 전체를 log나 analytics에 기록하지 않는다.
- 외부 문자열은 React text node로 출력하고 `dangerouslySetInnerHTML`을 사용하지 않는다.

## 10. 공통 완료 조건

- `client/`에서 `pnpm check`와 `pnpm build`가 통과한다.
- 자동 테스트는 MVP 완료 조건에서 제외하고, 각 기능 스펙의 완료 조건을 수동으로 검증한다.
- loading·success·empty·error 상태가 분리되어 있다.
- 모바일 웹과 iOS의 P0 기능 결과가 일치한다. Android 전용 검증은 첫 제출을 막지 않는다.
- 이 스펙에 없는 최근 검색, 여석, 추천 이유, 예약·결제 기능이 추가되지 않았다.
