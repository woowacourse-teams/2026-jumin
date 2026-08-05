# Jumin

## 멤버

<table>
  <tr>
    <td align="center"><a href="https://github.com/gamjaismine02"><img src="https://github.com/gamjaismine02.png?size=100" width="100px;" alt="피트 프로필"/><br /><sub><b>피트</b></sub></a><br /></td>
    <td align="center"><a href="https://github.com/yuncic"><img src="https://github.com/yuncic.png?size=100" width="100px;" alt="찰리 프로필"/><br /><sub><b>찰리</b></sub></a><br /></td>
    <td align="center"><a href="https://github.com/Eian1106"><img src="https://github.com/Eian1106.png?size=100" width="100px;" alt="이안 프로필"/><br /><sub><b>이안</b></sub></a><br /></td>
    <td align="center"><a href="https://github.com/haeyoon1"><img src="https://github.com/haeyoon1.png?size=100" width="100px;" alt="카키 프로필"/><br /><sub><b>카키</b></sub></a><br /></td>
    <td align="center"><a href="https://github.com/bhoon716"><img src="https://github.com/bhoon716.png?size=100" width="100px;" alt="로치 프로필"/><br /><sub><b>로치</b></sub></a><br /></td>
  </tr>
</table>

## 레포지토리 구조

| 디렉터리 | 역할 |
| --- | --- |
| `client/` | 프론트엔드 애플리케이션입니다. 프론트엔드 팀이 패키지 매니저를 선택합니다. |
| `server/` | 백엔드 애플리케이션입니다. |
| `infra/` | 인프라, 배포, 환경 설정을 관리합니다. |
| `docs/` | 팀 컨벤션과 운영 문서를 관리합니다. |

## 협업 규칙

- Git Flow를 사용합니다. 작업 브랜치는 `develop`에 병합하고, 릴리스는 `develop`에서 `main`으로 병합합니다.
- `develop`은 개발 서버 브랜치이고, `main`은 운영 서버 브랜치입니다.
- 작업 브랜치는 GitHub 닉네임을 접두사로 사용합니다. 태스크가 있으면 `<github-nickname>/tsk-<number>`, 없으면 `<github-nickname>/<short-description>` 형식으로 만듭니다.
- AngularJS 커밋 컨벤션과 Airbnb JavaScript 스타일 가이드를 따릅니다.
- `.github/pull_request_template.md` 템플릿으로 PR을 작성하고, 병합 전에 리뷰를 요청합니다.

작업을 시작하기 전에 [팀 컨벤션](docs/team-conventions.md)을 확인하세요. 서버 환경과 배포 정보는 [개발 서버 설정](docs/development-server.md)에서 관리합니다.
