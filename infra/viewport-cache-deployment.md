# 사각형 셀 + Redis: TTL 전용 배포

기능 브랜치 → develop → main 순서로 승격한다. 기존 서버 CD의 development/production 환경을 사용한다.

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

redis-cd.yml은 develop/main에서 각각 development/production Secrets를 선택한다. 추가 Secrets는 REDIS_EC2_INSTANCE_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY이며 임시 자격증명이면 AWS_SESSION_TOKEN도 필요하다. 리전은 ap-northeast-2다.

백엔드 빌드는 GitHub 호스팅 러너에서 수행하고, 실제 백엔드 배포는 기존 jumin-dev/jumin-prod self-hosted ARM64 러너에서 실행한다. Redis 배포는 GitHub 호스팅 러너에서 SSM을 호출하는 방식이다.

호출자에게 대상 Redis 인스턴스 및 AWS-RunShellScript 문서의 ssm:SendCommand, 실행 결과 조회의 ssm:GetCommandInvocation 권한이 필요하다. 노드의 SSM 관리 역할과 호출자의 명령 실행 권한은 별개다. 공유 IAM 정책은 이 변경에서 수정하지 않는다.

SSM에는 공개 배포 코드만 보내며 Redis 비밀번호는 명령에 포함하지 않는다. 대상은 Docker/Compose와 /opt/jumin-redis-dev 또는 /opt/jumin-redis-prod의 compose.yaml, redis.conf, runtime 인증서/ACL, secrets/admin.secret가 준비되어 있어야 한다. 이미 만든 두 EC2의 초기 설정을 재사용하는 배포이며 새 EC2 초기 설치나 인증서/비밀번호 재발급을 수행하지 않는다.

고정 이미지 pull → Compose up → TLS 인증 PING 확인 순서다. 실패하면 이전 Compose 설정 복구를 시도한다. 실제 GitHub Secrets 등록·SSM 권한·AWS 실행은 별도로 확인해야 한다. 로컬 단위 테스트 통과는 운영 배포 성공의 증거가 아니다.

## 마이그레이션과 검증

V15는 아직 배포하지 않은 신규 캐시 마이그레이션을 단순화한 것이다. 이전 V15가 이미 적용된 DB에는 수정된 파일을 그대로 배포하지 않고 후속 마이그레이션을 추가해야 한다. V1~V14는 변경하지 않는다.

서버 검증: server에서 ./gradlew clean check bootJar. 배포 스크립트 검증: bash infra/scripts/tests/test-viewport-cache.sh.

배포 스크립트 검증은 셸 문법 검사와 Docker/HTTP를 대체한 백엔드 테스트 4건, AWS 호출을 대체한 SSM 테스트 3건이다. 실제 EC2에서 이미지 교체, TLS 인증, 장애 복구까지 실행하는 검증은 포함하지 않는다.

기존 부하 테스트 결과는 정리 전 구현에서 측정한 값이다. TTL 전용·공유 DB 풀·메모리 fallback 변경 후의 성능과 최대 수용량은 재측정해야 한다.
