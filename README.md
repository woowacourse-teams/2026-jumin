# Jumin

## 레포지토리 구조

| 디렉터리 | 역할 |
| --- | --- |
| `client/` | 프론트엔드 애플리케이션입니다. 프론트엔드 팀이 패키지 매니저를 선택합니다. |
| `server/` | 백엔드 애플리케이션입니다. |
| `infra/` | 인프라, 배포, 환경 설정을 관리합니다. |
| `docs/` | 팀 컨벤션과 운영 문서를 관리합니다. |

## 협업 규칙

- Git Flow를 사용합니다. `feature/*` 브랜치는 `develop`에 병합하고, 릴리스는 `develop`에서 `main`으로 병합합니다.
- `develop`은 개발 서버 브랜치이고, `main`은 운영 서버 브랜치입니다.
- 기능 브랜치는 스프린트 작업 ID를 포함해 `feature/<TASK-ID>-<short-description>` 형식으로 만듭니다.
- AngularJS 커밋 컨벤션과 Airbnb JavaScript 스타일 가이드를 따릅니다.
- `.github/pull_request_template.md` 템플릿으로 PR을 작성하고, 병합 전에 리뷰를 요청합니다.

작업을 시작하기 전에 [팀 컨벤션](docs/team-conventions.md)을 확인하세요. 서버 환경과 배포 정보는 [개발 서버 설정](docs/development-server.md)에서 관리합니다.
