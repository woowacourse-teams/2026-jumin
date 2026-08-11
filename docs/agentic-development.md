# AI 기능 개발 실행 가이드

## 1. 적용 방식

이 프로젝트는 Spec-kit 문서 구조를 새로 만들지 않는다. 기존 문서를 다음 단계의 입력으로 사용한다.

| SDD 단계     | 이 프로젝트의 산출물                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| Constitution | `AGENTS.md`, `specs/00-shared-contracts.md`, `team-conventions.md`            |
| Specify      | `frontend-sdd.md`, 해당 기능 스펙, `backend-api-contract.md`, 디자인 manifest |
| Clarify      | 대화에서 질문하고 확정 답을 소유 스펙에 반영                                  |
| Plan         | 기능 하나의 승인용 구현 계획                                                  |
| Tasks        | 승인된 plan을 검증 가능한 작업으로 분해                                       |
| Analyze      | 구현 전 문서·plan·task의 모순과 과잉 범위 검사                                |
| Implement    | 승인된 task만 구현하고 검증                                                   |

`clarifications.md`, 전역 `plan.md`, 전역 `tasks.md`, `analyze.md`는 기본적으로 만들지 않는다. 여러 작업에 걸쳐 인계가 필요한 경우에만 사용자가 작업 문서 저장을 요청한다.

## 2. 실행 단위

한 번에 MVP 전체가 아니라 기능 스펙 하나를 개발한다.

1. 목적지 검색·확정
2. 방문 날짜·입출차 시각
3. 추천 결과·더보기
4. 주차장 상세
5. 지도·현재 위치
6. 외부 지도 길찾기
7. 최근 이용

앱 셸과 공통 계약은 각 기능의 선행 기반으로 필요한 만큼만 구현한다.

## 3. 개발 시작 프롬프트

아래에서 대괄호 부분만 바꿔 사용한다.

```text
주차의 민족 MVP에서 [기능명] 한 기능만 개발해줘.

AGENTS.md를 최상위 실행 규칙으로 따르고 다음 기준을 읽어줘.
- docs/frontend-sdd.md
- docs/specs/00-shared-contracts.md
- [대상 기능 스펙 경로]
- docs/backend-api-contract.md의 관련 endpoint
- docs/design/design-manifest.md의 관련 화면
- docs/team-conventions.md

Figma나 현재 코드를 근거로 제품 동작을 추론하지 마. 범주별 소유 문서가 다르며,
같은 범주의 기준이 충돌하거나 필요한 디자인이 MISSING이면 질문해.

다음 게이트를 순서대로 지켜줘.
1. Clarify: 현재 코드와 기준 문서를 검사하고 결과를 바꾸는 차단 질문만 최대 5개 질문한 뒤 멈춰.
2. 내 답변 후: 확정 답이 제품 규칙을 바꾸면 소유 스펙에 먼저 반영하고, 구현 plan을 제시한 뒤 멈춰.
3. 내가 plan을 승인한 후: task별 대상 파일·근거 스펙·완료 조건·검증 방법을 작성하고 Analyze 결과를 보고한 뒤 멈춰.
4. 내가 구현을 승인한 후에만 승인된 task를 구현하고 검증해.

스펙 밖 기능·fallback·호환 처리·의존성·추상화를 추가하지 마.
구현 중 새 제품 결정이 필요하면 우회하지 말고 Specify 단계로 돌아와 질문해.

완료 보고에는 완료 task, 변경 파일, 실행한 검증과 결과,
스펙 변경 여부, 외부 환경에서만 확인 가능한 항목만 포함해.
```

이후 승인 메시지는 짧게 보낸다.

```text
[질문별 답변]. 답변을 소유 스펙에 반영하고 plan까지만 진행해.
```

```text
plan 승인. tasks와 Analyze까지만 진행해.
```

```text
tasks와 Analyze 결과 승인. 구현과 검증을 진행해.
```

## 4. 개발 전에 추가로 필요한 입력

### 기능마다 제공

- 이번 작업의 기능명과 완료 범위
- 해당 화면의 개별 Figma node URL 또는 승인된 개별 frame export
- 필요한 로고·아이콘·marker·font 원본 asset
- 실제 API 사용 여부와 접근 가능한 개발 base URL 또는 mock 허용 여부
- 웹, iOS, Android 중 이번 PR에서 실제 검증할 대상

비밀 key 값은 프롬프트나 문서에 붙이지 않고 로컬·배포 환경 변수로 제공한다.

### 개발 시작 전에 한 번 확정

현재 아래 항목은 저장소만 보고 결정할 수 없다.

자동 테스트는 MVP 범위에서 제외하며 테스트 runner·script를 추가하지 않는다. 기능 스펙의 완료 조건은 수동 검증한다.

1. 팀 공통 Node.js runtime 버전. 현재 저장소에 `.nvmrc`, `.node-version`, `engines.node`가 없다.
2. 화면별 Figma frame node-id와 반응형·safe-area 기준. 현재 자료는 묶음 캡처뿐이다.
3. 개발 API base URL과 환경 변수 전달 방식.

이 세 항목은 AI가 임의로 선택하지 않고 첫 Clarify에서 확정한다.

## 5. 변경 처리

- 제품 동작 변경: 마스터 또는 해당 기능 스펙을 먼저 변경한다.
- API 변경: 백엔드 계약서와 영향받는 기능 스펙을 먼저 변경한다.
- 시각 변경: Figma와 디자인 manifest의 버전·상태를 먼저 변경한다.
- 구현 방식만 변경: 스펙을 고치지 않고 승인된 plan과 task를 갱신한다.

코드를 먼저 바꾼 뒤 문서를 결과에 맞춰 사후 수정하지 않는다.
