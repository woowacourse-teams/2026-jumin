# 백엔드 CI/CD

> 이번 주에는 선택 요구사항 중 **백엔드 CI/CD와 개발 서버 자동 배포**를 수행한다.
>
> 현재 상태: CI/CD workflow와 개발 서버 배포 구성 완료 · 로컬 사전 검증 완료 · 개발 서버 반영 예정
>
> `develop` 반영 후 동일한 배포 경로로 개발 서버에 적용하고 health check 결과를 추가한다.

## 1. 한눈에 보기

| 항목 | 선택 내용 |
| --- | --- |
| CI | GitHub Actions에서 Java 21 테스트·빌드 |
| CD | `develop` push 시 개발 서버 자동 배포 |
| 실행 환경 | AWS EC2 Ubuntu ARM64 + Docker Compose |
| 데이터베이스 | AWS RDS |
| 운영 서버 | 아직 없음 |

## 2. 해결하려는 문제

백엔드 변경을 로컬에서만 확인하고 개발 서버에 수동 배포하면 다음 문제가 생길 수 있다.

- 테스트되지 않은 코드가 서버에 반영될 수 있다.
- 잘못된 JAR 버전이 실행될 수 있다.
- 배포 과정 일부를 빠뜨릴 수 있다.
- 개발 서버와 로컬 환경의 차이를 배포 후에야 발견할 수 있다.

따라서 코드 변경을 자동으로 검증하고, 검증된 결과만 개발 서버에 반영하는 과정을 만들었다.

## 3. 가설과 성공 기준

### 가설

GitHub Actions에서 테스트와 JAR 빌드를 자동화하고, 검증된 JAR를 Docker Compose로 실행하면 수동 배포 실수를 줄일 수 있을 것이다.

### 성공 기준

- `develop/main` PR에서 백엔드 테스트와 빌드가 자동 실행된다.
- Docker Compose 설정 오류가 PR 단계에서 확인된다.
- `develop`에 반영되면 개발 서버 배포가 자동 실행된다.
- 개발 서버에서 backend container가 실행된다.
- `/actuator/health`로 배포 결과를 확인할 수 있다.
- DB 정보와 외부 API credential이 repository에 저장되지 않는다.

## 4. 구성

```text
Pull Request
     ↓
GitHub Actions CI
  test · build · check
     ↓ merge
develop push
     ↓
GitHub Actions CD
  JAR artifact 생성
     ↓
EC2 ARM64
  Docker image build
  Docker Compose 실행
     ↓
Actuator health check
```

### CI

`develop`과 `main`의 PR·push에서 공통으로 실행한다.

```bash
./gradlew clean check bootJar
```

Docker Compose 설정도 테스트용 환경변수로 검증한다.

```bash
docker compose --file infra/docker-compose.dev.yml config --quiet
```

### CD

`develop` push에서만 실행한다.

1. executable JAR와 checksum을 생성한다.
2. 개발 EC2의 self-hosted runner로 artifact를 전달한다.
3. JAR를 기반으로 Docker image를 build한다.
4. Docker Compose로 backend container를 실행한다.
5. Actuator health check로 배포 결과를 확인한다.

개발 서버 Compose에는 backend만 실행한다. PostgreSQL container와 `postgres-data` volume은 사용하지 않으며, 데이터베이스는 AWS RDS에 연결한다.

## 5. 기술 선택

### Docker Compose를 선택한 이유

- Java 실행 환경을 image로 고정할 수 있다.
- image, 환경변수, 포트, health check를 함께 관리할 수 있다.
- `restart: unless-stopped`로 container 장애에 대응할 수 있다.
- 별도 systemd unit과 배포 스크립트 없이 구성할 수 있다.

### 검토한 대안

| 대안 | 장점 | 이번에 선택하지 않은 이유 |
| --- | --- | --- |
| JAR + `nohup` | 가장 단순함 | 재부팅과 장애 복구가 약함 |
| JAR + systemd | 프로세스 관리가 안정적임 | unit·권한·스크립트 설정이 추가됨 |
| ECR/GHCR | image 보관과 재배포에 유리함 | registry와 AWS 인증 설정까지 필요함 |

이번 주에는 운영 서버와 image registry가 없기 때문에, EC2에서 직접 image를 build하는 Compose 방식을 선택했다.

## 6. 적용 결과

### 로컬에서 확인한 사실

- `./gradlew clean check bootJar` 성공
- Docker Compose 설정 검증 성공
- Java 21 backend Docker image build 성공
- GitHub Actions workflow 검증 성공
- `git diff --check` 성공

### 아직 확인하지 못한 내용

- 실제 EC2 self-hosted runner 배포
- 개발 서버 외부 URL 접근
- 배포 후 실제 API 응답
- 사용자 대상 사용성 테스트

현재 변경사항은 `TSK-21` 브랜치에 있으므로 CD는 아직 실행되지 않았다. `develop`에 merge한 뒤 EC2 runner, Docker 권한, GitHub `development` Secret, RDS 네트워크 설정을 확인하고 배포 결과와 health check 결과를 추가로 기록한다.

FE/BE API 경로와 오류 응답 계약, Nginx reverse proxy와 외부 URL 접근은 이번 CI/CD 요구사항의 범위에 포함하지 않았다. 백엔드 실제 연결 전 별도 계약 정리와 배포 환경 검증이 필요하다.

## 7. 보안과 환경 분리

개발 서버의 RDS와 외부 API 정보는 GitHub `development` Environment Secret으로 주입한다.

- `DB_URL`
- `DB_USERNAME`
- `DB_PASSWORD`
- `LOCAL_SEARCH_CLIENT_ID`
- `LOCAL_SEARCH_CLIENT_SECRET`

CI는 개발·운영 공통으로 사용하지만, CD와 Secret은 환경별로 분리한다. 운영 서버가 생기면 운영용 CD와 Environment를 별도로 구성한다.

## 8. 배운 점

- CI와 CD는 검증과 서버 상태 변경의 책임이 다르므로 분리하는 편이 관리하기 쉽다.
- Docker Compose를 사용하면 image와 실행 설정을 함께 관리할 수 있다.
- 애플리케이션 image rollback과 DB migration rollback은 별개의 문제다.
- `postgres-data`는 로컬 PostgreSQL용이고, 개발 서버 데이터는 RDS가 관리한다.

## 9. 더 학습해야 할 점

- ECR/GHCR와 OIDC 기반 image 배포
- self-hosted runner와 배포 서버 분리
- Docker log rotation과 장애 알림
- DB migration rollback 전략

## 10. 질문과 다음 작업

- 운영 서버가 생기면 EC2 직접 build를 계속 사용할지, ECR을 사용할지?
- `develop` push 즉시 배포할지, 승인 후 배포할지?
- 외부 smoke test와 배포 알림을 언제 추가할지?

### 다음 작업

1. EC2에 Docker와 self-hosted runner를 준비한다.
2. GitHub `development` Environment Secret을 등록한다.
3. RDS 보안 그룹에서 EC2의 `5432` 접근을 허용한다.
4. 실제 배포 결과와 외부 접근 URL을 문서에 추가한다.
