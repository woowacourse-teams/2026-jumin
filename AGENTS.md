# 주차의 민족 AI 출시 개발 지침

이 저장소의 현재 목표는 완벽한 구조나 넓은 사전 검증이 아니라 **한 번의 연속 작업으로 프론트엔드 MVP를 완성하고 Capacitor iOS 심사 제출 가능한 빌드를 만드는 것**이다.

## 1. 기준 문서

구현 전에 아래 문서를 읽되 같은 내용을 다시 문서화하지 않는다.

- 제품 범위·기능 연결: `docs/frontend-sdd.md`
- 원데이 실행 방식: `docs/agentic-development.md`
- 공통 프론트엔드 계약: `docs/specs/00-shared-contracts.md`
- 대상 기능 동작: `docs/specs/*.md`
- API wire 계약: `docs/backend-api-contract.md`
- 시각 기준과 Figma node: `docs/design/design-manifest.md`
- 협업 규칙: `docs/team-conventions.md`
- 출시 순서와 최소 검증: `docs/release-checklist.md`

우선순위가 충돌하면 다음 순서를 따른다.

1. API path·field·enum은 백엔드 API 계약
2. 동작·상태·문구는 기능 스펙
3. 레이아웃·색상·타이포그래피는 Figma V6
4. 구현 세부사항은 현재 코드와 가장 단순한 방법

Figma의 예시 장소·시간·요금은 제품 데이터로 해석하지 않는다.

## 2. 실행 방식

- MVP 전체를 하나의 Codex 작업에서 연속 구현한다.
- 문서와 코드를 먼저 읽고 10줄 이내 실행 순서를 보고한 뒤 바로 구현한다.
- Clarify, plan 승인, task 승인, 구현 승인을 기능마다 반복하지 않는다.
- 사용자의 선택 없이는 결과가 달라지는 실제 차단 사항만 질문한다.
- 되돌리기 쉬운 구현 세부사항은 가장 단순한 방식으로 결정하고 완료 보고에 남긴다.
- 백엔드가 준비되지 않았으면 최종 API DTO와 동일한 fixture/mock adapter로 전체 흐름을 먼저 연결한다.
- 디자인이 없는 loading·empty·error 상태는 V6 공통 패턴으로 단순 구현하며 작업을 멈추지 않는다.
- 관련 없는 파일과 사용자의 기존 변경은 수정하지 않는다.

## 3. 구현 우선순위

1. 앱 셸·환경 변수·API adapter·Capacitor iOS 기반
2. 홈 → 목적지 검색·확정 → 방문 시간 → 추천 요청
3. 추천 결과 → 더보기·상세 → 외부 지도 길찾기
4. 네이버 지도·현재 위치 권한
5. 최근 이용
6. 오류 상태·디자인 보정·iOS 패키징

P0 흐름이 끝나기 전에는 리팩터링, 애니메이션, 픽셀 단위 보정, Android 전용 검증을 시작하지 않는다.

## 4. 의존성과 구현 경계

- 지도·위치·외부 앱 실행·Capacitor 빌드에 필요한 공식 패키지는 `client/` 안에 최소 범위로 추가할 수 있다.
- 프론트엔드는 거리·요금·운영 가능 여부·rank·추천을 다시 계산하지 않는다.
- 비밀 key와 실제 운영 URL을 소스·문서·로그에 기록하지 않는다.
- 웹과 Capacitor는 같은 React 화면과 도메인 모델을 사용한다. 첫 네이티브 차단 기준은 iOS다.

## 5. 최소 검증

자동 테스트 runner, 테스트 코드, coverage, 전 기기 조합 검증은 MVP 출시 조건이 아니다.

최종 제출 전에 `client/`에서 다음을 실행한다.

```text
pnpm check
pnpm build
```

- 검색·주변 golden path
- 정상·추천 0건·네트워크 실패
- 지도 로딩과 위치 허용·거부
- 네이버 지도·카카오맵·TMAP 목적지 전달
- Capacitor sync와 가능한 환경의 iOS 실행

빌드 실패·흰 화면·핵심 흐름 단절·계약 오류·권한 크래시는 미루지 않는다. 나머지 비차단 문제는 완료 보고에 남긴다.

## 6. Git과 완료 보고

- `git add`, `git commit`, `git push`, branch·PR 생성은 하지 않는다.
- `git status`, `git diff` 같은 읽기 전용 확인만 허용한다.
- 모든 변경은 working tree에 남긴다.
- 완료 보고에는 흐름, 변경 파일, mock/API 구간, 검증 결과, iOS 상태, 사용자 작업, 미룬 항목만 포함한다.
