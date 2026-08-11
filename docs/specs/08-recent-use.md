# 최근 이용 스펙

## 1. 기록 시점

외부 길찾기 adapter가 `DISPATCHED`를 반환한 서울시 공영주차장만 기록한다.

- `FALLBACK_OPENED`, `FAILED`: 기록하지 않음
- 검색 결과·더보기·상세 API로 공영주차장임이 확인된 항목만 기록
- 임의 URL의 ID나 화면 문자열만으로 기록 생성 금지

## 2. 저장 형식

Key: `parking-people:recent-uses:v1`

```ts
interface RecentUseStoreV1 {
  version: 1;
  items: Array<{
    parkingLotId: string;
    name: string;
    address: string;
    location: Coordinate;
    usedAt: IsoDateTime;
  }>;
}
```

저장하지 않는다.

- 검색 목적지
- 입차·출차·체류시간
- 예상 요금과 거리
- 추천 유형

## 3. 정리 규칙

1. 같은 `parkingLotId` 기존 항목 제거
2. 새 항목을 맨 앞에 추가
3. 서울 현재 기준 90일 초과 항목 제거
4. 최신 20개만 유지

앱 시작과 최근 이용 화면 진입 때 정리한다.

JSON parsing 실패, 좌표 오류, version 불일치 항목은 폐기한다. quota·write 실패는 길찾기를 막거나 사용자 오류로 표시하지 않는다.

## 4. 최근 이용 화면

Route: `/recent`

표시 요소:

- 제목 `최근 이용`
- 최신 이용순 목록
- 주차장명·주소·마지막 이용 시각
- 하단 navigation

빈 상태: `최근 이용한 주차장이 없어요.`

항목 선택 → 조건 없는 상세 조회. 저장 좌표는 상세 실패 시 길찾기 목적지로만 사용할 수 있으며 최신 거리·요금·운영 정보처럼 표시하지 않는다.

## 5. 개인정보

- localStorage 외 server sync 없음
- 기기 간 동기화 없음
- 90일·20개를 넘겨 보관하지 않음
- 목적지 검색 결과를 이 key나 다른 key에 저장하지 않음

## 6. 완료 조건

- 같은 ID를 여러 번 사용해도 한 항목만 남고 `usedAt`이 최신이다.
- 91일 항목과 21번째 항목이 제거된다.
- fallback·실패한 길찾기는 기록되지 않는다.
- 조건 없는 상세에서 저장된 과거 요금·거리가 표시되지 않는다.
