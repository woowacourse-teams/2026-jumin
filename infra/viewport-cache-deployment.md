# 사각형 셀 + Redis: TTL 전용 배포

기능 브랜치 → develop → main 순서로 승격한다. 기존 서버 CD의 development/production 환경을 사용하며 별도 GitHub 환경은 필요하지 않다.

## GitHub 환경별 설정

기존 DB/API/admin Secrets는 유지한다. Redis에는 아래 같은 이름의 Secrets를 환경별 값으로 설정한다.

| 이름 | 값 |
| --- | --- |
| VIEWPORT_REDIS_URI | dev/prod 사설 IP 또는 DNS의 rediss://호스트:6379. URI에 인증정보를 넣지 않는다. |
| VIEWPORT_REDIS_USERNAME | 해당 Redis 서버의 ACL 사용자명 |
| VIEWPORT_REDIS_PASSWORD | 서버 ACL과 일치하는 비밀번호 |
| VIEWPORT_REDIS_TLS_CA_PEM | 신뢰할 공개 PEM 인증서. 접속 주소가 인증서 SAN과 일치해야 한다. |

Variables: VIEWPORT_CACHE_ENABLED(기본 false), VIEWPORT_CACHE_TTL(10m), VIEWPORT_CACHE_EMPTY_TTL(1m), VIEWPORT_CACHE_TTL_JITTER(0.2), VIEWPORT_CACHE_PREPARE_ON_STARTUP(true).

활성화 시 백엔드를 교체하기 전에 TLS/AUTH/PING을 확인한다. 인증서만 릴리스 디렉터리에 저장하여 읽기 전용 마운트한다. 비밀번호는 GitHub Secrets에서 컨테이너 환경변수로 주입한다. Docker 접근 권한이 있는 사용자는 컨테이너 환경변수를 볼 수 있다. 배포 로그나 Compose config 전체를 출력하지 않는다.

## 만료와 데이터 정합성

캐시 만료는 저장 시점부터 TTL±Jitter이다. 기본값에서 결과 있는 셀은 8~12분, 빈 셀은 48~72초다. 조회는 만료 시간을 연장하지 않는다. DB 변경 후 자동 삭제나 데이터 버전 전환은 없다.

진행 중인 이전 조회가 DB 변경 후 저장되면 그 저장 시점부터 TTL이 적용된다. 따라서 DB 수정 시점부터 정확히 12분 이내에 최신 결과를 보장한다고 말할 수 없다. 여러 셀의 데이터 시점도 다를 수 있다.

셀 번호와 인덱스, 준비 상태/격자 크기는 유지한다. 초기 준비와 CSV 변경의 셀 매핑 갱신은 쓰기 트랜잭션에서 수행한다. 준비와 CSV 변경은 상태 행 및 원본 테이블 잠금으로 직렬화하며 SELECT는 허용한다. 다른 프로그램이 좌표를 직접 수정하면 그 프로그램도 매핑을 갱신해야 한다. TTL은 잘못된 셀 매핑을 복구하지 않는다.

전용 읽기/관측 계정, 별도 연결 풀, 세션 관측 함수, DB 인증 제한시간 전제, DB 쓰기 보호 트리거와 epoch/revision은 사용하지 않는다. 기존 DB 풀을 공유하므로 다른 API와 연결을 경쟁한다. 요청/쿼리 시간 제한과 DB 실행 수 제한은 유지하지만 네트워크 장애 때 실제 서버 세션 수까지 엄격하게 보장하지 않는다.

대용량 fallback 응답은 메모리에 구성한다. 행 상한 초과 시 부분 결과를 반환하지 않는다. 캐시 batch 예산은 전체 응답이나 모든 동시 요청의 힙 상한이 아니다.

## Redis EC2 자동 배포

redis-cd.yml은 develop/main에서 각각 기존 development/production 환경의 Secrets를 선택한다. 위의 캐시 Secrets 네 개는 유지한다. Redis CD에는 REDIS_EC2_INSTANCE_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN이 필요하지 않지만 다른 용도로 사용하는 기존 GitHub Secrets는 유지한다.

백엔드 빌드와 Redis 배포 스크립트 검증은 GitHub 호스팅 러너에서 수행한다. Redis 검증이 통과하면 `Dockerfile`과 `deploy.sh`, 두 파일의 SHA-256 목록을 `redis-<브랜치>-<커밋 SHA>-<실행 ID>-<시도 번호>` 아티팩트로 업로드한다. 아티팩트 보존 기간은 1일이며 Compose 설정, 인증서, ACL, 비밀번호는 포함하지 않는다. 백엔드 배포는 기존 jumin-dev/jumin-prod self-hosted ARM64 러너에서, Redis 배포는 각 Redis EC2에 등록한 전용 self-hosted ARM64 러너에서 수행한다.

| Redis EC2 | 러너 이름과 전용 label | 필수 labels |
| --- | --- | --- |
| dev | jumin-redis-dev | self-hosted, Linux, ARM64, jumin-redis-dev |
| prod | jumin-redis-prod | self-hosted, Linux, ARM64, jumin-redis-prod |

각 러너는 해당 EC2의 ubuntu 사용자로 실행한다. Redis 배포 job은 저장소를 체크아웃하지 않고 build job이 출력한 이름의 아티팩트를 내려받아 SHA-256 목록으로 파일을 확인한 후 배포 스크립트를 실행한다. 아티팩트 보존 기간 1일 이내에는 배포 job만 재실행해도 성공한 build의 아티팩트를 참조한다. 비대화형 sudo에서 `VIEWPORT_REDIS_URI`, `REDIS_ARTIFACT_DIR`, `GITHUB_SHA`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` 환경변수를 보존할 수 있어야 한다. URI는 인증정보 없이 `rediss://HOST:6379` 형식이어야 한다.

2026-10-30 두 Redis EC2의 `/home/ubuntu/actions-runner-redis`에 공식 ARM64 runner 2.338.0을 SHA-256 검증 후 설치했다. 각 runner는 ubuntu 사용자로 실행하며 systemd의 enabled/active와 GitHub의 Online 상태를 확인했다. 비대화형 sudo에서 위의 다섯 환경변수 보존과 두 Redis의 인증서 SAN·TLS 인증 PING도 확인했다. 기존 jumin-dev/jumin-prod SSH 키를 재사용하며 백엔드 서버를 경유해 사설 IP로 접속한다.

대상에는 Docker/Compose와 /opt/jumin-redis-dev 또는 /opt/jumin-redis-prod의 compose.yaml, redis.conf, runtime 인증서/ACL, secrets/admin.secret가 준비되어 있어야 한다. root가 관리하는 기존 부트스트랩 비밀 파일과 인증서를 보존하고 재사용한다. 새 EC2 초기 설치나 인증서/비밀번호 재발급은 수행하지 않는다.

배포 스크립트도 아티팩트와 실행 정보를 확인한 후 Redis EC2에서 고정 공식 Redis 베이스 이미지에 커밋 SHA 레이블을 추가해 `jumin-redis:<커밋 SHA>-<실행 ID>-<시도 번호>` 이미지를 빌드한다. 이미지 태그의 시도 번호는 현재 배포 시도의 번호다. Redis 소스의 재컴파일은 없다. 이 이미지를 Compose에 지정해 기동하고 TLS 인증 PING을 확인한다. 실패하거나 HUP/INT/TERM 신호로 종료되면 이전 Compose 설정 복구를 시도한다. 복구에 실패하면 이전 설정 백업을 보존한다. SIGKILL·호스트 장애에서는 복구 코드를 실행할 수 없으므로 남아 있는 백업과 실제 컨테이너 상태를 확인해 수동 복구한다.

배포 성공 후에도 이전 이미지는 롤백을 위해 보존하며, 실패한 배포의 이미지를 포함해 로컬 이미지를 자동 삭제하지 않는다. 불필요한 이미지 정리는 별도 운영 작업에서 검토하며, 전체 Docker 이미지나 리소스를 대상으로 하는 prune은 실행하지 않는다.

수정한 workflow는 아직 develop/main에 병합되지 않아 GitHub Actions를 통한 실제 이미지 교체는 검증하지 않았다. development/production의 Secrets와 브랜치별 첫 배포 결과를 확인해야 한다. 로컬 단위 테스트 통과나 기존 Redis의 PONG만으로 새 배포 성공을 판단하지 않는다.

## 마이그레이션과 검증

V15는 아직 배포하지 않은 신규 캐시 마이그레이션을 단순화한 것이다. 이전 V15가 이미 적용된 DB에는 수정된 파일을 그대로 배포하지 않고 후속 마이그레이션을 추가해야 한다. V1~V14는 변경하지 않는다.

서버 검증: server에서 ./gradlew clean check bootJar. 배포 스크립트 검증: bash infra/scripts/tests/test-viewport-cache.sh.

배포 스크립트 검증은 셸 문법 검사와 외부 명령을 대체한 백엔드·Redis 테스트를 수행한다. Redis 테스트는 아티팩트와 입력 검증, 정상 배포, 부트스트랩 누락, 배포 실패·종료 신호 시 복구, 복구 실패 시 백업 보존, 잠금 충돌을 검증한다. 실제 EC2에서 이미지 교체와 장애 복구까지 실행하는 검증은 포함하지 않는다.

기존 부하 테스트 결과는 정리 전 구현에서 측정한 값이다. TTL 전용·공유 DB 풀·메모리 fallback 변경 후의 성능과 최대 수용량은 재측정해야 한다.
