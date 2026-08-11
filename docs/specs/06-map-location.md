# 지도·현재 위치 스펙

## 1. 범위

- 네이버 지도 SDK loading
- 목적지·주차장·선택 marker와 600m 원
- 웹·Capacitor 현재 위치 권한과 좌표 획득
- 지도 실패 시 기능 유지

## 2. SDK loader

```text
https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId={NAVER_MAP_CLIENT_ID}
```

- 앱 전체 singleton Promise loader를 사용한다.
- `window.naver.maps`가 있으면 script를 다시 추가하지 않는다.
- 동시 요청은 같은 Promise를 반환한다.
- script error와 10초 timeout을 구분한다.
- map container mount 후 지도 객체를 만든다.
- unmount 시 DOM·네이버 listener를 제거한다.
- 지도 실패는 카드·목록·상세·하단 탭을 제거하지 않는다.

공식 문서: [네이버 지도 JavaScript API](https://navermaps.github.io/maps.js.en/docs/tutorial-2-Getting-Started.html)

## 3. 좌표·overlay

내부 좌표계는 WGS84다.

| Overlay     | 표시 조건                     |
| ----------- | ----------------------------- |
| 현재 위치   | 권한과 좌표가 있을 때         |
| 목적지      | 목적지가 확정되었을 때        |
| 600m 원     | 추천 결과·더보기              |
| 추천 marker | 추천 ID 최대 3개              |
| 일반 marker | 더보기의 나머지 항목          |
| 선택 marker | `selectedParkingLotId`와 일치 |

- 추천·일반·선택 상태는 색상뿐 아니라 모양·번호·접근 가능한 이름으로 구분한다.
- 선택 변경은 같은 ID overlay의 style만 변경한다.
- API 거리 `> 600` 또는 잘못된 좌표는 지도·목록에서 제외하고 contract error를 기록한다.
- Haversine 거리로 서버 결과를 재판정하지 않는다.

## 4. 위치 adapter

```ts
type LocationPermissionState =
  "PROMPT" | "GRANTED" | "DENIED" | "DENIED_PERMANENTLY" | "UNAVAILABLE";
```

- 웹: Geolocation API
- iOS·Android: Capacitor Geolocation
- 화면은 공통 adapter result만 사용한다.

고정 옵션:

```ts
{
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
}
```

권한은 사용자가 `주변` 또는 현재 위치 버튼을 눌렀을 때만 요청한다. foreground 권한만 사용하며 background tracking을 설정하지 않는다.

## 5. 위치 상태 처리

| 상태                 | 처리                                                 |
| -------------------- | ---------------------------------------------------- |
| `PROMPT`             | 사용자 동작 후 system prompt                         |
| `GRANTED`            | 좌표 검증 후 기능 계속                               |
| `DENIED`             | 권한 안내와 `다시 시도`                              |
| `DENIED_PERMANENTLY` | 설정에서 허용하라는 안내와 `확인`                    |
| timeout              | `현재 위치를 확인하는 데 시간이 오래 걸리고 있어요.` |
| `UNAVAILABLE`        | `목적지를 검색해서 이용해주세요.`와 검색 CTA         |

위치 오류는 현재 화면 위 dialog sheet로 표시한다. MVP에서 OS 설정 deep link는 만들지 않는다.

동시에 위치 요청은 하나만 유지하고 이전 요청의 늦은 callback은 무시한다. 좌표는 메모리에만 보관한다.

## 6. Capacitor 설정

- `@capacitor/geolocation`
- iOS·Android foreground 위치 권한 문구
- background 권한 없음
- foreground 복귀 시 권한과 지도 container 크기 재확인

## 7. 완료 조건

- 위치 허용·일시 거부·영구 거부·timeout을 웹과 실제 기기에서 확인한다.
- 지도 SDK가 실패해도 목록에서 상세·길찾기를 완료할 수 있다.
- 선택 변경마다 지도·marker 전체를 재생성하지 않는다.
