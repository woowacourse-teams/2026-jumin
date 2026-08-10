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
