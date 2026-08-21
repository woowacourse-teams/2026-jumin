# 인프라

인프라 코드, 배포 워크플로, 환경 설정을 이 디렉터리에 둡니다. 비밀 정보는 레포지토리에 포함하지 않고, 필요한 환경 변수 이름만 담은 `.env.example` 파일을 제공합니다.

## 로컬 PostgreSQL

로컬 개발에서는 Spring과 React를 직접 실행하고 PostgreSQL만 Docker Compose로
실행합니다.

```bash
docker compose -f infra/docker-compose.local.yml up -d --wait
```

기본 접속 정보와 환경변수 변경 방법은 [서버 README](../server/README.md)를
확인합니다.

`postgres-data` named volume은 이 로컬 PostgreSQL container의 데이터를
보존하기 위한 것입니다. 개발 서버용 Compose에는 PostgreSQL과 이 volume을
포함하지 않습니다.

## 개발 서버 backend 배포

개발 서버 배포는 `.github/workflows/server-dev-cd.yml`이 담당합니다. EC2의
`jumin-dev` ARM64 self-hosted runner에서 검증된 JAR로 Docker image를 만들고
Docker Compose로 backend container를 실행합니다. RDS 접속 정보는 GitHub
`development` Environment secret으로 전달합니다.

개발 서버의 데이터베이스는 AWS RDS입니다. 따라서 개발 서버에서
`postgres-data` volume을 만들거나 PostgreSQL container를 실행하지 않습니다.

배포 전 runner에 다음 경로와 권한을 준비합니다.

```bash
sudo install -d -m 2775 /opt/jumin-dev/backend/releases
sudo chown -R <runner-user>:<runner-user> /opt/jumin-dev/backend
```

Docker Compose의 `restart: unless-stopped`로 container 프로세스 장애와 Docker
daemon 재시작에 대응합니다. EC2 자체 재부팅 시 Docker 서비스가 자동 시작되도록
설정해야 합니다.
