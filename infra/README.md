# 인프라

`infra/`는 로컬 데이터베이스와 개발·운영 서버 배포에 필요한 설정을 관리합니다.
애플리케이션 실행과 테스트 방법은 [서버 README](../server/README.md)를 참고하세요.

## 구성

| 파일 | 용도 |
| --- | --- |
| `docker-compose.local.yml` | 로컬 PostgreSQL + PostGIS 실행 |
| `docker-compose.dev.yml` | 개발 서버 백엔드 컨테이너 실행 |
| `docker-compose.prod.yml` | 운영 서버 백엔드 컨테이너 실행 |
| `docker-compose.proxy.yml` | 개발 서버 Nginx + Certbot 실행 |
| `docker-compose.proxy.prod.yml` | 운영 서버 Nginx + Certbot 실행 |
| `nginx/bootstrap.conf` | 최초 인증서 발급 전 HTTP 설정 |
| `nginx/jumin.conf` | HTTPS, 정적 파일, API 프록시 설정 |
| `nginx/bootstrap.prod.conf` | 운영 최초 인증서 발급 전 HTTP 설정 |
| `nginx/jumin.prod.conf` | 운영 HTTPS, 정적 파일, API 프록시 설정 |
| `scripts/renew-certificates.sh` | Let's Encrypt 인증서 갱신 및 Nginx 재적용 |
| `scripts/renew-certificates-prod.sh` | 운영 Let's Encrypt 인증서 갱신 및 Nginx 재적용 |
| `.env.example` | 로컬 데이터베이스 환경변수 예시 |

## 로컬 데이터베이스

로컬 개발에서는 PostgreSQL과 PostGIS를 Docker Compose로 실행합니다.

```bash
docker compose -f infra/docker-compose.local.yml up -d --wait
```

기본 접속 정보는 다음과 같습니다.

| 항목 | 기본값 |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `jumin` |
| Username | `jumin` |
| Password | `jumin` |

환경변수를 변경하려면 `infra/.env.example`을 참고해 `infra/.env`를 만들고
Compose를 실행합니다. `postgres-data` 볼륨은 데이터베이스 컨테이너를 종료한 뒤에도
데이터를 보존합니다.

```bash
docker compose -f infra/docker-compose.local.yml down
```

데이터까지 초기화할 때만 볼륨을 삭제합니다.

```bash
docker compose -f infra/docker-compose.local.yml down --volumes
```

> [!WARNING]
> Apple Silicon에서는 현재 PostGIS 이미지가 amd64 기반이므로 실행 명령 앞에
> `DOCKER_DEFAULT_PLATFORM=linux/amd64`를 붙여야 합니다. 자세한 실행·테스트 방법은
> [서버 README의 아키텍처별 실행](../server/README.md#1-호스트-아키텍처-확인)을 참고하세요.

## 개발 서버 배포

개발 서버 배포는 [`server-dev-cd.yml`](../.github/workflows/server-dev-cd.yml)이
담당합니다. `develop`에 변경사항이 반영되면 다음 순서로 배포합니다.

1. 백엔드 테스트와 JAR 빌드
2. 개발 서버용 Docker image 빌드
3. `jumin-dev` ARM64 self-hosted runner에서 백엔드 컨테이너 실행
4. `/actuator/health` 확인

개발 서버는 AWS RDS를 사용하므로 PostgreSQL 컨테이너와 `postgres-data` 볼륨을
사용하지 않습니다. RDS와 외부 API 접속 정보는 GitHub `development` Environment의
secret으로 전달합니다.

배포 환경에는 다음이 필요합니다.

- Docker Engine과 Docker Compose plugin
- `jumin-dev` self-hosted runner
- EC2에서 RDS로 연결할 수 있는 네트워크 권한
- EC2에 연결된 IAM Role의 `/jumin/dev/backend` 로그 기록 권한
- CloudWatch Logs로 나가는 outbound HTTPS 연결
- GitHub `development` Environment secret

## 운영 서버 배포

운영 서버 백엔드 배포는 [`server-prod-cd.yml`](../.github/workflows/server-prod-cd.yml)이
담당합니다. `main`에 변경사항이 반영되면 다음 순서로 배포합니다.

1. 백엔드 테스트와 JAR 빌드
2. 운영 서버용 Docker image 빌드
3. `jumin-prod` ARM64 self-hosted runner에서 백엔드 컨테이너 실행
4. `/actuator/health` 확인
5. health check 실패 시 이전 Docker image와 release symlink 복구

운영 배포 전에 다음 인프라가 준비되어 있어야 합니다.

- `jumin-prod` 라벨을 가진 Linux ARM64 self-hosted runner
- 운영 EC2의 `/opt/jumin-prod/backend` 쓰기 권한
- EC2에서 운영 RDS로 연결할 수 있는 네트워크 권한
- Docker Engine, Docker Compose plugin, `curl`, `rsync`
- 운영 CloudWatch Logs 그룹 `/jumin/prod/backend`
- GitHub `production` Environment의 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`,
  `LOCAL_SEARCH_CLIENT_ID`, `LOCAL_SEARCH_CLIENT_SECRET` secret
- 운영 백엔드 Compose가 생성한 `jumin-prod_default` Docker network

운영 백엔드 workflow는 Compose project `jumin-prod`로 실행되므로 기본 network
`jumin-prod_default`를 생성합니다. 운영 proxy Compose는 이 network를 `external`로
참조해 backend와 연결합니다. 따라서 최초 운영 proxy를 실행하기 전에 backend 배포를 먼저
완료해야 합니다.
따라서 Nginx는 호스트 loopback이 아니라 Docker DNS 이름 `backend:8080`으로 API를
전달합니다. 백엔드의 `127.0.0.1:8080` host binding은 로컬 점검용으로 유지됩니다.

`production` Environment와 `jumin-prod` runner가 없는 상태에서는 deploy job을 실행할 수
없으므로 운영 배포가 완료되지 않습니다. 운영 배포는 `main` 병합 후 GitHub Actions에서
실행하며, workflow의 health check가 성공한 뒤에만 완료로 판단합니다.

## 운영 서버 HTTPS 프록시

운영 요청 흐름은 다음과 같습니다.

```text
브라우저 -> jucha.info -> EC2:80/443 -> Docker Nginx
                                             |-- /api/* -> backend:8080
                                             `-- 그 외  -> /var/www/jumin-prod/current
```

운영 프록시 배포는 [`proxy-prod-cd.yml`](../.github/workflows/proxy-prod-cd.yml)이
담당합니다. 프론트엔드 배포가 `/var/www/jumin-prod/current`를 갱신하고, 프록시 배포가
`/opt/jumin-prod/proxy/current/jumin.prod.conf`를 갱신합니다. 두 workflow 모두
`main` push를 기준으로 실행하며 `production` Environment를 사용합니다.

운영 배포 전에 다음을 준비해야 합니다.

- `jucha.info`가 운영 EC2 Elastic IP를 가리키는 DNS A 레코드
- EC2 보안 그룹의 인바운드 TCP `80`, `443`
- `jumin-prod` 라벨의 Linux ARM64 self-hosted runner
- EC2의 `/opt/jumin-prod/proxy`, `/opt/jumin-prod/certbot` 쓰기 권한
- 운영 backend 배포가 완료되어 `jumin-prod_default` network가 생성된 상태

Let's Encrypt 인증서는 저장소에 넣지 않고 EC2의
`/opt/jumin-prod/certbot/conf`에 보존합니다. 최초 발급은 다음 순서로 한 번만 수동
수행합니다. 아래 파일·Docker 명령은 SSH 기본 사용자 대신 실제 CD 실행 사용자
`github-runner`로 실행합니다. 저장소 경로는 실제 EC2 checkout 경로에 맞게 변경합니다.

```bash
sudo install -d -m 755 \
  /opt/jumin-prod/certbot/www \
  /opt/jumin-prod/proxy/releases/bootstrap
sudo install -d -m 700 /opt/jumin-prod/certbot/conf

sudo -u github-runner -H docker network inspect jumin-prod_default >/dev/null

sudo -u github-runner install -m 644 infra/nginx/bootstrap.prod.conf \
  /opt/jumin-prod/proxy/releases/bootstrap/jumin.prod.conf
sudo -u github-runner install -m 644 infra/docker-compose.proxy.prod.yml \
  /opt/jumin-prod/proxy/releases/bootstrap/docker-compose.proxy.prod.yml
sudo -u github-runner ln -sfn /opt/jumin-prod/proxy/releases/bootstrap \
  /opt/jumin-prod/proxy/current

sudo -u github-runner -H env NGINX_CONF_FILE=/opt/jumin-prod/proxy/current/jumin.prod.conf \
  docker compose \
    --project-name jumin-proxy-prod \
    --file /opt/jumin-prod/proxy/current/docker-compose.proxy.prod.yml \
    up --detach nginx

curl --fail --show-error --head http://jucha.info
```

HTTP challenge가 확인되면 팀 이메일을 넣어 인증서를 발급합니다.

```bash
TEAM_EMAIL='팀 이메일 주소'

sudo -u github-runner -H env NGINX_CONF_FILE=/opt/jumin-prod/proxy/current/jumin.prod.conf \
  docker compose \
    --project-name jumin-proxy-prod \
    --file /opt/jumin-prod/proxy/current/docker-compose.proxy.prod.yml \
    run --rm certbot certonly \
      --webroot \
      --webroot-path /var/www/certbot \
      --domain jucha.info \
      --email "${TEAM_EMAIL}" \
      --agree-tos \
      --no-eff-email \
      --non-interactive
```

인증서 발급이 성공한 뒤 `main`에 프록시 설정을 병합하면
`proxy-prod-cd.yml`이 HTTPS 설정으로 Nginx를 교체합니다. 최초 발급 전에 HTTPS
설정으로 workflow를 실행하면 인증서 파일이 없어 실패하므로, 위 bootstrap과 발급
절차를 먼저 완료해야 합니다.

갱신은 다음 스크립트를 `jumin-prod` EC2의 cron 또는 systemd timer에 등록합니다.
스크립트와 Compose 파일은 현재 활성 release를 기준으로 동작하므로 별도 checkout 경로가
필요하지 않습니다.

```bash
infra/scripts/renew-certificates-prod.sh
```

운영 DNS, EC2, `jumin-prod` runner가 준비되지 않은 상태에서는 저장소 workflow만으로
운영 배포를 완료할 수 없습니다. 이 항목들은 AWS·DNS·GitHub 관리 권한으로 별도
준비해야 합니다.

## 개발 서버 HTTPS 프록시

개발 서버의 요청 흐름은 다음과 같습니다.

```text
브라우저 -> dev.jucha.info -> EC2:80/443 -> Docker Nginx
                                             |-- /api/* -> backend:8080
                                             `-- 그 외  -> /var/www/jumin-dev/current
```

개발 Nginx 설정 배포는 [`proxy-dev-cd.yml`](../.github/workflows/proxy-dev-cd.yml)이
담당합니다. 기존에 실행 중인 `jumin-nginx-dev`가 저장소 checkout 파일을 직접 mount하고
있으면 첫 배포에서 현재 설정을 `/opt/jumin-dev/proxy/releases`로 자동 채택한 뒤
release symlink 방식으로 전환합니다. 이후 `develop`에 proxy 설정이 반영될 때마다
`nginx -t`와 HTTPS health check를 통과한 설정만 적용하고 실패 시 이전 설정으로
복구합니다.

가비아 DNS에는 다음 A 레코드가 등록되어 있어야 합니다.

| 타입 | 호스트 | 값 | TTL |
| --- | --- | --- | --- |
| A | `dev` | EC2의 Elastic IP | `600` |

아래 명령은 저장소 루트에서 실행합니다. 먼저 백엔드 컨테이너가 실행 중이고
`jumin-dev_default` Docker 네트워크에 `backend`라는 별칭으로 연결되어 있어야 합니다.

```bash
docker inspect jumin-backend-dev \
  --format '{{range $name, $network := .NetworkSettings.Networks}}network={{$name}} aliases={{json $network.Aliases}}{{println}}{{end}}'
```

### 1. 사전 준비

EC2 보안 그룹에서 인바운드 TCP `80`, `443`을 허용하고 인증서 저장 경로를 만듭니다.
인증서 파일은 Git 저장소가 아니라 EC2의 `/opt/jumin-dev/certbot/conf`에 보존됩니다.

```bash
sudo install -d -m 755 /opt/jumin-dev/certbot/www
sudo install -d -m 755 /opt/jumin-dev/certbot/conf
```

### 2. Docker Nginx로 HTTP 전환

호스트 Nginx가 이미 80번 포트를 사용하므로 먼저 중지한 뒤, 인증서 없이 실행할 수
있는 bootstrap 설정으로 컨테이너를 시작합니다. 호스트 Nginx 설정은 롤백을 위해
삭제하지 않습니다.

```bash
sudo systemctl stop nginx

NGINX_CONF_FILE=./nginx/bootstrap.conf \
  docker compose \
    --project-name jumin-proxy \
    --file infra/docker-compose.proxy.yml \
    up --detach nginx

curl --fail --show-error --head http://dev.jucha.info
```

전환에 실패하면 다음 명령으로 즉시 원래 구성으로 돌아갑니다.

```bash
docker compose \
  --project-name jumin-proxy \
  --file infra/docker-compose.proxy.yml \
  down
sudo systemctl start nginx
```

### 3. Let's Encrypt 인증서 발급

`TEAM_EMAIL`에는 인증서 만료 알림을 받을 팀 이메일을 넣습니다. 이메일은 저장소에
커밋하지 않습니다.

```bash
TEAM_EMAIL='팀 이메일 주소'

docker compose \
  --project-name jumin-proxy \
  --file infra/docker-compose.proxy.yml \
  run --rm certbot certonly \
    --webroot \
    --webroot-path /var/www/certbot \
    --domain dev.jucha.info \
    --email "${TEAM_EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive
```

### 4. HTTPS 설정 적용

인증서가 발급되면 기본 `jumin.conf`를 사용하도록 Nginx 컨테이너를 다시 만듭니다.
정상 확인 후에만 호스트 Nginx의 자동 시작을 해제합니다.

```bash
docker compose \
  --project-name jumin-proxy \
  --file infra/docker-compose.proxy.yml \
  up --detach --force-recreate nginx

docker compose \
  --project-name jumin-proxy \
  --file infra/docker-compose.proxy.yml \
  exec --no-TTY nginx nginx -t

curl --fail --show-error --head https://dev.jucha.info
curl --fail --show-error http://127.0.0.1:8080/actuator/health

sudo systemctl disable nginx
```

HTTP 요청은 HTTPS로 리다이렉트됩니다. `/api/` 요청은 Docker 네트워크 안에서
`backend:8080`으로 전달되고, 그 외 요청은 프론트엔드 정적 파일로 처리됩니다.

### 5. 인증서 자동 갱신

먼저 실제 인증서를 변경하지 않는 갱신 테스트를 실행합니다.

```bash
docker compose \
  --project-name jumin-proxy \
  --file infra/docker-compose.proxy.yml \
  run --rm certbot renew --dry-run
```

테스트가 성공하면 root crontab에 갱신 스크립트를 등록합니다. 배포 workflow가
`/opt/jumin-dev/proxy/current`에 활성 Compose 파일을 보관하므로 checkout 경로에
의존하지 않습니다. 스크립트 자체는 저장소에서 EC2에 복사하거나, 운영 중인 checkout의
절대 경로를 사용합니다.

```bash
sudo crontab -e
```

```cron
17 3 * * * /absolute/path/to/repository/infra/scripts/renew-certificates.sh >> /var/log/jumin-certbot.log 2>&1
```

갱신 상태와 Nginx 로그는 다음 명령으로 확인합니다.

```bash
sudo tail -n 100 /var/log/jumin-certbot.log
docker logs --tail 100 jumin-nginx-dev
```

## 로그

로컬은 애플리케이션의 stdout/stderr를 콘솔에서 확인합니다. 개발 서버의
`jumin-backend-dev` 컨테이너는 Docker `awslogs` logging driver로 stdout/stderr를
서울 리전(`ap-northeast-2`)의 `/jumin/dev/backend` CloudWatch Logs 그룹에 전송합니다.
로그 그룹은 배포 전에 생성하며 Docker가 자동으로 만들지 않습니다.

개발 서버의 CloudWatch 로그 설정은 다음을 사용합니다.

```text
로그 클래스: Standard
보존 기간: 7일
전송 방식: non-blocking
버퍼 크기: 10m
```

EC2에 연결된 IAM Role에는 해당 로그 그룹의 로그 스트림 조회·생성·기록 권한만
부여합니다. 로그 수집 설정을 변경하면 backend 컨테이너를 재생성해야 반영됩니다.
운영 환경의 로그 수집·검색·알림도 CloudWatch Logs를 사용합니다.

## 관련 문서

- [서버 README](../server/README.md): 애플리케이션 실행과 테스트
- [팀 컨벤션](../docs/team-conventions.md): 브랜치와 커밋 규칙
- [Server CI](../.github/workflows/server-ci.yml): 백엔드 검증 workflow
- [Server CD](../.github/workflows/server-dev-cd.yml): 개발 서버 배포 workflow
- [Development proxy CD](../.github/workflows/proxy-dev-cd.yml): 개발 Nginx 배포 workflow
- [Server production CD](../.github/workflows/server-prod-cd.yml): 운영 서버 배포 workflow
- [Production proxy CD](../.github/workflows/proxy-prod-cd.yml): 운영 Nginx 배포 workflow
