---
name: figma-sync
description: Figma에서 바뀐 디자인만 찾아 서비스 코드에 반영한다(Figma → 코드 단방향). "피그마 반영", "피그마 동기화", "디자인 반영"을 요청하거나 /figma-sync를 부를 때 사용한다. 범위를 주면(예 "/figma-sync Button", "/figma-sync 화면", "/figma-sync 토큰") 그 범위만 확인한다.
---

# Figma → 서비스 동기화

Figma가 디자인 원천이다. 마지막으로 동기화한 상태(`snapshot.json`)와 지금 Figma를 비교한다. 바뀐 것만 코드에 반영한 뒤 기준을 갱신한다. Figma는 읽기만 한다. 예외는 6단계의 새 컴포넌트 설명 한 줄이다.

설계 이유, 파일 형식, 한계는 `DESIGN.md`에 있다. 실행할 때는 읽지 않는다. 스킬 자체를 고칠 때만 읽는다.

## 비용 원칙

- 바뀐 것이 없으면 Figma 호출 2회(세션 + 비교)로 끝낸다. 화면까지 보면 3회다.
- 다음 호출은 미리 하지 않는다:
  - `whoami`
  - 페이지 목록 다시 읽기
  - 전체 `get_design_context`
  - 확인용 스크린숏
- 비교는 Figma 안에서 하고 달라진 항목만 받는다. 스크립트는 직접 쓰지 않고 `scripts/make-call.mjs`가 만든 코드를 그대로 `use_figma`에 넘긴다.
- 모든 명령은 저장소 루트에서 실행한다. 스크립트 경로는 `.claude/skills/figma-sync/scripts/`다.

## 파일

| 파일                    | 역할                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages.json`            | Figma 파일 키, 페이지·섹션 노드 ID, 변수 프레임, 무시할 페이지                                                                                                                                                                                                      |
| `snapshot.json`         | 마지막 동기화 때의 지문. 컬렉션·스타일·컴포넌트(이름·코드 경로 포함)·화면별로 있다. 커밋해서 팀이 같은 기준을 쓴다.                                                                                                                                                 |
| `scripts/detect.js`     | Figma 안에서 실행되는 비교 코드. 노드 속성을 요약해 지문을 만들고 기준과 다른 것만 돌려준다. `components` 블록은 변수·스타일·컴포넌트를, `screens` 블록은 화면 프레임(인스턴스 안쪽 제외)을 본다. 지문 계산 부분은 고치지 않는다. 고치면 기준을 다시 만들어야 한다. |
| `scripts/make-call.mjs` | `detect.js`에서 대상 블록만 남기고, 기준 지문과 범위를 채워 `use_figma` 코드를 출력한다                                                                                                                                                                             |

## 1. 범위 정하기 (호출 없음)

| 요청          | 실행할 비교                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 범위 없음     | `components`와 `screens` 둘 다                                                                                                                    |
| 토큰·색·글꼴  | `components` (변수와 스타일 포함)                                                                                                                 |
| 컴포넌트 이름 | `components --only 이름,이름`. 변수와 스타일은 건너뛴다. 기준에 이름이 정확히 같은 컴포넌트가 있으면 그것만 보고, 없으면 이름에 포함된 것을 본다. |
| 화면          | `screens`. 특정 화면이면 `--only 홈`처럼 섹션이나 화면 이름 일부를 준다.                                                                          |

`snapshot.json`이 없으면 먼저 `--init`으로 기준을 만든다(아래 "기준 다시 만들기").

## 2. Figma에서 바뀐 것 찾기

1. `create_session`을 1회 부른다.
   - fileKey는 `pages.json`의 값이다.
   - 이후 모든 호출에 `sessionId`를 넘긴다.
2. 아래 명령을 실행한다. 출력된 코드를 **고치지 않고** `use_figma`의 `code`로 넘긴다(`skillNames: resource:figma-use`). 둘 다 필요하면 두 호출을 한 메시지에서 병렬로 보낸다.
   ```bash
   node .claude/skills/figma-sync/scripts/make-call.mjs components [--only 이름]
   node .claude/skills/figma-sync/scripts/make-call.mjs screens [--only 이름]
   ```
3. 결과 형식:
   - `collections`: 바뀐 변수 컬렉션의 전체 값. 값은 `#hex`, 숫자, 또는 `→별칭`이다.
   - `styles`: 바뀐 텍스트·효과 스타일 목록
   - `changed`, `added`: 컴포넌트마다 `id`, `name`, `code`(코드 경로), `spec`(현재 Figma 속성 요약)
   - `removed`: 사라진 컴포넌트 ID
   - 화면 비교 결과: `changed`, `added`, `removed`(화면 이름만)
   - `next`: 반영 후 기준에 넣을 새 지문
4. **모든 목록이 비어 있으면** "Figma에 바뀐 디자인이 없어요"라고 알리고 끝낸다.
5. **오류 처리:**
   - Figma 도구가 없거나 인증 오류가 나면 그때 "`/mcp`에서 Figma를 인증해 주세요"라고 안내하고 멈춘다.
   - 호출 한도 오류가 나면 그때까지의 결과로만 보고한다.

### spec 읽는 법

| 키             | 뜻                                                            |
| -------------- | ------------------------------------------------------------- |
| `t`, `n`, `wh` | 타입, 이름, 크기                                              |
| `al`           | 오토레이아웃: 방향, 패딩 위·오른쪽·아래·왼쪽, 간격, 정렬      |
| `alv`          | 연결된 변수                                                   |
| `r`            | radius. 값이 `$`로 시작하면 변수다.                           |
| `f`, `s`, `sw` | 채우기, 선, 선 두께. `$이름`은 변수, `#hex`는 직접 쓴 값이다. |
| `fx`           | 효과 스타일                                                   |
| `ts`, `c`      | 텍스트 스타일, 글자                                           |
| `p`            | 컴포넌트 속성                                                 |
| `m`            | 인스턴스의 원본 이름                                          |
| `ov`           | 덮어쓴 속성                                                   |

## 3. 코드와 비교해 분류하기 (호출 없음)

`spec`과 `collections`는 지금 Figma의 값이다. 이전 값은 코드에 있다(코드가 마지막 동기화 상태). 코드 파일을 읽어 다른 점만 뽑는다.

### 변수·스타일이 들어갈 코드 파일

| Figma                           | 코드                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Palette                         | `client/src/theme/palette.ts`                                                                                                                                            |
| Color                           | `client/src/theme/color.ts`. `→gray900`은 `palette.gray900` 참조다.                                                                                                      |
| Font, Typography, 텍스트 스타일 | `client/src/theme/font.ts`, `typography.ts`. Figma 크기 px = 코드 rem × 16, 행간 130 = 1.3                                                                               |
| Radius                          | `client/src/theme/radius.ts`                                                                                                                                             |
| Motion                          | `client/src/theme/motion.ts`                                                                                                                                             |
| 효과 스타일 `elevation/*`       | `client/src/theme/shadow.ts`                                                                                                                                             |
| Component 컬렉션                | 해당 컴포넌트 파일의 상수. 예: `button/size/*` → `Button.tsx`의 `BUTTON_SIZE`, `chip/*` → `Chip.tsx`의 `CHIP`, `bottomSheet/*` → `BottomSheet.tsx`의 `bottomSheetTokens` |

### 비교 규칙

- 이름은 kebab/slash 형식을 camelCase로 바꿔 맞춘다. 예: `background/brandSubtle` → `color.background.brandSubtle`.
- 대응이 확실하지 않으면 추측하지 않고 "대응 불명"으로 둔다.
- 같은 값의 다른 표기는 차이가 아니다. 예: `#101b377a` = `rgb(16 27 55 / 48%)`, `16` = `1rem`.
- 근거의 우선순위는 변수 > 레이어 값 > 컴포넌트 설명 글이다.
- 코드 주석에 의도가 적힌 값(예: 터치 영역 44px)은 반영 후보에서 빼고 이유를 보고한다.
- Figma 텍스트 스타일에는 자간을 넣지 않는다(스타일 연결 유지). 그러니 코드의 자간은 차이로 보지 않는다.

### 분류

| 종류        | 처리                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 토큰        | 변수·스타일 값 변경. theme 파일만 고친다.                                                                                                                                                                   |
| 스타일      | 컴포넌트의 색·크기·여백·radius·글자·그림자 변경. 컴포넌트 파일을 고친다.                                                                                                                                    |
| 구조        | 요소 추가·삭제, 새 variant, 속성 변경. 필요하면 그 컴포넌트만 `get_design_context`로 읽는다. 읽기 전에 Figma MCP 리소스 `skill://figma/figma-design-to-code/SKILL.md`를 확인한다. 5개가 넘으면 먼저 묻는다. |
| 새 컴포넌트 | `added`. 6단계 규칙을 따른다.                                                                                                                                                                               |
| 삭제        | `removed`. 코드를 지우지 않고 보고만 한다.                                                                                                                                                                  |
| 화면        | 화면 프레임 변경. 그 화면만 `get_screenshot`(1회)으로 보고, 필요한 부분만 `get_design_context`로 읽는다. 대응하는 페이지 코드는 `client/src/pages/<화면>`이다.                                              |

## 4. 보고하고 고르기

| 대상 | Figma | 코드 | 종류 | 수정할 파일 |
| ---- | ----- | ---- | ---- | ----------- |

보고 뒤 반영할 항목을 묻는다. 기본값은 토큰과 스타일 전부다. 반영하지 않을 항목은 "무시"할 수 있다. 무시한 항목도 기준을 갱신해서 다음에 다시 나오지 않게 한다.

## 5. 반영 규칙

- **토큰:** theme 파일의 값만 고친다. 컴포넌트 안에 같은 값을 따로 쓰지 않는다.
- **색상:** 컴포넌트에는 색상 값을 직접 쓰지 않고 theme 토큰을 쓴다. 맞는 토큰이 없으면 새 토큰 이름과 값을 제안하고, 승인받은 뒤 추가한다.
- **props·로직·접근성:** 바꾸지 않는다.
- **구조 변경:** 고른 것만 하고, 공용 컴포넌트면 `client/stories`의 스토리도 함께 갱신한다.
- **관련 없는 파일:** 고치지 않는다(`AGENTS.md`).

## 6. 새 컴포넌트 (승인 후 코드 생성)

Figma에 새로 생긴 컴포넌트는 다음 순서로 처리한다.

1. 이름, 섹션, `spec`, 제안 코드 위치를 보여 준다.
   - 공용 컴포넌트 섹션이면 `client/src/shared/components/ui/<Name>.tsx`
   - 도메인 컴포넌트 섹션이면 `client/src/shared/components/service/<분야>/<Name>.tsx`. 한 페이지에서만 쓰면 그 페이지의 `components/`
2. 만들지 묻는다. 승인받은 것만 만든다.
3. `get_design_context`로 그 컴포넌트만 읽고, 기존 컴포넌트·theme 토큰·`@emotion/css` 패턴으로 구현한다.
4. 공용 컴포넌트면 `client/stories/<Name>.stories.tsx`를 만들고, `figmaDesign('<노드 ID>')`로 Figma에 연결한다.
5. Figma 컴포넌트 설명 첫 줄에 `코드 <경로>`를 넣는다(`use_figma` 1회). 다음 비교부터 코드 경로를 찾을 수 있다. Figma에 쓰는 것은 이 한 줄뿐이다.

## 7. 확인하고 기준 갱신하기

1. `client/`에서 `pnpm design:check`만 실행한다. 커밋 이후 바꾼 줄에 색상 값을 직접 썼는지 검사한다. 실패하면 고친다.
2. 반영하거나 무시한 항목만 `snapshot.json`에 직접 고쳐 넣는다(Edit). 다른 항목은 건드리지 않는다.
   - 비교 결과 `next`에 있는 그 항목의 값으로 바꾼다.
     - `collections.<이름>`과 `styles.<text|effect>`는 지문 문자열이다.
     - `components.<id>`와 `screens.<id>`는 `{ name, section, code, hash }`다(화면에는 `code`가 없다).
   - 새로 받아들인 컴포넌트·화면은 같은 형식으로 추가한다.
   - 삭제를 확인한 ID는 지운다.
   - `syncedAt`을 오늘 날짜(YYYY-MM-DD)로 바꾼다.
3. 마지막 보고에 담는다:
   - 반영한 항목
   - 바꾼 파일
   - 남은 항목: 무시, 구조, 대응 불명, 삭제
   - 이번에 쓴 Figma 호출 수
   - 커밋 전에 `pnpm check`가 필요하다는 한 줄

## 기준 다시 만들기

다음 경우에 기준을 다시 만든다:

- 코드와 Figma를 직접 맞춘 뒤
- `snapshot.json`이 없을 때
- Figma 구조(섹션·페이지)를 크게 바꾼 뒤. 이때는 `pages.json`의 노드 ID를 먼저 고친다.

```bash
node .claude/skills/figma-sync/scripts/make-call.mjs components --init
node .claude/skills/figma-sync/scripts/make-call.mjs screens --init
```

두 결과로 `snapshot.json`을 새로 쓴다(Write).

- `components` 결과의 `collections`, `styles`, `components`와 `screens` 결과의 `screens`를 넣는다.
- `syncedAt`은 오늘 날짜로 한다.
