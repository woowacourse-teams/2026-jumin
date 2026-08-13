# App Store 스크린샷 제출 세트

## 최소 제출 규격

- iPhone 앱: 스크린샷 1장 이상, 최대 10장
- 현재 프로젝트는 `TARGETED_DEVICE_FAMILY = "1,2"`로 iPhone과 iPad를 모두 지원하므로 iPad 스크린샷도 1장 이상 필요
- iPhone 제출본: 6.5형 세로 `1284 × 2778px`
- iPad 제출본: 13형 세로 `2048 × 2732px`
- App Preview 영상은 선택 사항이며 이번 세트에는 포함하지 않음
- PNG/JPEG/JPG만 허용되고 알파 채널·투명 배경은 허용되지 않음

Apple 공식 문서:

- [스크린샷 업로드 안내](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)
- [스크린샷 해상도 규격](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [App Review Guidelines 2.3](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata)

## 권장 업로드 순서

App Store 설치 시트에는 처음 3장의 전달력이 중요하므로 아래 순서대로 업로드한다.

1. `01`: 목적지 주변 600m 공영주차장 비교
2. `02`: 예상 요금·거리·운영시간 상세
3. `03`: 네이버 지도·카카오맵·TMAP 길찾기 전달

`final/` 아래 파일은 App Store Connect에 바로 올릴 수 있는 RGB PNG다.

## 제작 근거

- 앱 화면은 `http://localhost:3000/`의 실제 UI를 사용했다.
- 로컬 개발 환경에서는 최종 API DTO와 동일한 mock adapter를 사용했다.
- 지도, 목적지 반경, 주차장 marker, 카드, 상세, 길찾기 sheet는 실제 앱 렌더링을 캡처했다.
- 화면에 표시되는 장소·요금은 저장소 fixture이며 개인 정보가 아니다.
- 문구는 현재 구현된 기능만 설명하며 예약·결제·실시간 여석 등 미지원 기능을 포함하지 않는다.

## 다시 생성하기

저장소에 포함된 Python 런타임과 Pillow를 사용해 다음 스크립트를 실행한다.

```text
python3 artifacts/app-store-screenshots/build_store_mockups.py
```

화면이나 문구가 변경되면 `raw/*-localhost.png`를 새로 캡처한 뒤 다시 생성한다.
