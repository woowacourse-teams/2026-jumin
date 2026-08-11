# 주차의 민족 MVP 백엔드 API 계약서

| 항목      | 값                                          |
| --------- | ------------------------------------------- |
| 문서 버전 | 1.0.0                                       |
| 작성일    | 2026-08-10                                  |
| 대상      | 프론트엔드·백엔드 연동                      |
| 제품 범위 | 서울시 공영주차장                           |
| 기준 문서 | [프론트엔드 마스터 스펙](./frontend-sdd.md) |

이 문서는 기존 API 초안의 중복 필드와 충돌하는 이름을 제거한 백엔드 전달용 최종 wire contract다. 프론트엔드가 호출하는 API는 이 문서의 세 조회 API뿐이다.

- API wire 형식의 기준: 이 문서
- 화면·상태·입력 UX의 기준: `frontend-sdd.md`
- 두 문서가 충돌하면 구현자가 임의로 양쪽을 지원하지 않고 계약 변경으로 처리한다.

## 1. 최종 endpoint 목록

| 목적                    | Method | Path                               | 프론트 호출 시점                           |
| ----------------------- | ------ | ---------------------------------- | ------------------------------------------ |
| 목적지 검색             | `GET`  | `/api/destinations/search`         | 검색어가 2자 이상이고 debounce가 끝났을 때 |
| 주차장 추천·더보기 조회 | `GET`  | `/api/parking-lots/search`         | 사용자가 `추천 받기`를 눌렀을 때 1회       |
| 주차장 상세             | `GET`  | `/api/parking-lots/{parkingLotId}` | 카드·목록·최근 이용에서 상세를 열 때       |

다음은 이 계약에 포함하지 않는다.

- 외부 길찾기: 클라이언트가 네이버 지도·카카오맵·TMAP URL을 직접 연다.
- 최근 이용: 클라이언트 `localStorage`에만 저장한다.
- 실시간 여석: 조회·추천·상세 응답과 프론트 호출에서 제외한다.
- 공공데이터 동기화·관리자 API: 백엔드 내부 또는 별도 관리자 문서에서 관리한다.

## 2. 기존 초안에서 통일한 항목

| 구분               | 기존 초안의 표현                                                    | 최종 계약                                                   | 비고                                                        |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| 추천 endpoint      | `/parking/recommendations` 또는 논리 API                            | `GET /api/parking-lots/search`                              | `parkingLots`와 `recommendedParkingLots`를 한 응답으로 반환 |
| 목적지 검색 method | `POST /destinations/search`, `GET /destinations/search`             | `GET /api/destinations/search`                              | query string, request body 없음                             |
| 상세 endpoint      | `/api/parking-lots/pl_101` 예시                                     | `GET /api/parking-lots/{parkingLotId}`                      | `pl_101`은 path parameter 예시일 뿐                         |
| 입차 시각          | `entryAt`, `arrivalAt`                                              | `entryAt`                                                   | 모든 추천·상세 request와 검색 response에 동일               |
| 출차 시각          | `exitAt`, `departureAt`                                             | `exitAt`                                                    | 모든 추천·상세 request와 검색 response에 동일               |
| 체류시간 request   | `stayMinutes`                                                       | 사용하지 않음                                               | 백엔드가 `exitAt - entryAt`으로 계산                        |
| 체류시간 response  | `searchCondition.stayMinutes`                                       | `searchCondition.durationMinutes`                           | 분 단위 정수                                                |
| 운영 상태          | `operationStatus`, `operation.status`                               | `operation.status`                                          | 목록은 `{ status }`, 상세는 `{ status, businessHours }`     |
| 주차장 좌표        | 평면 `latitude`, `longitude`, `location`                            | `location: { latitude, longitude }`                         | 목적지 후보만 평면 좌표 유지                                |
| 균형 순위          | `balancedRank`, `sortRanks`                                         | `sortRanks.distance/price/balanced`                         | 세 기준의 독립 서버 rank                                    |
| 추천 표시          | `recommendationType`, `recommendationLabel`, `recommendationReason` | `recommendationType`                                        | label은 프론트 매핑, reason은 삭제                          |
| 여석               | `availability`, `spaces`, 갱신 상태                                 | 사용하지 않음                                               | 추천·상세·동기화 API에서 제외                               |
| 반경               | request의 반경 가능성                                               | response `searchRadiusMeters: 600`                          | request로 받지 않음                                         |
| 시간 오류          | `INVALID_ARRIVAL_AT`, `INVALID_STAY_MINUTES`                        | `INVALID_ENTRY_AT`, `INVALID_EXIT_AT`, `INVALID_TIME_RANGE` | 구형 오류코드는 사용하지 않음                               |
| 오류 body          | `code`, `message`                                                   | `code`, `message`, `traceId`                                | `traceId`는 nullable                                        |

### 2.1 폐기 필드 및 호환 규칙

MVP에서는 아래 구형 key를 request 별칭으로 받거나 response에 함께 내려주지 않는다.

```text
arrivalAt
departureAt
stayMinutes
balancedRank
recommendationLabel
recommendationReason
availability
spaces
operationStatus
```

백엔드 내부 DB나 원천 데이터가 구형 이름을 사용하더라도 API adapter에서 최종 이름으로 변환한다. 구형 key가 wire에 나타나면 프론트엔드는 contract error로 처리한다.

## 3. 공통 규칙

### 3.1 전송 형식

- Base URL은 환경별 `API_BASE_URL` 뒤에 붙인다.
- 요청·응답은 UTF-8 JSON이다.
- 모든 일시는 `Asia/Seoul` 기준 ISO 8601 문자열이며 `+09:00` 오프셋을 포함한다.
- 초와 밀리초는 항상 `00`이다.
- 금액 단위는 원, 거리 단위는 미터, 시간 길이 단위는 분이다.
- 인증은 MVP에서 요구하지 않는다.
- 알 수 없는 query parameter는 허용하지 않는다.

### 3.2 공통 오류 body

```ts
interface ApiErrorResponse {
  code: string;
  message: string;
  traceId: string | null;
}
```

```json
{
  "code": "PARKING_SEARCH_FAILED",
  "message": "주차장을 조회하지 못했습니다.",
  "traceId": "01J5TRACE"
}
```

`message`는 운영·진단용이다. 프론트는 HTTP status와 `code`를 기준으로 사용자 문구를 선택한다.

### 3.3 공통 타입

```ts
interface Coordinate {
  latitude: number;
  longitude: number;
}

type OperationStatus = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
type FeeCalculationStatus = "CALCULATED" | "UNAVAILABLE";
type SortCategory = "DISTANCE" | "PRICE" | "BALANCED";
```

좌표는 WGS84 decimal degree다. 위도 범위는 `-90 <= latitude <= 90`, 경도 범위는 `-180 <= longitude <= 180`이다.

## 4. 목적지 검색

### 4.1 Request

```http
GET /api/destinations/search?query=%EA%B0%95%EB%82%A8
```

| Query              | Type     | Required | Rule                                          |
| ------------------ | -------- | -------- | --------------------------------------------- |
| `query`            | `string` | yes      | trim 결과 2자 이상                            |
| `currentLatitude`  | `number` | no       | `currentLongitude`와 함께 보내거나 둘 다 생략 |
| `currentLongitude` | `number` | no       | `currentLatitude`와 함께 보내거나 둘 다 생략  |

현재 위치 좌표가 없으면 현재 위치 권한을 새로 요청하지 않는다. 네이버 Client Secret과 네이버 원천 API 호출은 백엔드에서만 처리한다.

### 4.2 Response `200`

목적지 후보는 최대 10개이며 백엔드가 반환한 순서를 유지한다. 목적지 후보 wire는 네이버 검색 응답 호환을 위해 좌표를 평면 field로 반환한다.

```ts
interface DestinationSearchResponse {
  query: string;
  destinations: Array<{
    destinationId: string;
    name: string;
    address: string;
    roadAddress: string | null;
    latitude: number;
    longitude: number;
    distanceFromCurrentLocationMeters: number | null;
    provider: "NAVER";
  }>;
}
```

```json
{
  "query": "강남",
  "destinations": [
    {
      "destinationId": "naver_12345",
      "name": "강남역 11번 출구",
      "address": "서울 강남구 역삼동 858",
      "roadAddress": "서울 강남구 강남대로 396",
      "latitude": 37.4981,
      "longitude": 127.0279,
      "distanceFromCurrentLocationMeters": null,
      "provider": "NAVER"
    }
  ]
}
```

검색 결과가 없으면 오류가 아니라 `200`과 빈 `destinations` 배열이다. `roadAddress`가 없거나 빈 문자열이면 `null`이다.

### 4.3 Errors

| Status | Code                              | 의미                                             |
| ------ | --------------------------------- | ------------------------------------------------ |
| `400`  | `INVALID_QUERY`                   | 검색어가 없거나 trim 후 2자 미만                 |
| `400`  | `INVALID_CURRENT_LOCATION`        | 현재 좌표 두 개 중 하나만 전달되었거나 범위 오류 |
| `429`  | `DESTINATION_SEARCH_RATE_LIMITED` | 검색 요청 한도 초과                              |
| `502`  | `NAVER_DESTINATION_SEARCH_FAILED` | 네이버 원천 검색 실패                            |

## 5. 주차장 추천·더보기 조회

사용자가 `추천 받기`를 선택할 때 프론트가 한 번 호출한다. 백엔드는 목적지 직선거리 600m 이내의 서울시 공영주차장 전체와 그중 추천 최대 3개를 한 응답으로 반환한다.

### 5.1 Request

```http
GET /api/parking-lots/search?destinationName=%EA%B0%95%EB%82%A8%EC%97%AD%2011%EB%B2%88%20%EC%B6%9C%EA%B5%AC&destinationLatitude=37.4981&destinationLongitude=127.0279&entryAt=2026-08-10T19%3A00%3A00%2B09%3A00&exitAt=2026-08-10T20%3A00%3A00%2B09%3A00
```

허용 query key는 아래 다섯 개뿐이다.

| Query                  | Type     | Required | Rule                                     |
| ---------------------- | -------- | -------- | ---------------------------------------- |
| `destinationName`      | `string` | no       | 선택된 목적지명. 주변 흐름은 `현재 위치` |
| `destinationLatitude`  | `number` | yes      | WGS84 위도                               |
| `destinationLongitude` | `number` | yes      | WGS84 경도                               |
| `entryAt`              | `string` | yes      | `+09:00`, 10분 단위, 서버 현재보다 미래  |
| `exitAt`               | `string` | yes      | `+09:00`, 10분 단위, `exitAt > entryAt`  |

보내지 않는 값:

- `searchRadiusMeters`
- `durationMinutes`
- `stayMinutes`
- 정렬 category
- 실시간 여석

입·출차의 차이로 표현 가능한 범위는 10분–1,440분이다. 이는 별도 체류 business limit이 아니라 V6가 출차 날짜를 별도 입력받지 않는 wire 표현 범위다.

### 5.2 Response `200`

```ts
interface SortRanks {
  distance: number;
  price: number | null;
  balanced: number | null;
}

interface ParkingLotSummary {
  parkingLotId: string;
  name: string;
  address: string;
  location: Coordinate;
  distanceMeters: number;
  estimatedFee: number | null;
  feeCalculationStatus: FeeCalculationStatus;
  operation: {
    status: OperationStatus;
  };
  sortRanks: SortRanks;
}

interface RecommendedParkingLotRef {
  parkingLotId: string;
  recommendationType: SortCategory;
}

interface ParkingSearchResponse {
  searchCondition: {
    destination: {
      name: string | null;
      latitude: number;
      longitude: number;
    };
    entryAt: string;
    exitAt: string;
    durationMinutes: number;
  };
  searchRadiusMeters: 600;
  parkingLots: ParkingLotSummary[];
  recommendedParkingLots: RecommendedParkingLotRef[];
}
```

```json
{
  "searchCondition": {
    "destination": {
      "name": "강남역 11번 출구",
      "latitude": 37.4981,
      "longitude": 127.0279
    },
    "entryAt": "2026-08-10T19:00:00+09:00",
    "exitAt": "2026-08-10T20:00:00+09:00",
    "durationMinutes": 60
  },
  "searchRadiusMeters": 600,
  "parkingLots": [
    {
      "parkingLotId": "seoul_public_101",
      "name": "역삼문화공원 제1호 공영주차장",
      "address": "서울 강남구 테헤란로7길 21",
      "location": {
        "latitude": 37.499,
        "longitude": 127.029
      },
      "distanceMeters": 310,
      "estimatedFee": 6000,
      "feeCalculationStatus": "CALCULATED",
      "operation": {
        "status": "AVAILABLE"
      },
      "sortRanks": {
        "distance": 2,
        "price": 1,
        "balanced": 3
      }
    },
    {
      "parkingLotId": "seoul_public_102",
      "name": "역삼1동 문화센터 공영주차장",
      "address": "서울 강남구 역삼로7길 16",
      "location": {
        "latitude": 37.497,
        "longitude": 127.026
      },
      "distanceMeters": 210,
      "estimatedFee": 7500,
      "feeCalculationStatus": "CALCULATED",
      "operation": {
        "status": "AVAILABLE"
      },
      "sortRanks": {
        "distance": 1,
        "price": 3,
        "balanced": 2
      }
    },
    {
      "parkingLotId": "seoul_public_103",
      "name": "도곡로21길 공영주차장",
      "address": "서울 강남구 도곡로21길 7",
      "location": {
        "latitude": 37.501,
        "longitude": 127.031
      },
      "distanceMeters": 480,
      "estimatedFee": 6500,
      "feeCalculationStatus": "CALCULATED",
      "operation": {
        "status": "AVAILABLE"
      },
      "sortRanks": {
        "distance": 3,
        "price": 2,
        "balanced": 1
      }
    }
  ],
  "recommendedParkingLots": [
    {
      "parkingLotId": "seoul_public_103",
      "recommendationType": "BALANCED"
    },
    {
      "parkingLotId": "seoul_public_102",
      "recommendationType": "DISTANCE"
    },
    {
      "parkingLotId": "seoul_public_101",
      "recommendationType": "PRICE"
    }
  ]
}
```

### 5.3 Response invariants

- `searchRadiusMeters`는 항상 `600`이다.
- `parkingLots`의 모든 항목은 서울시 공영주차장이고 목적지 직선거리 `0–600m`다.
- `parkingLots`는 추천 여부와 관계없이 600m 안에서 조회된 전체 목록이다.
- `distanceMeters`는 0 이상의 정수, `estimatedFee`는 0 이상의 정수 또는 `null`이다.
- `estimatedFee !== null`과 `feeCalculationStatus === 'CALCULATED'`는 동치다.
- `sortRanks.distance`는 모든 항목에 있고 1부터 연속하는 양의 정수다.
- `sortRanks.price !== null`과 `feeCalculationStatus === 'CALCULATED'`는 동치다.
- `sortRanks.balanced !== null`과 `feeCalculationStatus === 'CALCULATED' && operation.status === 'AVAILABLE'`는 동치다.
- 각 rank category의 non-null rank는 중복 없이 1부터 연속한다. 세 rank는 서로 독립이다.
- `recommendedParkingLots`는 0–3개이며 ID와 recommendationType이 각각 중복되지 않는다.
- 추천 ID는 모두 `parkingLots`에 존재한다.
- 추천 항목은 모두 `operation.status = 'AVAILABLE'`, 계산 가능한 요금, non-null `sortRanks.balanced`를 가진다.
- 추천 배열 wire 순서는 `BALANCED → DISTANCE → PRICE`이며 없는 유형은 생략한다.
- 응답의 목적지 좌표·`entryAt`·`exitAt`은 request 값을 그대로 반영한다.
- `durationMinutes === (exitAt - entryAt) / 60000`이다.
- 응답에 `arrivalAt`, `departureAt`, `stayMinutes`, `balancedRank`, `recommendationLabel`, `recommendationReason`, `availability`, `spaces`, `operationStatus`를 포함하지 않는다.

### 5.4 Backend calculation and recommendation rules

프론트엔드는 아래 계산을 수행하지 않는다. 백엔드가 계산 후 결과만 반환한다.

1. 주소·좌표가 있고, 입차부터 출차까지 운영 가능하며, 일반 요금으로 계산 가능한 서울시 공영주차장만 추천 후보로 만든다.
2. 기본시간 이하는 기본요금, 초과분은 `기본요금 + ceil((duration - baseMinutes) / additionalMinutes) × additionalFee`로 계산한다. 일 최대요금이 있으면 더 낮은 금액을 적용한다.
3. 할인·시간대별 복합 요금을 해석할 수 없으면 `feeCalculationStatus = 'UNAVAILABLE'`로 처리하고 추천 후보에서 제외한다.
4. 자정 넘김은 백엔드가 전체 구간을 계산할 수 있을 때만 추천 후보에 포함한다.
5. 실시간 여석은 후보 제외, rank, 추천 순서에 사용하지 않는다.
6. 서로 다른 추천 주차장 선점 순서는 `DISTANCE → PRICE → BALANCED`다. 각 단계에서 해당 rank가 가장 낮고 아직 선택되지 않은 주차장을 고른다.
7. 동점은 정보 마지막 확인 시각이 더 최근인 항목, 그래도 같으면 `parkingLotId` 오름차순으로 결정한다.
8. 계산 순서와 response 배열 순서는 다르다. response는 프론트 최초 선택을 위해 `BALANCED → DISTANCE → PRICE`로 반환한다.

추천 후보가 부족하면 해당 유형을 생략한다. 다른 주차장으로 임의 대체해 3개를 채우지 않는다.

### 5.5 Errors

| Status | Code                    | 의미                                  |
| ------ | ----------------------- | ------------------------------------- |
| `400`  | `INVALID_DESTINATION`   | 목적지 좌표 누락·형식·범위 오류       |
| `400`  | `INVALID_ENTRY_AT`      | 입차 누락·형식·10분 단위·현재 이전    |
| `400`  | `INVALID_EXIT_AT`       | 출차 누락·형식·10분 단위              |
| `400`  | `INVALID_TIME_RANGE`    | `exitAt <= entryAt` 또는 1,440분 초과 |
| `500`  | `PARKING_SEARCH_FAILED` | 주차장 조회·요금 계산·추천 계산 실패  |

`INVALID_ARRIVAL_AT`와 `INVALID_STAY_MINUTES`는 사용하지 않는다.

## 6. 주차장 상세

### 6.1 Request

```http
GET /api/parking-lots/{parkingLotId}
```

검색 결과·더보기에서 진입할 때 아래 네 query를 모두 보낸다. 최근 이용·직접 URL에서 조건 없이 진입하면 네 query를 모두 생략한다.

| Query                  | Type     | Rule                               |
| ---------------------- | -------- | ---------------------------------- |
| `destinationLatitude`  | `number` | `destinationLongitude`와 함께 전송 |
| `destinationLongitude` | `number` | `destinationLatitude`와 함께 전송  |
| `entryAt`              | `string` | 추천 조회와 동일한 ISO·10분 규칙   |
| `exitAt`               | `string` | 추천 조회와 동일한 ISO·범위 규칙   |

네 값 중 일부만 보내는 요청은 허용하지 않는다.

### 6.2 Response `200`

```ts
type DetailFeeCalculationStatus = FeeCalculationStatus | "NOT_REQUESTED";
type DetailOperationStatus = OperationStatus | "NOT_REQUESTED";

interface ParkingLotDetailResponse {
  parkingLotId: string;
  name: string;
  address: string;
  location: Coordinate;
  distanceMeters: number | null;
  estimatedFee: number | null;
  feeCalculationStatus: DetailFeeCalculationStatus;
  feeRule: {
    baseMinutes: number;
    baseFee: number;
    additionalMinutes: number | null;
    additionalFee: number | null;
    dailyMaxFee: number | null;
  } | null;
  operation: {
    status: DetailOperationStatus;
    businessHours: string | null;
  };
  source: {
    name: string;
    url: string | null;
    lastCheckedAt: string;
  };
}
```

검색 조건이 없으면 다음 값을 사용한다.

```json
{
  "distanceMeters": null,
  "estimatedFee": null,
  "feeCalculationStatus": "NOT_REQUESTED",
  "operation": {
    "status": "NOT_REQUESTED",
    "businessHours": "매일 00:00–24:00"
  }
}
```

검색 조건이 있으면 거리·요금·운영 상태를 해당 조건으로 계산한다. `feeRule`과 `source`는 조건 유무와 관계없이 원본 데이터가 있으면 반환한다.

### 6.3 Errors

| Status | Code                        | 의미                                        |
| ------ | --------------------------- | ------------------------------------------- |
| `400`  | `INVALID_SEARCH_CONDITION`  | query 일부 누락 또는 시간·좌표 형식 오류    |
| `404`  | `PARKING_LOT_NOT_FOUND`     | 존재하지 않거나 서울시 공영주차장이 아닌 ID |
| `5xx`  | `PARKING_LOT_DETAIL_FAILED` | 상세 조회 실패                              |

상세 응답에는 `availability`, `spaces`, `recommendationReason`, `recommendationLabel`을 포함하지 않는다.

## 7. Backend acceptance checklist

- [ ] 세 endpoint의 path·method가 문서와 일치한다.
- [ ] 구형 시간·순위·추천·여석 field를 request alias나 response field로 지원하지 않는다.
- [ ] 목적지 검색 후보는 최대 10개이고 `provider`가 `NAVER`다.
- [ ] 주차장 검색은 서울시 공영주차장과 직선거리 600m만 반환한다.
- [ ] 프론트 request에는 `entryAt`, `exitAt`만 있고 체류시간 key가 없다.
- [ ] 응답에는 `entryAt`, `exitAt`, `durationMinutes`가 모두 있다.
- [ ] 세 rank의 null·연속성·독립성 불변조건을 검증한다.
- [ ] 추천 중복 제거 순서와 response 표시 순서를 분리한다.
- [ ] 요금·운영·자정·복합요금 규칙을 서버에서 계산한다.
- [ ] 여석을 추천·순위·상세 response에 사용하지 않는다.
- [ ] 공통 오류 body에 nullable `traceId`를 포함한다.
- [ ] 비공영 주차장 상세 ID를 `PARKING_LOT_NOT_FOUND`로 처리한다.

이 문서의 wire contract를 변경할 때는 영향받는 기능 스펙, TypeScript DTO, fixture, contract test를 함께 변경한다.
