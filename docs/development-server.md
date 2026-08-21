# 개발 서버 설정

`develop`은 개발 서버의 배포 기준 브랜치이고, `main`은 운영 서버의 배포 기준 브랜치입니다.

개발 서버는 AWS EC2(Ubuntu ARM64)에서 Spring Boot JAR를 Docker Compose로 실행하고, 데이터베이스는 AWS RDS를 사용합니다. 운영 서버는 아직 없으므로 이번 CI/CD의 배포 대상은 개발 서버로 한정합니다.

개발 서버의 Compose에는 PostgreSQL 서비스를 포함하지 않습니다. `postgres-data` 같은 Docker volume은 로컬 개발용 PostgreSQL에만 사용하며, 개발 서버의 데이터는 RDS가 보존합니다.

## 백엔드 CI/CD 현재 범위

- PR에서 `server/**`, Docker 설정 또는 workflow가 바뀌면 `server-ci.yml`이 `./gradlew clean check bootJar`와 Docker Compose 설정 검증을 실행합니다.
- `develop` push 시 `server-dev-cd.yml`이 검증된 JAR artifact를 만들고 `jumin-dev` ARM64 self-hosted runner에서 Docker image를 빌드합니다.
- Docker Compose가 새 backend container를 교체하고 `restart: unless-stopped`와 health check를 적용합니다.
- 배포 artifact와 image build context는 `/opt/jumin-dev/backend/releases`에 기록합니다.

실제 서버 배포를 실행하기 전에 다음 항목을 확인해야 합니다.

- EC2에 Docker Engine, Docker Compose plugin, `jumin-dev` self-hosted runner가 준비되어 있어야 합니다.
- runner 사용자가 `/opt/jumin-dev/backend`를 생성·수정하고 Docker daemon을 실행할 수 있어야 합니다.
- RDS 보안 그룹이 EC2 보안 그룹의 PostgreSQL 포트 `5432` 접근을 허용해야 합니다.
- GitHub의 `development` Environment에 RDS와 외부 API 환경변수를 등록해야 합니다.
- 외부 사용자가 접근할 개발 URL과 reverse proxy/HTTPS는 별도 구성해야 합니다.

EC2 최초 준비 예시는 다음과 같습니다.

```bash
sudo install -d -m 2775 /opt/jumin-dev/backend/releases
sudo chown -R <runner-user>:<runner-user> /opt/jumin-dev/backend
sudo usermod -aG docker <runner-user>
```

배포 workflow가 GitHub `development` Environment secret을 Compose container에 주입합니다. 별도 systemd unit이나 배포 스크립트는 사용하지 않습니다. 운영 서버가 추가되면 image registry와 배포 인증 방식을 별도로 검토해야 합니다.

현재 서버에는 `local`과 `prod` profile만 있으므로, RDS를 사용하는 개발 EC2도 우선 `SPRING_PROFILES_ACTIVE=prod`로 실행합니다. 운영 서버가 추가되기 전에 `dev` profile을 별도로 만들지 여부를 결정해야 합니다.

실제 비밀 정보는 레포지토리가 아닌 배포 플랫폼의 시크릿 저장소에서 관리합니다.
