# 주차의 민족 MVP 백엔드 API 계약서

| 항목      | 값                             |
| --------- | ------------------------------ |
| 문서 버전 | 1.2.0                          |
| 작성일    | 2026-08-15                     |
| 대상      | 현재 구현된 백엔드 API          |
| 제품 범위 | 서울시 공영주차장               |

이 문서는 현재 서버 코드가 제공하는 wire contract를 정의한다. 구현되지 않은 목적지 검색·주차장 상세 API는 이 문서의 계약 범위에 포함하지 않는다.

## 1. Endpoint

| 목적             | Method | Path                      |
| ---------------- | ------ | ------------------------- |
| 주차장 목록 조회 | `GET`  | `/api/parking-lots/search` |

현재 백엔드에는 다음 endpoint가 구현되어 있지 않다.

- `GET /api/destinations/search`
- `GET /api/parking-lots/{parkingLotId}`

외부 길찾기, 최근 이용, 실시간 여석, 공공데이터 동기화·관리자 API도 이 계약의 대상이 아니다.

## 2. 공통 규칙

### 2.1 전송 형식

- 요청은 query parameter, 응답은 UTF-8 JSON이다.
- 인증은 현재 요구하지 않는다.
- 검색 endpoint가 사용하는 query parameter는 아래 네 개이며 모두 필수다. 그 외 query parameter는 무시한다.
- 일시는 `OffsetDateTime`으로 받고 `+09:00` 오프셋만 허용한다.
- 초와 나노초는 `00`이어야 하며 입·출차 시각은 10분 단위여야 한다.
- 금액 단위는 원, 거리 단위는 미터, 시간 길이 단위는 분이다.

### 2.2 공통 오류 body

모든 오류 응답은 다음 구조를 사용한다.

```ts
interface ApiErrorResponse {
  message: string;
  errors: Array<{
    field: string;
    message: string;
  }>;
}
```

일반 비즈니스·시스템 오류의 `errors`는 빈 배열이다. 요청 DTO 바인딩 검증 오류에는 필드별 오류가 포함될 수 있다. 내부 예외 메시지, 요청 좌표, 요청 시각은 외부 응답에 포함하지 않는다.

### 2.3 공통 타입

```ts
interface Coordinate {
  latitude: number;
  longitude: number;
}

type AvailabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
```

좌표는 WGS84 decimal degree다. 위도 범위는 `-90 <= latitude <= 90`, 경도 범위는 `-180 <= longitude <= 180`이다.

## 3. 주차장 목록 조회

목적지 주변 600m 이내의 활성 주차장을 조회하고, 요청한 이용 구간의 요금·운영 상태·균형점수를 계산한다.

### 3.1 Request

```http
GET /api/parking-lots/search?destinationLatitude=37.4981&destinationLongitude=127.0279&entryAt=2026-08-15T19%3A00%3A00%2B09%3A00&exitAt=2026-08-15T20%3A00%3A00%2B09%3A00
```

| Query                  | Type     | Required | Rule                                      |
| ---------------------- | -------- | -------- | ----------------------------------------- |
| `destinationLatitude`  | `number` | yes      | 유한한 WGS84 위도                         |
| `destinationLongitude` | `number` | yes      | 유한한 WGS84 경도                         |
| `entryAt`              | `string` | yes      | `+09:00`, 초·나노초 0, 10분 단위          |
| `exitAt`               | `string` | yes      | `+09:00`, 초·나노초 0, 10분 단위          |

추가 규칙:

- `entryAt`은 서버 현재 시각보다 미래여야 한다.
- `exitAt`은 `entryAt`보다 뒤여야 한다.
- 이용 시간은 0분 초과, 1,440분 이하여야 한다. 현재 입력 형식이 10분 단위이므로 실제 유효한 최소 구간은 10분이다.
- `destinationName`, `searchRadiusMeters`, `durationMinutes`, `stayMinutes`, 정렬 기준은 요청에 사용하지 않는다.

### 3.2 Response `200`

```ts
interface ParkingLotSummary {
  id: number;
  name: string;
  address: string;
  location: Coordinate;
  distanceMeters: number;
  estimatedFee: number | null;
  balancedScore: number | null;
  availabilityStatus: AvailabilityStatus;
}

interface ParkingSearchResponse {
  searchRadiusMeters: 600;
  totalCount: number;
  parkingLots: ParkingLotSummary[];
}
```

예시:

```json
{
  "searchRadiusMeters": 600,
  "totalCount": 1,
  "parkingLots": [
    {
      "id": 101,
      "name": "역삼문화공원 공영주차장",
      "address": "서울 강남구 테헤란로7길 21",
      "location": {
        "latitude": 37.499,
        "longitude": 127.029
      },
      "distanceMeters": 420,
      "estimatedFee": 6000,
      "balancedScore": 0.2500,
      "availabilityStatus": "AVAILABLE"
    }
  ]
}
```

검색 결과가 없으면 오류가 아니라 다음 정상 응답을 반환한다.

```json
{
  "searchRadiusMeters": 600,
  "totalCount": 0,
  "parkingLots": []
}
```

### 3.3 Response invariants

- `searchRadiusMeters`는 항상 `600`이다.
- `totalCount === parkingLots.length`이다.
- 응답 후보는 `active = true`, `location`, `name`, `address`가 모두 존재하는 주차장이다.
- `id`는 서버 주차장 기본 키이며 숫자로 직렬화된다. 원천 식별자와 `active`, `capacity`는 공개하지 않는다.
- `location`은 주차장 좌표이며 `distanceMeters`는 항상 정수 미터 값이다.
- `estimatedFee`는 요청한 전체 이용 시간의 예상 요금이다. 계산할 수 없으면 `null`이고 0원 요금은 무료로 반환한다.
- 운영 정보를 해석할 수 없으면 `availabilityStatus = "UNKNOWN"`, 운영 시간 밖이면 `"UNAVAILABLE"`, 전체 구간 이용 가능하면 `"AVAILABLE"`이다.
- `balancedScore`는 이용 가능하고 거리·요금을 모두 계산할 수 있을 때만 반환한다. 그 외에는 `null`이다.
- `balancedScore`는 0 이상 1 이하이며 소수 넷째 자리까지 반올림한다. 값이 낮을수록 거리와 요금의 균형이 좋다.
- 후보 배열 순서는 계약상 보장하지 않는다.
- 응답에는 `searchCondition`, `recommendedParkingLots`, `sortRanks`, `operation`, `feeCalculationStatus`, `source`, `sourceExternalId`를 포함하지 않는다.

### 3.4 Backend calculation rules

1. PostgreSQL/PostGIS의 `geography(Point, 4326)` 컬럼에 구면 기준 `ST_DWithin`을 적용해 목적지 반경 600m 후보를 조회한다. 활성 상태와 공개 필드 존재 여부도 SQL에서 필터링한다.
2. 후보별 목적지-주차장 거리는 외부 도보 경로 provider가 아니라 Java Haversine 계산으로 구한다.
3. 운영 상태는 입차 시각부터 출차 직전까지의 전체 구간을 평가한다. 한 시점이라도 운영 불가면 `UNAVAILABLE`, 해석할 수 없는 시점이 있으면 `UNKNOWN`이다.
4. 요금은 기본 시간 이하이면 기본 요금, 초과하면 추가 단위 요금을 올림 적용하고 일일 최대 요금이 있으면 상한을 적용한다.
5. 균형점수는 다음 고정 기준을 사용한다.

   ```text
   distanceScore = clamp(distanceMeters / 600.0, 0, 1)
   referenceFee = durationMinutes × 1,500 / 10
   priceScore = clamp(estimatedFee / referenceFee, 0, 1)
   balancedScore = round((distanceScore + priceScore) / 2, 4)
   ```

## 4. Errors

| Status | Message                                      | 의미                                      |
| ------ | -------------------------------------------- | ----------------------------------------- |
| `400`  | `요청 값이 올바르지 않습니다.`                | 좌표·일시·이용 시간 검증 실패             |
| `500`  | `요청을 처리하는 중 서버 오류가 발생했습니다.` | 저장소 또는 예상하지 못한 서버 오류       |

400 응답은 DTO 바인딩 오류인 경우 `errors`에 필드명과 메시지를 포함한다. 서비스 내부의 `BusinessException(INVALID_INPUT)`과 시스템 오류는 `errors: []`를 사용한다.

## 5. 구현·검증 기준

- [ ] `GET /api/parking-lots/search`가 네 필수 query parameter를 받는다.
- [ ] 좌표 범위, `+09:00`, 10분 단위, 미래 시각, `exitAt > entryAt`, 1,440분 상한을 검증한다.
- [ ] PostGIS `ST_DWithin`으로 활성 후보를 600m 이내에서 조회한다.
- [ ] 외부 도보 provider 없이 Haversine 직선거리를 계산한다.
- [ ] 요금·운영 상태·균형점수의 null 규칙을 응답과 일치시킨다.
- [ ] 빈 결과는 `200`과 빈 `parkingLots`로 반환한다.
- [ ] 응답에 추천·순위·검색 조건·여석·원천 식별자를 포함하지 않는다.
- [ ] 오류 body가 `{ message, errors }` 구조를 따른다.

이 문서의 wire contract를 변경할 때는 검색 DTO, 직렬화 응답, 계산 규칙, 오류 테스트를 함께 변경한다.

## 6. 소비자 동기화 주의

현재 응답은 `searchCondition`, `recommendedParkingLots`, `sortRanks`를 제공하지 않는 간결한 목록 계약이다. 해당 필드를 요구하는 기존 프론트엔드 API adapter와 연동하려면 프론트 계약을 별도 작업으로 동기화해야 한다.
