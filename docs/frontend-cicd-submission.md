# 프론트엔드 CI/CD 자동화 환경 구축

## 요구사항을 수행한 이유

기존 배포 방식은 특정 팀원이 직접 프론트엔드를 빌드하고 배포해야 했다. 배포 담당자가 없으면 변경 사항을 반영할 수 없었고, 문제가 발생해도 어떤 설정과 로그를 확인해야 하는지 다른 팀원이 알기 어려웠다.

이번 요구사항의 핵심은 단순히 프론트 화면을 외부에 공개하는 것이 아니라고 생각했다.

- 누구나 같은 방식으로 배포할 수 있어야 한다.
- 잘못된 코드가 배포되기 전에 자동으로 검증되어야 한다.
- 병합된 코드는 별도의 수동 작업 없이 서버에 반영되어야 한다.
- 배포 실패 시 원인을 찾고 이전 버전으로 돌아갈 수 있어야 한다.
- 배포 구조와 명령어가 문서로 남아 있어야 한다.

따라서 배포에 대한 지식이 특정 팀원에게만 의존하지 않도록 GitHub Actions와 AWS EC2를 이용한 프론트엔드 CI/CD 환경을 구성했다.

## 이번 작업의 범위

운영 서버에 바로 적용하기 전에 개발 서버에서 전체 자동화 흐름을 먼저 검증했다.

현재 자동화 대상은 다음과 같다.

```text
브랜치: develop
서버: jumin-dev EC2
웹 서버: Nginx
CI 실행 환경: GitHub-hosted Runner
CD 실행 환경: EC2 Self-hosted Runner
```

따라서 이번 작업에서 완성한 것은 `develop` 브랜치 기반의 개발 서버 자동 배포이다. 요구사항에 적힌 `main` 운영 배포는 동일한 구조를 `jumin-prod` 환경으로 확장해야 한다.

## 적용 전과 적용 후

| 구분 | 적용 전 | 적용 후 |
| --- | --- | --- |
| 코드 검증 | 개발자가 로컬에서 직접 실행 | PR마다 GitHub Actions가 자동 실행 |
| 빌드 | 로컬에서 `pnpm build` 실행 | GitHub-hosted Runner가 프로덕션 빌드 |
| 배포 | 빌드 파일을 직접 업로드 | `develop` 병합 후 EC2에 자동 배포 |
| 배포 결과물 | 로컬에서 만든 파일 | CI에서 검증한 Artifact |
| 서버 반영 | 기존 파일을 직접 교체 | 릴리스 디렉터리 생성 후 심볼릭 링크 전환 |
| 실패 대응 | 직접 원인 확인 및 재배포 | 헬스 체크 실패 시 이전 릴리스로 롤백 |
| 실행 환경 | 담당자의 개인 컴퓨터 | 항상 실행되는 EC2 |
| 배포 지식 | 일부 팀원에게 의존 | 구축 과정과 확인 방법을 문서화 |

## 배포 방식 결정 과정

### 1. S3와 CloudFront 배포 시도

처음에는 `pnpm build`로 생성된 `client/dist`를 S3에 업로드하고 CloudFront로 제공하려고 했다.

이 과정에서 다음 문제를 겪었다.

- S3 루트에 `index.html`이 없어 `NoSuchKey` 404 발생
- 실제 파일은 `/jumin` 아래에 있지만 빌드된 에셋은 `/assets`를 기준으로 요청
- HTML과 타이틀은 나타나지만 JavaScript를 불러오지 못해 빈 화면 발생
- 로컬 환경변수가 배포 빌드에 포함되지 않음
- 네이버 지도 서비스에 실제 배포 주소가 등록되지 않아 지도 인증 실패

이를 통해 정적 파일을 업로드하는 것만으로 배포가 끝나는 것이 아니라 다음 설정이 함께 일치해야 한다는 것을 알게 되었다.

```text
S3 객체 경로
Webpack publicPath
HTML이 참조하는 에셋 경로
환경변수
외부 지도 서비스의 허용 URL
```

### 2. AWS IAM 권한 문제

GitHub Actions가 S3와 CloudFront에 직접 배포하려면 일반적으로 다음 중 하나가 필요하다.

- IAM Access Key
- GitHub OIDC용 IAM Role
- 배포 권한이 설정된 별도의 실행 환경

하지만 교육용 AWS 계정에서는 IAM 사용자 조회, Access Key 생성, IAM Role 수정 등이 제한되어 있었다. 허용된 네트워크에서도 동일하게 거부되어 단순 IP 제한이 아니라 AWS 계정 정책의 명시적인 권한 제한이라는 것을 확인했다.

따라서 GitHub Actions가 S3와 CloudFront API를 직접 호출하는 방식은 중단했다.

### 3. Self-hosted Runner 검토

IAM Access Key 없이 배포하는 방법으로 GitHub Actions Self-hosted Runner를 검토했다.

처음에는 개인 Mac에 Runner를 등록했지만 다음 문제가 있었다.

- 개인 컴퓨터가 항상 켜져 있어야 한다.
- 터미널에서 `run.sh`를 종료하면 Runner도 종료된다.
- 개인 네트워크와 컴퓨터 상태에 배포가 의존한다.

따라서 항상 실행되는 EC2에 Runner를 설치하고 서비스로 등록하는 방식으로 변경했다.

Self-hosted Runner가 AWS 권한을 새로 만들어주는 것은 아니다. 대신 Runner가 EC2 내부에서 직접 파일을 교체하게 하면 S3와 같은 AWS API를 호출할 필요가 없다.

### 4. EC2와 Nginx 방식으로 전환

최종적으로 다음 구조를 선택했다.

- GitHub에서 프론트엔드를 빌드한다.
- 빌드 결과를 Artifact로 저장한다.
- EC2 Self-hosted Runner가 Artifact를 내려받는다.
- EC2 내부의 새로운 릴리스 디렉터리에 복사한다.
- Nginx가 바라보는 `current` 심볼릭 링크를 새로운 릴리스로 변경한다.

이를 통해 제한된 AWS 권한 안에서도 외부에서 접근 가능한 개발 서버와 자동 배포 환경을 구축할 수 있었다.

## 전체 CI/CD 흐름

```text
develop 대상 Pull Request
→ GitHub-hosted Runner
→ pnpm install --frozen-lockfile
→ pnpm check
→ pnpm build
→ dist/index.html 및 dist/assets 확인
→ PR에서는 결과만 표시하고 배포 생략

develop 병합 또는 Push
→ 동일한 CI 검증
→ dist를 Artifact로 업로드
→ jumin-dev EC2 Self-hosted Runner가 Artifact 다운로드
→ GitHub Actions Run ID별 릴리스 디렉터리 생성
→ current 심볼릭 링크 전환
→ Nginx가 새로운 정적 파일 제공
→ 헬스 체크
→ 실패하면 이전 릴리스로 롤백
```

### CI 과정

`develop` 대상 PR이 생성되면 GitHub-hosted Runner에서 다음 작업을 수행한다.

```text
pnpm install --frozen-lockfile
→ pnpm check
→ pnpm build
→ dist/index.html 확인
→ dist/assets 확인
```

`pnpm check`에는 다음 검사가 포함되어 있다.

- TypeScript 타입 검사
- ESLint 검사
- Prettier 포맷 검사

PR에서는 EC2 배포를 실행하지 않는다. 검증이 성공했을 때만 병합할 수 있도록 GitHub Ruleset의 필수 검사로 `Frontend checks`를 등록한다.

현재 프론트엔드 테스트 환경은 아직 구성되지 않았기 때문에 자동화된 테스트 실행은 포함되어 있지 않다.

### CD 과정

`develop`에 변경 사항이 병합되면 CI를 다시 실행한다. 검증이 성공하면 `dist`를 GitHub Actions Artifact로 업로드한다.

EC2에 설치된 `jumin-dev` Self-hosted Runner는 해당 Artifact를 내려받아 다음과 같이 배포한다.

```text
/var/www/jumin-dev/
├── releases/
│   ├── <GitHub Run ID 1>/
│   └── <GitHub Run ID 2>/
└── current -> releases/<현재 Run ID>
```

새로운 파일을 기존 경로에 하나씩 덮어쓰지 않고, 모든 파일 복사가 완료된 뒤 `current` 링크만 전환한다. 따라서 배포 도중 일부 파일만 새로운 버전으로 바뀌는 문제를 줄일 수 있다.

헬스 체크에 실패하면 `current`가 이전에 가리키던 릴리스로 복원된다.

## GitHub-hosted Runner와 Self-hosted Runner를 분리한 이유

CI와 CD의 실행 환경을 다음과 같이 분리했다.

```text
GitHub-hosted Runner
→ 의존성 설치, 타입 검사, 린트, 포맷 검사, 빌드

EC2 Self-hosted Runner
→ 검증된 Artifact 다운로드 및 서버 반영
```

이렇게 분리한 이유는 다음과 같다.

- PR 코드를 배포 서버에서 직접 실행하지 않는다.
- EC2에 Node.js와 pnpm을 설치할 필요가 없다.
- 빌드 실패와 배포 실패를 서로 구분할 수 있다.
- CI에서 검증한 것과 동일한 결과물을 배포할 수 있다.
- EC2 Runner에는 배포에 필요한 최소한의 작업만 맡길 수 있다.

## 최신 버전을 반영하는 방법

### 릴리스 디렉터리와 심볼릭 링크

GitHub Actions Run ID마다 새로운 디렉터리를 만들고, 파일 복사가 끝난 뒤 `current`를 전환한다.

이를 통해 서버가 새로운 릴리스를 한 번에 제공할 수 있으며 실패 시 이전 릴리스로 돌아갈 수 있다.

### Webpack contenthash

Webpack 결과물은 다음과 같이 파일 내용에 기반한 해시를 포함한다.

```text
assets/main.<contenthash>.js
```

JavaScript 내용이 달라지면 파일명도 달라진다. 브라우저는 이전 파일과 다른 URL로 인식하기 때문에 오래 캐시된 JavaScript가 계속 사용되는 문제를 줄일 수 있다.

현재는 CloudFront와 같은 CDN을 사용하지 않으므로 CDN Cache Invalidation은 적용하지 않았다.

다만 `index.html`에는 해시가 붙지 않으므로 최신 화면 반영을 더 확실하게 보장하려면 다음과 같은 Nginx 캐시 정책이 추가로 필요하다.

```text
index.html
→ 매번 재검증하거나 캐시하지 않음

contenthash가 포함된 assets
→ 장기간 캐시
```

따라서 현재는 정적 리소스의 Cache Busting까지 적용되었고, `index.html`의 명시적인 캐시 정책은 남은 작업이다.

## 환경변수 처리

로컬 `.env`는 GitHub Actions에서 자동으로 사용되지 않는다. 따라서 개발 서버에서 사용하는 값을 GitHub Variables와 Secrets로 나누었다.

```text
GitHub Variables
- DEV_NAVER_MAP_CLIENT_ID
- DEV_NAVER_MAP_APP_NAME

GitHub Secrets
- DEV_TMAP_APP_KEY
```

워크플로는 이 값을 Webpack의 빌드 환경변수로 전달한다. 프론트엔드 환경변수는 EC2에서 실행할 때 주입되는 것이 아니라 `pnpm build` 시점에 JavaScript 파일에 포함된다.

또한 지도 환경변수가 정상적으로 포함되어도 네이버 지도 관리 화면에 배포 URL이 등록되지 않으면 인증에 실패한다. 따라서 개발 서버 주소를 지도 서비스의 허용 URL에도 등록해야 했다.

## 트러블슈팅 과정에서 배운 점

### 1. CI와 CD는 같은 작업이 아니다

- CI는 코드를 검증하고 배포 가능한 결과물을 만드는 과정이다.
- CD는 검증된 결과물을 실제 서버에 반영하는 과정이다.

### 2. Self-hosted Runner가 AWS 권한을 제공하는 것은 아니다

- Self-hosted Runner는 GitHub Actions 작업을 지정한 컴퓨터에서 실행하게 해주는 프로그램이다.
- 이번에는 EC2 내부 파일을 직접 변경했기 때문에 별도의 S3 권한이 필요하지 않았다.

### 3. CI에서 만든 Artifact를 그대로 배포하는 것이 중요하다

- EC2에서 다시 빌드하면 CI에서 검증한 결과와 실제 배포 결과가 달라질 수 있다.
- Artifact를 전달하면 검증한 결과와 배포한 결과를 일치시킬 수 있다.

### 4. 프론트엔드 환경변수는 빌드 시점에 결정된다

- 로컬 `.env`는 GitHub에 자동으로 전달되지 않는다.
- GitHub Variables와 Secrets를 빌드 단계에 명시적으로 전달해야 한다.

### 5. Nginx는 설치만 한다고 프론트엔드를 제공하지 않는다

다음 설정이 모두 올바르게 연결되어야 한다.

- `root` 경로
- 활성화된 사이트 설정
- 기본 사이트와의 충돌 여부
- SPA fallback 설정

### 6. SPA에는 별도의 새로고침 처리가 필요하다

- `/search`와 같은 주소를 직접 요청하면 실제 파일을 찾지 못해 404가 발생할 수 있다.
- `try_files`를 통해 존재하지 않는 경로를 `index.html`로 전달해야 한다.

### 7. Cache Busting과 Cache Invalidation은 다르다

- `contenthash`는 파일명이 달라지게 만드는 방식이다.
- CDN Cache Invalidation은 CDN에 저장된 기존 응답을 제거하는 방식이다.
- 현재 구조에서는 CDN을 사용하지 않으므로 `contenthash`를 적용했다.

### 8. 배포 자동화에는 실패 대응도 필요하다

- 파일을 올리는 것만으로 배포가 끝나는 것이 아니다.
- 헬스 체크와 롤백 경로가 있어야 실패한 버전이 계속 제공되는 것을 막을 수 있다.

### 9. EC2 접속 정보는 함께 확인해야 한다

- 인스턴스의 OS에 따라 SSH 사용자명이 다르다.
- 인스턴스와 보안 그룹은 같은 VPC에 있어야 한다.
- 다른 인스턴스의 DNS를 사용하면 SSH 지문도 다르게 나타난다.

## 기술 선택 근거

### EC2와 Nginx를 선택한 이유

S3와 CloudFront는 정적 프론트엔드 배포에 적합하지만, 현재 AWS 계정에서는 자동 배포에 필요한 IAM 권한을 생성할 수 없었다.

EC2와 Nginx 방식은 다음 장점이 있었다.

- 허용된 AWS 리소스 안에서 구축할 수 있다.
- AWS API 권한 없이 EC2 내부 파일을 직접 교체할 수 있다.
- 백엔드와 같은 EC2를 사용하는 구조로 확장할 수 있다.
- Nginx에서 정적 파일, SPA fallback, HTTPS, API 프록시를 함께 관리할 수 있다.

이는 S3와 CloudFront가 기술적으로 좋지 않아서가 아니라 현재 계정의 권한과 팀 인프라 제약을 고려한 선택이다.

### GitHub-hosted Runner에서 CI를 실행한 이유

PR 코드는 아직 신뢰할 수 없는 변경 사항이다. 이를 배포 서버의 Self-hosted Runner에서 바로 실행하지 않고 GitHub가 제공하는 임시 실행 환경에서 검증하도록 했다.

또한 빌드에 필요한 Node.js와 pnpm을 EC2에 설치하지 않아도 된다는 장점이 있다.

### EC2 Self-hosted Runner를 선택한 이유

개인 컴퓨터와 달리 EC2는 지속해서 실행될 수 있다. Runner를 Linux 서비스로 등록하면 SSH 연결이나 터미널이 종료되어도 GitHub의 배포 작업을 받을 수 있다.

### 릴리스 디렉터리와 심볼릭 링크를 사용한 이유

기존 파일을 직접 덮어쓰면 배포 중 이전 파일과 새로운 파일이 섞일 수 있다.

새로운 릴리스 경로를 먼저 완성한 뒤 심볼릭 링크를 전환하면 다음이 가능하다.

- 배포 중인 파일을 사용자에게 노출하지 않음
- 빠른 버전 전환
- 이전 버전 보관
- 실패 시 롤백

### pnpm과 lock 파일을 사용한 이유

CI에서는 `pnpm install --frozen-lockfile`을 사용한다. `pnpm-lock.yaml`과 다른 의존성 변경이 발생하면 설치를 실패시켜 로컬과 CI가 서로 다른 버전의 패키지를 사용하는 문제를 줄인다.

## 적용 후 달라진 점

- 팀원이 직접 EC2에 접속하지 않아도 개발 서버가 갱신된다.
- PR 단계에서 타입, 린트, 포맷, 빌드 오류를 확인할 수 있다.
- 빌드 실패와 배포 실패를 GitHub Actions 단계별 로그에서 구분할 수 있다.
- CI에서 검증한 산출물과 실제 배포 산출물이 같아졌다.
- 배포마다 별도의 릴리스가 남아 이전 상태로 돌아갈 수 있다.
- 특정 팀원의 개인 컴퓨터가 꺼져 있어도 배포할 수 있다.
- 배포에 필요한 AWS, EC2, SSH, Nginx, Runner 설정을 문서로 재현할 수 있다.

## 요구사항 달성 상태

| 요구사항 | 현재 상태 |
| --- | --- |
| 빌드 결과물을 AWS에 배포하고 외부 URL로 접근 | 개발 EC2 기준 달성 |
| 병합 시 검증과 배포 자동 실행 | `develop` 기준 달성 |
| `main` 병합 시 운영 서버 자동 배포 | 운영 워크플로 추가 필요 |
| 타입 검사와 린트, 빌드 검증 | 달성 |
| 자동 테스트 | 테스트 환경 추가 필요 |
| 최신 정적 리소스 반영 | `contenthash`와 릴리스 전환 적용 |
| `index.html` 캐시 방지 | Nginx 캐시 정책 추가 필요 |
| 배포 실패 시 원인 확인 | GitHub Actions 단계별 로그로 확인 가능 |
| 실패한 배포 롤백 | 이전 심볼릭 링크 복원 방식 적용 |
| 팀원이 동일하게 구축할 수 있는 문서 | 구축 가이드 작성 |

## 더 학습해야 할 점

- `main`과 `jumin-prod`를 연결하는 운영 배포 워크플로
- 운영과 개발 환경의 GitHub Variables 및 Secrets 분리
- 프론트엔드 자동 테스트 환경과 최소 테스트 범위
- 도메인과 HTTPS 인증서 적용
- Nginx의 `index.html`과 해시 에셋 캐시 정책 분리
- 오래된 릴리스 디렉터리 정리 정책
- 단순 HTTP 200을 넘어 실제 사용자 흐름을 검사하는 방법
- Nginx를 이용한 `/api/*` 백엔드 리버스 프록시
- Runner 및 Nginx 장애를 확인하기 위한 모니터링과 로그 관리
- 향후 IAM 권한이 제공될 경우 S3와 CloudFront 구조로 전환할 기준

## 남아 있는 질문

1. 개발 서버에서 검증된 워크플로를 운영 서버에 그대로 적용해도 되는가?
2. 운영 배포에는 별도의 승인 단계를 두어야 하는가?
3. 배포된 Commit SHA를 화면이나 HTML에서 확인할 수 있게 해야 하는가?
4. `index.html`은 항상 재검증하고 해시 에셋은 장기간 캐시하도록 어떻게 설정해야 하는가?
5. 단순 헬스 체크 대신 지도 검색과 추천 흐름까지 자동으로 검증할 수 있는가?
6. 오래된 릴리스를 몇 개까지 보관해야 하는가?
7. 프론트와 백엔드를 같은 EC2에서 운영할 때 배포 권한과 장애 영향을 어떻게 분리해야 하는가?

## 최종 정리

처음에는 S3와 CloudFront를 이용한 배포를 계획했지만, 정적 파일 경로와 환경변수 문제를 해결하는 과정에서 자동 배포에 필요한 IAM 권한이 제한되어 있다는 것을 확인했다.

이에 개인 컴퓨터의 Self-hosted Runner를 거쳐, 항상 실행되는 EC2에 Runner를 설치하고 Nginx가 정적 파일을 제공하는 구조로 변경했다.

현재는 `develop` 대상 PR에서 타입, 린트, 포맷, 빌드 검증을 자동으로 수행하고, 병합된 코드만 개발 EC2에 배포한다. 배포 결과물은 릴리스 단위로 관리하며 헬스 체크 실패 시 이전 릴리스로 복구할 수 있도록 구성했다.

이번 작업을 통해 단순히 "배포가 된다"는 결과뿐만 아니라, 검증한 결과물과 배포한 결과물을 일치시키고 배포 실패 지점을 추적할 수 있는 구조를 만들었다. 또한 전체 구축 과정을 문서화하여 배포 담당자가 없더라도 다른 팀원이 구조를 이해하고 문제를 확인할 수 있도록 했다.

## 제출 전 확인 사항

- 워크플로의 헬스 체크를 현재 HTTP Nginx 구성과 일치시킨다.

  ```bash
  curl --noproxy '*' \
    --fail \
    --silent \
    --show-error \
    http://127.0.0.1/ >/dev/null
  ```

- PR CI 변경이 GitHub 브랜치에 반영되었는지 확인한다.
- GitHub Ruleset에 `Frontend checks`가 필수 검사로 등록되었는지 확인한다.
- 현재 구현되지 않은 `main` 운영 배포, 자동 테스트, `index.html` 캐시 정책을 완료된 것으로 표현하지 않는다.
- 실제 퍼블릭 IP, AWS 계정 ID, VPC 및 보안 그룹 ID, PEM 경로, Runner 등록 토큰, API 키 값은 제출 문서와 이미지에서 제거한다.
