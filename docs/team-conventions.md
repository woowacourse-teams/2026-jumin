# 팀 컨벤션

## 브랜치와 Git Flow

| 브랜치 | 용도 | 배포 대상 |
| --- | --- | --- |
| `main` | 운영 배포가 가능한 릴리스 | 운영 서버 |
| `develop` | 통합 개발 작업 | 개발 서버 |
| `<github-nickname>/*` | 개별 작업 | `develop`에 병합 |

최신 `develop` 브랜치에서 기능 브랜치를 만들고, PR을 통해 다시 병합합니다. `develop`은 릴리스할 때만 `main`에 병합합니다. `main`과 `develop`에 직접 푸시하지 않습니다.

### 브랜치 이름

작업 브랜치는 GitHub 닉네임을 접두사로 사용합니다. 태스크 번호가 있을 때와 없을 때 다음 형식을 사용합니다.

```text
<github-nickname>/tsk-<number>
<github-nickname>/<short-description>
```

예시:

```text
gamja/tsk-1
minsu/login-page
```

`<github-nickname>`에는 본인의 GitHub 닉네임을, `<number>`에는 스프린트 작업 번호를 입력합니다. 태스크 번호가 없는 작업은 목적을 짧게 나타낸 kebab-case 설명을 사용합니다. 연결된 GitHub 이슈와 태스크 번호는 있는 경우에만 PR에 기록합니다.

## 커밋 메시지

AngularJS 컨벤션을 따릅니다.

```text
<type>(<optional-scope>): <summary>
```

요약은 간결한 한글 단답형으로 작성합니다. `추가한다`, `수정한다`처럼 문장 종결 어미를 사용하지 않고 `추가`, `수정`, `분리`처럼 작성합니다. 다음 타입 중 하나를 사용합니다.

| 타입 | 사용 시점 |
| --- | --- |
| `feat` | 사용자에게 보이는 새 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서만 변경 |
| `style` | 동작 변경 없는 포맷팅 |
| `refactor` | 동작 변경 없는 코드 구조 개선 |
| `test` | 테스트 |
| `build` | 빌드 시스템 또는 의존성 변경 |
| `ci` | CI/CD 설정 |
| `chore` | 유지 보수 작업 |

예시:

```text
feat(auth): 카카오 로그인 콜백 추가
fix(residence): 중복 주소 검증
docs: 팀 브랜치 컨벤션 추가
```

## Java

### 조건 분기

- 삼항 연산자, `else`(`else if` 포함), `switch` 문과 식은 사용하지 않습니다.
- 독립적인 `if`, 조기 반환, 기본값 설정 후 조건부 대입을 사용합니다.
- 기존 조건의 평가 순서와 null 처리는 유지합니다.

### 응답 DTO

- 응답 DTO는 정적 팩토리 `from()`으로 변환합니다. 응답 필드 매핑은 DTO 안에 모읍니다.
- `from(ViewportItem item, double score)`처럼 실제 입력에 맞는 매개변수를 사용합니다.

### 로그

- 로그에 사용할 값의 준비·조건 판단과 실제 로그 호출을 분리합니다.
- `log.atInfo()...log()`처럼 로그를 작성하는 코드는 같은 클래스의 별도 private 메서드에 두고, 호출부에서 정리한 값을 전달합니다.

### 테스트 구간 주석

- 준비·실행·검증 구간은 테스트 흐름에 맞게 구분합니다. 서로 밀접한 구간은 `// given & when`, `// when & then`, `// given & when & then`처럼 적절히 합쳐 사용합니다.
- 구간 주석과 같은 줄에 설명을 덧붙이지 않습니다. 필요한 설명은 해당 코드 앞에 별도의 짧은 주석으로 작성합니다.
- Mockito의 mock 설정은 given 또는 given이 포함된 결합 구간에서 실행 코드보다 앞에 둡니다.
- 구간을 합칠 때도 구간 이름만 적습니다. 구분이 필요한 경계를 기준으로 나누며, 빈 구간을 만들지 않습니다.

상세 규칙과 예시: [백엔드 코드 컨벤션](conventions/be/README.md)

## JavaScript와 TypeScript

ESLint의 JavaScript·TypeScript 권장 규칙과 React Hooks 규칙을 적용하고, 코드 스타일은 Prettier로 통일합니다. PR을 열기 전에 타입 검사, 린트, 포맷 검사를 실행합니다.

상세 규칙과 예시: [프론트엔드 코드 컨벤션](conventions/fe/README.md)

## 풀 리퀘스트

레포지토리 PR 템플릿을 사용합니다. 작업 ID, 주요 변경 사항, 참고 자료를 포함합니다. PR은 리뷰를 받은 뒤에만 병합하며, 작성자는 리뷰 피드백을 해결하고 관련 검증이 통과했는지 확인합니다.
