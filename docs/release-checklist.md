# 프론트엔드 MVP 출시 체크리스트

첫 iOS 심사 제출을 위한 실행 목록이다. 기능의 상세 동작은 기능 스펙, API field는 `backend-api-contract.md`를 따른다.

## 1. 완료 정의

- 모바일 웹과 Capacitor iOS가 같은 React 빌드를 사용한다.
- 검색·주변 흐름이 추천부터 외부 지도 전달까지 끝난다.
- 백엔드가 준비되지 않은 구간은 최종 wire와 동일한 mock으로 연결한다.
- `client/`에서 `pnpm check`, `pnpm build`가 통과한다.
- 가능한 환경에서 iOS 앱이 실행되고 archive 생성이 가능하다.

심사 승인 자체는 Apple 처리 시간에 좌우되므로 프론트엔드 완료 조건에 포함하지 않는다.

## 2. 핵심 흐름

- [ ] 스플래시 이후 홈 진입
- [ ] 목적지 검색·후보 선택·목적지 확정
- [ ] 검색 흐름 날짜·입차·출차 입력
- [ ] 주변 흐름 위치 획득·자동 입차·기본 출차
- [ ] 추천 API/mock 호출과 BALANCED 최초 선택
- [ ] 거리순·가격순·균형순 전환
- [ ] 추천 1–3개, 더보기, 추천 0건
- [ ] 카드·marker·목록 선택 동기화
- [ ] 주차장 상세
- [ ] 네이버 지도·카카오맵·TMAP 길찾기 전달
- [ ] 지도 실패·위치 거부·network 실패에서 앱이 멈추지 않음
- [ ] `DISPATCHED` 길찾기만 최근 이용 저장

## 3. API·환경

- [ ] `.env.example`에는 변수 이름만 기록
- [ ] 개발·운영 `API_BASE_URL` 분리
- [ ] mock DTO가 최종 API 계약과 동일
- [ ] production 기본값에서 mock 비활성화
- [ ] 준비된 세 endpoint의 실제 응답 확인
- [ ] 운영 HTTPS·CORS·네이버 지도 origin 등록 상태를 백엔드·인프라 담당자에게 확인

## 4. Capacitor iOS

- [ ] Capacitor app ID와 웹 빌드 디렉터리 확인
- [ ] 웹 빌드 후 iOS sync
- [ ] iOS Bundle ID·표시 이름·버전·빌드 번호 확인
- [ ] Apple Developer Team과 signing 확인
- [ ] iOS 위치 권한 usage description 확인
- [ ] 외부 앱 query scheme 확인
- [ ] 앱 아이콘·스플래시 적용
- [ ] safe area 확인
- [ ] 가능한 환경에서 cold launch와 archive 생성 확인

Xcode, Apple signing, 실제 기기 권한, 운영 CORS와 HTTPS처럼 Codex가 직접 확정할 수 없는 항목은 사용자 작업으로 보고한다.

## 5. 첫 제출 후 보완 가능

- 자동 테스트·coverage
- Android 패키징·실기기 QA
- 모든 브라우저·기기·권한 조합
- 픽셀 단위 visual regression
- 애니메이션과 광범위한 리팩터링
- 데스크톱 전용 레이아웃

단, 빌드 실패, 앱 시작 크래시, 핵심 흐름 단절, API 계약 불일치, 비밀 key 포함은 미룰 수 없다.
