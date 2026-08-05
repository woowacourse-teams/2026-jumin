# 팀 컨벤션

## 브랜치와 Git Flow

| 브랜치 | 용도 | 배포 대상 |
| --- | --- | --- |
| `main` | 운영 배포가 가능한 릴리스 | 운영 서버 |
| `develop` | 통합 개발 작업 | 개발 서버 |
| `<github-nickname>/tsk-*` | 개별 작업 | `develop`에 병합 |

최신 `develop` 브랜치에서 기능 브랜치를 만들고, PR을 통해 다시 병합합니다. `develop`은 릴리스할 때만 `main`에 병합합니다. `main`과 `develop`에 직접 푸시하지 않습니다.

### 브랜치 이름

GitHub 닉네임과 스프린트 작업 ID로 작업 브랜치를 식별합니다. 다음 형식을 사용합니다.

```text
<github-nickname>/tsk-<number>
```

예시:

```text
gamja/tsk-1
minsu/tsk-42
```

`<github-nickname>`에는 본인의 GitHub 닉네임을, `<number>`에는 스프린트 작업 번호를 입력합니다. 연결된 GitHub 이슈가 있으면 PR에 기록합니다. 모든 작업에 GitHub 이슈를 의무화할지는 팀에서 추후 결정합니다. 작업 ID는 이슈 유무와 관계없이 필수입니다.

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

## JavaScript

Airbnb JavaScript 스타일 가이드를 적용합니다. 클라이언트 프로젝트를 초기화할 때 Airbnb 프리셋으로 ESLint를 설정하고, PR을 열기 전에 린트를 실행합니다.

## 풀 리퀘스트

레포지토리 PR 템플릿을 사용합니다. 작업 ID, 주요 변경 사항, 참고 자료를 포함합니다. PR은 리뷰를 받은 뒤에만 병합하며, 작성자는 리뷰 피드백을 해결하고 관련 검증이 통과했는지 확인합니다.
