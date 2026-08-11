# 외부 지도 길찾기 스펙

## 1. 진입·UI

상세 또는 더보기의 `길찾기 시작`을 선택하면 `어떤 앱으로 갈까요?` dialog sheet를 연다.

표시 순서:

1. 네이버 지도
2. 카카오맵
3. TMAP

기본 앱 기억 checkbox는 제공하지 않는다. 전달 값은 주차장명·위도·경도이며 출발지는 외부 지도에 맡긴다.

## 2. URL contract

| Provider | URL                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------- |
| 네이버   | `nmap://route/car?dlat={lat}&dlng={lng}&dname={name}&appname={appName}`                            |
| 카카오   | `https://map.kakao.com/link/to/{name},{lat},{lng}`                                                 |
| TMAP     | `https://apis.openapi.sk.com/tmap/app/routes?appKey={key}&goalname={name}&goalx={lng}&goaly={lat}` |

- URL builder를 사용해 모든 동적 query parameter와 path segment를 encode한다. 주차장명, `appName`, TMAP `key`를 직접 문자열 결합하지 않는다.
- 네이버 `dlat`은 위도, `dlng`은 경도다.
- TMAP `goalx`는 경도, `goaly`는 위도다.
- 출발지 parameter를 만들지 않는다.
- enum 외 provider나 서버가 반환한 임의 URL을 열지 않는다.

문서의 URL은 공개 provider endpoint와 placeholder parameter만 정의한다. 실제 app key, app name, 운영 도메인은 문서나 소스에 기록하지 않고 환경 변수에서 주입한다.

공식 문서: [네이버 URL Scheme](https://guide.ncloud-docs.com/docs/maps-url-scheme), [카카오 길찾기 URL](https://apis.map.kakao.com/web/guide/), [TMAP Invoke](https://tmapapi.tmapmobility.com/webv2/sample/webSample61.html)

## 3. Adapter result

```ts
type ExternalOpenResult =
  | { status: "DISPATCHED" }
  | { status: "FALLBACK_OPENED" }
  | { status: "FAILED" };
```

- `DISPATCHED`: OS·browser가 목적지 URL 전달을 받아들임
- `FALLBACK_OPENED`: 설치 안내·app store·대체 browser만 열림
- `FAILED`: primary와 fallback 모두 실패

외부 앱이 실제 경로를 rendering했는지는 client가 관찰할 수 없으므로 성공 조건에 넣지 않는다.

## 4. 웹

- 사용자 click handler 안에서 `window.open`을 실행한다.
- HTTPS 또는 `nmap://`이 null이 아닌 handle을 반환하면 `DISPATCHED`다.
- null이면 `FAILED`다.
- custom scheme 설치 여부를 timer·visibility로 추정하지 않는다.
- 네이버 실패 시 사용자가 별도 안내 CTA를 선택해 공식 launch page를 열면 `FALLBACK_OPENED`다.

## 5. Capacitor

- App Launcher `canOpenUrl`과 `openUrl`을 adapter 안에서만 호출한다.
- 목적지 URL의 `completed === true`면 `DISPATCHED`다.
- 네이버 미설치 시 Android Play Store 또는 iOS App Store를 열고 완료되면 `FALLBACK_OPENED`다.
- 카카오·TMAP HTTPS 실패 시 system browser로 한 번 넘기고 완료되면 `FALLBACK_OPENED`다.
- throw 또는 모든 `completed === false`는 `FAILED`다.

iOS `LSApplicationQueriesSchemes`와 Android `<queries>`에는 MVP에서 사용하는 `nmap`만 추가한다.

## 6. 결과 처리

| Result            | Sheet                  | 최근 이용     |
| ----------------- | ---------------------- | ------------- |
| `DISPATCHED`      | 닫기                   | 기록          |
| `FALLBACK_OPENED` | 닫기                   | 기록하지 않음 |
| `FAILED`          | 유지·다른 앱 선택 안내 | 기록하지 않음 |

오류 문구: `지도 앱을 열지 못했어요. 다른 앱을 선택해주세요.`

외부 앱 복귀 후 길찾기를 시작한 상세 또는 더보기 route와 선택 상태를 유지한다.

## 7. 완료 조건

- 웹·iOS·Android에서 세 provider 각각 목적지명과 좌표를 확인한다.
- 앱 미설치 fallback과 popup 차단을 확인한다.
- `DISPATCHED`에서만 최근 이용 기록 함수를 호출한다.
