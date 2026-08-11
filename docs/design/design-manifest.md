# 주차의 민족 디자인 Manifest

## 1. 디자인 원본

| 항목              | 값                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기준 버전         | V6                                                                                                                                                                                 |
| Figma 파일        | [주차의 민족 MVP 디자인](https://www.figma.com/design/Q8MoIJGpY7siD2vOPWd219/%EC%A3%BC%EC%B0%A8%EC%9D%98-%EB%AF%BC%EC%A1%B1-MVP-%EB%94%94%EC%9E%90%EC%9D%B8?node-id=89-1382&m=dev) |
| File key          | `Q8MoIJGpY7siD2vOPWd219`                                                                                                                                                           |
| 전체 보드 node-id | `89:1382`                                                                                                                                                                          |
| 캡처 기준일       | 2026-08-10                                                                                                                                                                         |

Figma 링크는 로그인·권한·connector 상태에 따라 AI가 읽지 못할 수 있다. 링크만을 구현 근거로 삼지 않고 승인된 개별 node 또는 저장소 export를 함께 사용한다.
이 문서의 `node-id`는 Figma frame 식별자이며 Node.js runtime과 무관하다.

## 2. 기준의 소유권

| 범주                                        | 기준                                           |
| ------------------------------------------- | ---------------------------------------------- |
| API field·값·예시 데이터                    | `docs/backend-api-contract.md`                 |
| 동작·상태 전이·검증·문구·조건부 노출        | 마스터와 해당 기능 스펙                        |
| 접근성                                      | `docs/specs/00-shared-contracts.md`            |
| 레이아웃·색·간격·타이포그래피·컴포넌트 형태 | 이 manifest에서 `APPROVED`인 Figma node·export |
| 로고·아이콘·marker·font 원본                | 저장소의 승인된 asset                          |

Figma의 예시 장소·시간·요금·거리·여석은 제품 또는 API 계약이 아니다. 같은 범주의 기준끼리 충돌하면 구현을 멈추고 질문한다. 기능 스펙에 명시된 V6 변경점은 이전 Figma 화면의 동작보다 우선한다.

## 3. 상태 정의

| 상태          | 사용 규칙                                                     |
| ------------- | ------------------------------------------------------------- |
| `APPROVED`    | 시각 구현과 visual QA의 기준으로 사용 가능                    |
| `LAYOUT_ONLY` | 흐름·대략적 배치만 참고. 수치·asset·누락 상태를 추론하지 않음 |
| `OBSOLETE`    | 현재 MVP에서 사용하지 않음                                    |
| `MISSING`     | 디자인 없음. 구현 전에 사용자 확인 필요                       |

현재 저장된 V6 자료는 여러 frame이 합쳐진 캡처이므로 모두 `LAYOUT_ONLY`다. 개별 frame export와 asset이 승인되기 전에는 픽셀 단위 완료 판정을 하지 않는다.

## 4. 저장된 V6 보드

| Board | 포함 화면 | 파일                                                                                           | 상태          |
| ----- | --------- | ---------------------------------------------------------------------------------------------- | ------------- |
| B01   | 00–02     | [`v6/boards/00-02-splash-home-search.png`](./v6/boards/00-02-splash-home-search.png)           | `LAYOUT_ONLY` |
| B02   | 03–05     | [`v6/boards/03-05-search-destination.png`](./v6/boards/03-05-search-destination.png)           | `LAYOUT_ONLY` |
| B03   | 06–07     | [`v6/boards/06-07-visit-time.png`](./v6/boards/06-07-visit-time.png)                           | `LAYOUT_ONLY` |
| B04   | 08–10     | [`v6/boards/08-10-results-more.png`](./v6/boards/08-10-results-more.png)                       | `LAYOUT_ONLY` |
| B05   | 11–13     | [`v6/boards/11-13-detail-directions-error.png`](./v6/boards/11-13-detail-directions-error.png) | `LAYOUT_ONLY` |

## 5. 화면별 참조

개별 Figma frame node-id와 개별 export가 확보되면 `—`를 실제 값으로 교체하고 상태를 `APPROVED`로 변경한다.

| ID  | 화면·상태      | Route·Overlay        | 소유 기능 스펙               | Figma frame node-id | 현재 기준         |
| --- | -------------- | -------------------- | ---------------------------- | ------------------- | ----------------- |
| 00  | 스플래시       | app init             | `01-navigation-home.md`      | —                   | B01 `LAYOUT_ONLY` |
| 01  | 홈             | `/`                  | `01-navigation-home.md`      | —                   | B01 `LAYOUT_ONLY` |
| 02  | 검색 진입      | `/search`            | `02-destination-search.md`   | —                   | B01 `LAYOUT_ONLY` |
| 03  | 최근 검색      | `/search`            | `02-destination-search.md`   | —                   | `OBSOLETE`        |
| 04  | 자동완성 결과  | `/search`            | `02-destination-search.md`   | —                   | B02 `LAYOUT_ONLY` |
| 05  | 목적지 확정    | `/destination`       | `02-destination-search.md`   | —                   | B02 `LAYOUT_ONLY` |
| 06  | 방문 조건 기본 | `/visit`             | `03-visit-time.md`           | —                   | B03 `LAYOUT_ONLY` |
| 07  | 방문 조건 입력 | `/visit` + picker    | `03-visit-time.md`           | —                   | B03 `LAYOUT_ONLY` |
| 08  | 추천 결과      | `/results`           | `04-recommendations-more.md` | —                   | B04 `LAYOUT_ONLY` |
| 09  | 추천 선택 변경 | `/results`           | `04-recommendations-more.md` | —                   | B04 `LAYOUT_ONLY` |
| 10  | 더보기         | `/parking-lots`      | `04-recommendations-more.md` | —                   | B04 `LAYOUT_ONLY` |
| 11  | 상세           | `/parking-lots/:id`  | `05-parking-detail.md`       | —                   | B05 `LAYOUT_ONLY` |
| 12  | 길찾기 앱 선택 | `DIRECTIONS` overlay | `07-external-directions.md`  | —                   | B05 `LAYOUT_ONLY` |
| 13  | 공통 오류 예시 | error state          | `00-shared-contracts.md`     | —                   | B05 `LAYOUT_ONLY` |
| 14  | 최근 이용      | `/recent`            | `08-recent-use.md`           | —                   | `MISSING`         |

## 6. V6에서 변경되거나 빠진 상태

아래 항목은 현재 캡처를 그대로 구현하지 않는다.

| 영역                   | 현재 기준                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| 목적지 최근 검색       | MVP 제외. 화면 03을 구현하지 않음                                |
| 방문 시간              | 10분 단위와 현재 `03-visit-time.md`의 초기값·날짜 파생 규칙 사용 |
| 추천 결과·더보기       | 거리·가격·균형 label을 추가하고 서버 rank로 정렬                 |
| 추천 카드              | 추천 이유와 실시간 여석을 표시하지 않음                          |
| 추천 0건               | 기능 스펙의 전용 empty 화면 사용. 현재 디자인은 `MISSING`        |
| 최근 이용              | 기능 스펙만 있고 시각 디자인은 `MISSING`                         |
| 권한·위치 오류         | 기능 스펙의 상태는 있으나 개별 디자인은 `MISSING`                |
| loading·disabled·focus | 동작은 기능·접근성 스펙을 따르며 시각 variant는 `MISSING`        |
| 웹 반응형·safe-area    | 기준이 없어 구현 전 확인 필요                                    |

## 7. 디자인 인계 규칙

화면을 `APPROVED`로 바꾸려면 다음을 저장소에 추가한다.

1. 화면·상태별 Figma node URL
2. 개별 frame PNG 1x 또는 2x export
3. 로고·아이콘·marker SVG/PNG와 font 정보
4. 기준 viewport, 웹 최소·최대 폭, Capacitor safe-area 처리
5. loading·empty·error·disabled·focus 등 구현 대상 variant

파일은 `docs/design/v6/screens/`, asset은 `docs/design/v6/assets/`에 저장한다. Figma가 변경되면 기준 버전과 캡처 날짜를 갱신하고 영향받는 화면만 다시 승인한다.
