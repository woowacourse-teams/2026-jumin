# 목적지 검색·확정 스펙

## 1. 범위

- 검색어 입력과 네이버 기반 자동완성
- 목적지 후보 선택
- 지도에서 목적지 확정
- 목적지 최근 검색은 MVP에서 제외

## 2. 검색 화면

초기 상태:

- 검색어 빈 문자열
- 확정 목적지 없음
- 최근 검색 목록 없음
- 입력 field에 focus

입력 동작:

- trim 결과 2자 미만이면 API를 호출하지 않는다.
- 2자 이상이면 300ms debounce 후 목적지 검색 API를 호출한다.
- 새 입력이 들어오면 이전 timer와 요청을 취소한다.
- 최신 request ID와 일치하는 응답만 표시한다.
- 검색 화면 재진입은 매번 빈 입력으로 시작한다.

현재 위치 좌표는 사용자가 이미 권한을 허용해 메모리에 있을 때만 선택 query로 보낸다. 검색을 위해 위치 권한을 새로 요청하지 않는다.

API: [`GET /api/destinations/search`](../backend-api-contract.md#4-목적지-검색)

## 3. 후보 표시

각 후보에 표시한다.

- 장소명
- `roadAddress ?? address`
- 값이 있을 때만 현재 위치로부터 거리

후보는 백엔드 순서를 유지하며 최대 10개다. `destinationId`는 opaque ID로 취급한다.

접근성:

- combobox/listbox pattern
- `aria-expanded`, `aria-controls`, `aria-activedescendant` 동기화
- 방향키 이동, Enter 선택, Escape 닫기
- loading·결과 수·0건·오류를 `aria-live="polite"`로 알림

## 4. 목적지 선택과 무효화

후보를 선택하면 다음 값을 하나의 `SearchDestination`으로 확정한다.

```ts
interface SearchDestination {
  kind: "SEARCH";
  destinationId: string;
  name: string;
  address: string;
  roadAddress: string | null;
  location: Coordinate;
}
```

- 후보 선택 → `/destination`
- 확정 후 검색 문자열을 수정하면 확정 목적지·방문 조건·추천 응답·선택 ID를 즉시 폐기한다.
- 목적지를 다시 선택하면 이전 검색 세션을 재사용하지 않는다.

## 5. 목적지 확정 화면

표시 요소:

- 선택 좌표 중심 지도와 목적지 marker
- 장소명과 주소
- `다음` CTA

규칙:

- 지도 pan은 목적지 좌표를 바꾸지 않는다.
- `destinationId`, 이름, 주소, 좌표가 모두 유효할 때만 `다음`을 활성화한다.
- `다음` → 검색 방문 조건을 `오늘/null/null`로 만들고 `/visit`
- 목적지 변경 → `/search`

## 6. 상태·오류

| 상태            | 표시                                             |
| --------------- | ------------------------------------------------ |
| loading         | 후보 영역 skeleton 또는 progress                 |
| 200 + 빈 배열   | `검색 결과가 없어요.`                            |
| `INVALID_QUERY` | `두 글자 이상 입력해주세요.`                     |
| rate limit      | `검색 요청이 많아요. 잠시 후 다시 시도해주세요.` |
| network·502     | 검색 영역 오류와 수동 재시도                     |

오류가 나도 현재 검색어를 유지한다. 자동 재시도하지 않는다.

## 7. 완료 조건

- 1자 입력은 호출 0회다.
- 연속 입력은 이전 요청을 abort하고 마지막 결과만 표시한다.
- 검색 후보 선택 후 좌표·주소·ID가 함께 확정된다.
- 최근 검색 UI와 저장 key가 존재하지 않는다.
