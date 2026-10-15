# 결정: 지도 주차장 응답의 LOD 점수

- 상태: Accepted
- 결정일: 2026-10-13
- 범위: TSK-171, `GET /api/parking/viewport`

## 목적과 결정

프론트엔드가 대표 주차장의 마커를 크게 표시할 수 있도록 백엔드가 숫자형 `score`를 제공한다.
첫 기준은 총 주차 구획 수 `capacity`이며, 실시간 빈자리 수가 아니다.

| 항목 | 정책 |
| --- | --- |
| 계산식 | `capacity / (capacity + 50.0)` |
| 우선순위 | 점수가 높을수록 먼저 표시 |
| `capacity` 누락 또는 0 이하 | `0.0`, 주차장은 결과에 유지 |
| 응답 | `double`을 반올림 없이 JSON 숫자로 반환 |
| 안정성 | 지도 범위, 다른 후보와 무관하게 같은 주차장은 같은 점수 |

50면 주차장의 응답 예시다.

```json
{
  "totalCount": 1,
  "parkingLots": [
    {"id": 1, "latitude": 37.5665, "longitude": 126.978, "score": 0.5}
  ]
}
```

## 근거와 구현

구획 수를 그대로 반환하는 방식보다 범위를 일정하게 만들고, 요금과 운영 정보의 조합보다
입력과 계산을 단순하게 유지한다. 이미 조회한 구획 수를 사용해 추가 조회나 점수 저장이 필요 없다.
기준값 50은 합의한 초기값이며 데이터 분포에 대한 최적값 검증은 아직 하지 않았다.

[ParkingLodScoreCalculator](../src/main/java/jumin/domain/parking/service/ParkingLodScoreCalculator.java)가 계산식과 기준 상수를 관리한다.
서비스가 계산한 점수를 `ParkingLotViewportResponse.from(parkingLot, score)`에 전달한다.
새 기준과 가중치는 필요할 때 계산기에 추가한다. 프론트엔드의 줌별 표시와 마커 충돌 처리는 별도 작업이다.

## 검증과 재검토

누락, 0, 음수, 50면, 100면 초과와 최대 정수, 0점 유지, 범위 변경 시 점수 일치와 JSON 숫자 반환을 검증했다.
전체 결과는 [필터 문서의 검증 결과](2026-10-13-parking-viewport-filters.md#검증-결과)에 모았다.
프론트 LOD 구현 후 구획 수 누락률과 분포, 실제 대표 마커의 유용성을 확인해 기준을 재검토한다.
