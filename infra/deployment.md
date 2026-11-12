# 배포 운영 가이드

개발·운영 EC2의 최초 구성, 개발 단일 컨테이너 배포와 운영 블루·그린 전환·복구 절차입니다.
일상적인 실행·테스트 명령은 [인프라 README](README.md)를 참고합니다.

## 환경 설정

| 항목 | 개발 | 운영 |
| --- | --- | --- |
| 브랜치 | `develop` | `main` |
| 배포 방식 | 단일 컨테이너 교체 | 블루·그린 무중단 전환 |
| GitHub Environment | `development` | `production` |
| Linux ARM64 Runner | `jumin-dev` | `jumin-prod` |
| 배포 경로 | `/opt/jumin-dev` | `/opt/jumin-prod` |
| Docker 네트워크 | `jumin-dev_default` | `jumin-prod_default` |
| API 원본 도메인 | `origin-dev.jucha.info` | `origin.jucha.info` |
| 프론트 도메인 | `dev.jucha.info` | `jucha.info` |

### EC2 준비

- Docker Engine, Docker Compose plugin, `curl`, `flock`, `python3`를 설치합니다.
- Runner 계정에 환경별 `backend`, `proxy`, `certbot` 경로의 쓰기 권한을 부여합니다.
- EC2에서 RDS와 외부 API에 연결할 수 있어야 합니다. RDS에 `postgis`와 `pgrouting`을 설치합니다.
- Docker의 journald 로그 드라이버와 journal 영구 저장·회전 정책을 설정합니다.
- 호스트 loopback 포트는 개발 백엔드 `8080`, 운영 프록시의 배포 확인·Alloy 수집 `18080`을 사용합니다.
- API 원본 도메인의 DNS를 EC2로 연결하고 보안 그룹에서 TCP `80`, `443`을 허용합니다.

### GitHub Secrets

개발·운영의 각 Environment에 다음 값을 등록합니다.

| 구분 | Secrets |
| --- | --- |
| DB | `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` |
| 목적지 검색 | `LOCAL_SEARCH_REST_API_KEY` |
| 역지오코딩 | `REVERSE_GEOCODING_CLIENT_ID`, `REVERSE_GEOCODING_CLIENT_SECRET` |
| 관리자 인증 | `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOKEN_SECRET` |
| 실시간 여석 수집 | `SEOUL_PARKING_API_KEY` 또는 `SEOUL_OPEN_DATA_API_KEY`, `BUSAN_PARKING_API_KEY` |

관리자 자격 증명은 개발·운영별로 다르게 설정합니다. `ADMIN_ENV_LABEL`은 workflow가 `dev` 또는 `prod`로 전달합니다.
실시간 여석 수집은 Environment Variable `PARKING_AVAILABILITY_ENABLED=true`일 때 활성화합니다.
Redis 설정은 [Viewport 캐시 배포 문서](viewport-cache-deployment.md)를 참고합니다.

Alloy 수집에는 Repository Secret `OBSERVABILITY_INGEST_PASSWORD`가 필요합니다.
Runner 계정에 `/opt/jumin-alloy` 쓰기 권한과 수집 데이터 디렉터리 소유권을 설정할 `sudo -n` 권한을 부여합니다.
EC2에서 `https://grafana.jucha.info:443`으로 연결할 수 있어야 합니다.

## 최초 배포

### 운영의 기존 단일 백엔드에서 전환

로컬 Docker 테스트로 운영 설정의 전환·복구를 검증한 뒤 운영 EC2에 적용합니다.

1. 해당 브랜치의 프록시 CD를 실행합니다. 라우팅 디렉터리와 관리 포트를 연결하면서 Nginx를 재생성합니다.
2. 백엔드 CD를 실행합니다. 기존 백엔드를 유지한 채 첫 blue 슬롯을 기동합니다.
3. 호스트의 `http://127.0.0.1:18080/health`와 원본 도메인의 `/health`를 확인합니다.
4. Grafana에서 활성 슬롯의 지표·로그와 프록시 5xx를 확인합니다.

같은 push에서 백엔드 CD가 먼저 실행돼 프록시 검사에 실패했다면, 프록시 CD 완료 후 실패한 백엔드 job을 다시 실행합니다.
전환 이후에는 새 배포 방식이 포함된 workflow를 실행하고, 이전 릴리스 복구에는 롤백 명령을 사용합니다.

개발은 기존 단일 백엔드 구성을 유지하므로 슬롯 전환을 위한 프록시 준비가 필요하지 않습니다.

### 새 환경 설치

1. Runner, DB와 Secrets를 준비합니다.
2. 백엔드 CD로 Docker 네트워크와 백엔드를 준비합니다. 개발은 단일 `backend`, 운영은 첫 blue 슬롯입니다.
3. 아래 절차로 HTTP 프록시를 기동하고 인증서를 발급합니다.
4. 프록시 CD로 HTTPS 설정을 적용합니다.
5. `/health`와 Grafana 수집 상태를 확인합니다.

운영에서는 프록시 설치 전에 초기 슬롯을 다시 배포할 수 있습니다.
운영 프록시를 사용하기 시작한 뒤 프록시가 중단되거나 삭제되면 먼저 복구합니다.

## HTTPS 프록시와 인증서

CloudFront는 API 요청을 원본 도메인으로 전달합니다.

```text
브라우저 → CloudFront ┬ 정적 파일 → S3
                     └ /api/* → API 원본 도메인 → Nginx → 백엔드
```

CloudFront의 원본 HTTPS 인증서와 요청 Host가 API 원본 도메인에 맞아야 합니다.
인증서는 환경별 `/opt/jumin-<환경>/certbot/conf`에 보관합니다.

### 환경 선택

해당 EC2의 저장소에서 실행합니다. `RUNNER_USER`는 실제 runner 실행 계정으로 지정합니다.

```bash
# 개발
DEPLOY_ENV=dev
ORIGIN_DOMAIN=origin-dev.jucha.info
PROXY_COMPOSE=infra/docker-compose.proxy.yml
BOOTSTRAP_CONF=infra/nginx/bootstrap.conf
PROXY_CONFIG=jumin.conf
PROXY_PROJECT=jumin-proxy
RUNNER_USER=github-runner
```

운영 EC2에서는 다음 값을 사용합니다.

```bash
DEPLOY_ENV=prod
ORIGIN_DOMAIN=origin.jucha.info
PROXY_COMPOSE=infra/docker-compose.proxy.prod.yml
BOOTSTRAP_CONF=infra/nginx/bootstrap.prod.conf
PROXY_CONFIG=jumin.prod.conf
PROXY_PROJECT=jumin-proxy-prod
RUNNER_USER=github-runner
```

### HTTP 프록시 기동

백엔드 CD가 환경별 Docker 네트워크와 백엔드를 준비한 상태에서 실행합니다.

```bash
DEPLOY_ROOT="/opt/jumin-$DEPLOY_ENV"
BOOTSTRAP_RELEASE="$DEPLOY_ROOT/proxy/releases/bootstrap"
PROXY_CURRENT="$DEPLOY_ROOT/proxy/current"
COMPOSE_NAME="$(basename "$PROXY_COMPOSE")"
RUNNER_GROUP="$(id -gn "$RUNNER_USER")"

sudo install -d -o "$RUNNER_USER" -g "$RUNNER_GROUP" -m 755 \
  "$BOOTSTRAP_RELEASE" \
  "$DEPLOY_ROOT/certbot/www"
if [[ "$DEPLOY_ENV" == prod ]]; then
  sudo install -d -o "$RUNNER_USER" -g "$RUNNER_GROUP" -m 755 "$DEPLOY_ROOT/proxy/backend-routing"
fi
sudo install -d -o "$RUNNER_USER" -g "$RUNNER_GROUP" -m 700 \
  "$DEPLOY_ROOT/certbot/conf"

sudo -u "$RUNNER_USER" -H docker network inspect "jumin-${DEPLOY_ENV}_default"
sudo -u "$RUNNER_USER" install -m 644 "$BOOTSTRAP_CONF" "$BOOTSTRAP_RELEASE/$PROXY_CONFIG"
sudo -u "$RUNNER_USER" install -m 644 "$PROXY_COMPOSE" "$BOOTSTRAP_RELEASE/$COMPOSE_NAME"
sudo -u "$RUNNER_USER" ln -sfn "$BOOTSTRAP_RELEASE" "$PROXY_CURRENT"

sudo -u "$RUNNER_USER" -H env NGINX_CONF_FILE="$PROXY_CURRENT/$PROXY_CONFIG" \
  docker compose --project-name "$PROXY_PROJECT" \
    --file "$PROXY_CURRENT/$COMPOSE_NAME" up --detach nginx

curl --fail --show-error --head "http://$ORIGIN_DOMAIN"
```

호스트 Nginx가 포트를 사용 중인 환경은 위 컨테이너 기동 전에 `sudo systemctl stop nginx`를 실행합니다.
전환 실패 시 Docker 프록시를 내리고 `sudo systemctl start nginx`로 호스트 Nginx를 복구합니다.

### 인증서 발급과 HTTPS 적용

```bash
TEAM_EMAIL='팀 이메일 주소'

sudo -u "$RUNNER_USER" -H env NGINX_CONF_FILE="$PROXY_CURRENT/$PROXY_CONFIG" \
  docker compose --project-name "$PROXY_PROJECT" \
    --file "$PROXY_CURRENT/$COMPOSE_NAME" \
    run --rm certbot certonly \
      --webroot \
      --webroot-path /var/www/certbot \
      --domain "$ORIGIN_DOMAIN" \
      --email "$TEAM_EMAIL" \
      --agree-tos \
      --no-eff-email \
      --non-interactive
```

인증서 발급 후 해당 브랜치의 프록시 CD를 실행합니다.

```bash
curl --fail --show-error --head "https://$ORIGIN_DOMAIN"
curl --fail --show-error "https://$ORIGIN_DOMAIN/health"
```

호스트 Nginx에서 이전한 환경은 HTTPS를 확인한 뒤 `sudo systemctl disable nginx`를 실행합니다.

### 인증서 갱신

갱신 테스트를 수행한 뒤 환경별 스크립트를 cron 또는 systemd timer에 등록합니다.

```bash
sudo -u "$RUNNER_USER" -H env NGINX_CONF_FILE="$PROXY_CURRENT/$PROXY_CONFIG" \
  docker compose --project-name "$PROXY_PROJECT" \
    --file "$PROXY_CURRENT/$COMPOSE_NAME" run --rm certbot renew --dry-run
```

| 환경 | 갱신 스크립트 |
| --- | --- |
| 개발 | `infra/scripts/renew-certificates.sh` |
| 운영 | `infra/scripts/renew-certificates-prod.sh` |

개발 환경의 cron 예시는 다음과 같습니다. 실행 경로는 EC2의 실제 checkout 또는 설치 경로로 지정합니다.

```cron
17 3 * * * /absolute/path/to/repository/infra/scripts/renew-certificates.sh >> /var/log/jumin-certbot.log 2>&1
```

갱신 스크립트를 checkout 밖에 복사해 사용하는 환경은 배포 코드 변경 시 사본도 갱신합니다.
스크립트는 활성 릴리스의 Compose를 사용합니다. 운영에서는 백엔드·프록시 배포와 같은 잠금을 획득합니다.

## 배포와 복구

### 개발 단일 컨테이너 배포

`jumin-dev` Compose 프로젝트의 `backend`를 새 이미지로 교체하고, 호스트의
`http://127.0.0.1:8080/actuator/health`를 확인합니다. 교체 중에는 잠시 요청을 처리하지 못할 수 있습니다.
실패하면 현재 Secrets로 이전 이미지를 다시 기동하며, 성공했을 때만 `backend/current`를 갱신합니다.
Alloy는 배포 후 갱신하고, 백엔드 `8080`에서 지표를 직접 수집합니다.

### 운영 전환과 지연 정리

`backend-blue`와 `backend-green`을 기존 Docker 네트워크에 연결하고, 별도 Compose 프로젝트로 관리합니다.
Nginx는 `proxy/backend-routing/active.conf`에 지정한 슬롯으로 요청을 보냅니다.

새 슬롯의 `/actuator/health/readiness`가 준비되면 라우팅 파일을 교체하고 Nginx를 리로드합니다.
전환 확인 후 `backend/current`를 새 릴리스에 연결합니다.
기존 요청이 끝나면 이전 슬롯을 정지해 롤백용으로 보관합니다.

드레인이 60초를 넘기거나 전환 후 작업이 취소되면 릴리스의 `drain-backend.sh`가 정리를 이어갑니다.
진행 상황은 해당 릴리스의 `drain.log`에서 확인합니다.
모니터는 배포 잠금과 라우팅 세대를 확인하며, 다음 전환이 발생하면 종료합니다.
감시 시작 후 10분이 지나면 릴리스와 정지 대기 중인 슬롯을 `drain.log`와 시스템 저널에 한 번 기록합니다.
Grafana의 `Backend drain exceeded 10 minutes (prod)` 경고를 받으면 Loki의 `{environment="prod", service="backend-drain"}`에서 상세 정보를 확인합니다.
감시는 경고 이후에도 요청 종료를 확인한 뒤 이전 슬롯을 정지합니다.
보존 중인 이전 슬롯은 재부팅 시 자동 기동을 해제하고, 다시 활성화할 때 재시작 정책을 복원합니다.

Alloy는 최초 단일 백엔드 전환 전에 준비하고, 이후에는 백엔드 배포 후 갱신합니다.
지연 정리 중 두 슬롯의 여석 수집 시각이 겹치면 외부 API 호출이 중복될 수 있습니다.

### 운영 마이그레이션과 용량 확인

배포 중 두 버전이 같은 EC2와 DB를 사용하므로 메모리와 RDS 연결 여유를 확보합니다.
Flyway 변경은 이전 앱과 호환돼야 합니다. V15가 미적용이면 `parking_lots`의 배타 잠금과
인덱스 생성 시간을 확인하고 별도로 적용합니다.

이전 앱이 viewport 셀 매핑을 갱신하지 않는 버전이면 `VIEWPORT_CACHE_ENABLED=false`로 먼저 전환합니다.
기존 슬롯이 종료된 뒤 매핑 준비를 켜서 캐시를 활성화합니다.
해당 이전 앱으로 롤백하려면 캐시를 비활성화한 설정을 먼저 배포하고, 재활성화할 때 매핑을 다시 준비합니다.

### 운영 실패와 수동 롤백

후보 준비가 실패하면 기존 슬롯이 요청을 계속 처리합니다.
Nginx 전환이나 전환 확인이 실패하면 이전 라우팅을 복구하고 배포를 실패로 기록합니다.
복구 상태나 요청 종료를 확인할 수 없으면 두 슬롯을 보존합니다.

수동 롤백은 [README의 명령](README.md#상태-확인과-롤백)을 사용합니다.
보관 슬롯은 다음 배포에서 재사용하기 전까지 선택할 수 있습니다.
보관 슬롯을 시작하기 전에 활성 슬롯과 관리자 인증, DB 연결, 외부 API 및 Redis 설정을 비교합니다.
Redis 캐시가 활성화돼 있으면 두 슬롯의 읽기 전용 CA 파일도 비교합니다. 설정이 다르거나 CA 파일을 확인할 수 없으면 롤백이 차단됩니다.
설정이나 자격 증명 교체 후 이전 코드로 돌아가려면 현재 설정과 Secrets로 해당 코드를 새 릴리스로 배포합니다.
트래픽 롤백 이후에도 적용한 DB 마이그레이션은 유지됩니다.

### 강제 종료 후 라우팅 복구

운영 EC2에서 디스크의 대상과 Nginx의 실제 대상을 비교합니다.

```bash
cat /opt/jumin-prod/proxy/backend-routing/active.conf
curl -si http://127.0.0.1:18080/route
```

파일의 대상 슬롯이 준비됐는지 확인하고 Nginx에 적용합니다.

```bash
docker exec jumin-nginx-prod nginx -t
docker exec jumin-nginx-prod nginx -s reload
curl -fsSi http://127.0.0.1:18080/health
```

복구 확인 전에는 두 슬롯을 보존합니다.

## 관측성

[Grafana](https://grafana.jucha.info)에서 로그와 지표를 확인합니다.
접근은 Grafana 로그인과 수집용 HTTPS Basic Auth로 관리하고, `environment` 라벨로 개발·운영을 필터링합니다.
개발·운영 Alloy는 같은 수집 비밀번호를 사용합니다. RDS 지표는 AWS RDS 콘솔에서 확인합니다.

| 설정 | 위치 |
| --- | --- |
| 중앙 스택 | [observability/compose.yml](observability/compose.yml) |
| 호스트 수집기 | [observability/alloy/](observability/alloy/) |
| 경보 | [rules.yml](observability/grafana/provisioning/alerting/rules.yml) |
| Discord 알림 | [notifications.yml](observability/grafana/provisioning/alerting/notifications.yml) |

중앙 EC2에는 Runner, Docker Compose, DNS, EBS 마운트와 HTTPS 인증서가 필요합니다.
`observability` Environment의 `GRAFANA_ADMIN_PASSWORD`, `DISCORD_WEBHOOK_URL`과
Repository Secret `OBSERVABILITY_INGEST_PASSWORD`를 설정합니다.
설정 검증은 `bash infra/observability/scripts/validate-stack.sh`로 실행합니다.

중앙 스택은 [observability workflow](../.github/workflows/observability.yml)가 `main`에서 배포합니다.
새 릴리스의 준비 확인에 실패하면 이전 Compose를 재실행합니다. 첫 배포 실패는 실행 상태를 직접 확인합니다.

| 데이터 | 저장 위치 | 보존 |
| --- | --- | --- |
| Loki 로그 | 50 GiB EBS `/mnt/jumin-loki` | 개발 7일, 운영 30일 |
| Prometheus 지표 | 관측성 EC2 root EBS | 15일 또는 4 GB |
| Grafana 설정 | 관측성 EC2 root EBS | 별도 백업 필요 |

경보는 수집 중단, 백엔드·프록시 5xx, p95 지연, CPU·메모리 사용률을 확인합니다.
백엔드 5xx 비율과 지연 경보는 최근 5분 요청 10건 이상일 때 평가합니다.
실제 데이터 수신과 Discord 알림은 배포 후 확인합니다.


## 보행망 수동 적재

변환·적재 명령은 [서버 안내](../server/README.md#osm-보행-네트워크-적재)를 사용합니다.
로컬 또는 별도 작업 호스트에서 실행하며 다음을 준비합니다.

- `OSM_PBF_DATE` 또는 `OSM_PBF_FILE`로 원본을 지정하고, 준비된 CSV는 `OSM_GRAPH_DIR`로 지정합니다.
- 원본·CSV·변환 캐시 공간을 확보합니다. 임시 경로는 `OSM_TEMP_DIR`로 지정할 수 있습니다.
- RDS에 적재할 때는 `DB_TARGET=direct`와 DB 접속·SSL 설정을 지정합니다.
- 대상 DB의 마이그레이션과 pgRouting을 적용하고, 적재 계정에 관련 테이블의 SELECT·INSERT·UPDATE·TRUNCATE와 임시 테이블 생성 권한을 부여합니다.

스크립트는 검증 후 보행망 전체를 하나의 트랜잭션으로 교체하고, 실패하면 기존 데이터를 보존합니다.
새 환경에서는 최초 적재가 완료된 뒤 검색 서비스를 개방합니다.
