# Viewport Redis 배포 운영 메모

이 문서는 호스트 파일과 CI/CD 연결 계약을 설명한다. 실제 실행 전에는 트래픽 차단, DB writer·마이그레이션 호환성, Redis 인증서와 복구 계획을 별도로 검증한다. 이 절차만으로 cache ON 또는 운영 배포가 완료된 것은 아니다.

## 호스트 파일

환경은 `dev` 또는 `prod`이며 아래 경로는 `/opt/jumin-{환경}/viewport-cache` 아래에 둔다.

| 경로 | 소유권·권한 | 내용 |
| --- | --- | --- |
| `viewport-cache/` | root:root `0755` | runner가 공개 설정 파일 경로에 접근할 수 있는 상위 디렉터리 |
| `settings.env` | root:root `0644`, 그룹·기타 쓰기 금지 | 비밀이 없는 공개 설정만 기록 |
| `runtime/` | root:10001 `0750` | 컨테이너에 읽기 전용으로 mount |
| `runtime/jumin.viewport.cache.redis-username` | root:10001 `0440` 또는 `0640` | Redis 앱 ACL 사용자 |
| `runtime/jumin.viewport.cache.redis-password` | root:10001 `0440` 또는 `0640` | Redis 앱 ACL 비밀번호 |
| `runtime/jumin.viewport.cache.read-username` / `read-password` | root:10001 `0440` 또는 `0640` | 파일명에는 각각 `jumin.viewport.cache.` 전체 접두사를 붙인다 |
| `runtime/jumin.viewport.cache.observer-username` / `observer-password` | root:10001 `0440` 또는 `0640` | 파일명에는 각각 `jumin.viewport.cache.` 전체 접두사를 붙인다 |
| `runtime/redis-server.pem` | root 소유, 그룹·기타 쓰기 금지 | 해당 Redis 서버 인증서의 공개 PEM |
| `secrets/` | root:root `0700` | 원본 비밀 보관 시 사용. 컨테이너에 mount하지 않는다 |

비밀 파일 값은 개행 없이 저장하고 로그·명령 인자·Git에 노출하지 않는다. Redis 자격증명은 URI에 넣지 않는다. 활성화 overlay는 앱 이미지의 기본 사용자에 보조 그룹 `10001`을 추가한다. 새 이미지로 그 사용자와 보조 그룹이 비밀 파일을 읽을 수 있는지, root 소유·권한·symlink 조건이 맞는지 기존 컨테이너를 교체하기 전에 확인한다.

`settings.env`가 없거나 `ENABLED=false`면 cache OFF로 배포한다. ON에 필요한 공개 설정의 예는 다음과 같다. namespace는 해당 환경 ACL에 허용되는 **이전에 사용하지 않은 값**으로 정한다.

```dotenv
ENABLED=true
REDIS_URI=rediss://10.0.100.241:6379
NAMESPACE=dev_sq_release_20261030
```

prod Redis의 확인된 사설 주소는 `10.0.100.51:6379`이며 namespace는 `prod_sq_` 접두사를 사용한다. 선택적 `JAVA_TOOL_OPTIONS`는 문서화된 허용 형식의 `-Xmx`, `-Xms`, `-XX:` 또는 시간대 옵션만 쓴다. 미지정 시 기존 시간대 옵션만 유지하며 GC나 heap 크기를 임의로 바꾸지 않는다. 설정 파일은 shell로 실행하지 않으며 미지원 항목·중복·인증정보를 담은 URI는 거절한다.

## 배포와 복구

1. 파일이 없거나 `ENABLED=false`인 상태에서 새 writer 호환 이미지를 먼저 배포한다. DB 마이그레이션과 writer 호환성, 정상 조회·쓰기를 실제로 검증한다. 이 작업트리의 dev/prod 배포는 기존 `LOCAL_SEARCH_CLIENT_ID`와 `LOCAL_SEARCH_CLIENT_SECRET`을 유지한다.
2. 검증된 호환 이미지가 cache OFF로 실행 중일 때 `sudo bash infra/scripts/mark-viewport-compatible-image.sh dev --verified-writer-schema-compatible`처럼 해당 환경을 지정해 실행 이미지 ID를 기록한다. 이 플래그는 운영자의 검증 확인이며 스크립트가 DB 호환성을 자동 증명하지 않는다. 자동 롤백은 기록된 이전 이미지 ID와 현재 태그 대상 ID가 모두 일치할 때만 시도한다.
3. 최초 일회 준비 전에 backend와 proxy의 자동 배포를 중지하고, CloudFront·origin을 포함한 모든 viewport ingress를 차단하며 응답이 캐시되지 않는지 확인한다. 기존 요청과 물리 작업을 drain하거나 프로세스를 종료한다. 수동 작업도 `/opt/jumin-{환경}/backend/.viewport-deploy.lock`에 협조해야 하며, 별도 proxy CD는 이 잠금을 사용하지 않으므로 따로 중지해야 한다.
4. 차단을 유지하면서 준비된 호환 이미지와 configtree로 `prepareOnStartup=true`를 **일회만** 적용해 시작한다. 현재 CD는 이 값을 항상 false로 설정하므로 일회 준비는 운영자가 별도 통제한다. 기존 컨테이너의 DB/API 환경을 안전하게 유지하되 비밀을 출력하지 않는다. health UP이나 기존 ready 값만으로 성공을 판정하지 말고 DB state·grid·전체 매핑과 실제 Lua를 확인한다.
5. 여전히 차단된 상태에서 같은 이미지의 `prepareOnStartup=false`로 재시작하고 local smoke·Redis 연결·원본 비교를 확인한다. 이후에만 외부 차단을 해제하고 자동 배포를 재개한다. 실패 시 차단을 유지하고 같은 호환 이미지에서 `ENABLED=false`로 돌려 원본 조회를 확인한다.

기존 `project-public` SG는 dev/prod 네트워크를 분리하지 않는다. 환경별 Redis ACL 비밀과 namespace를 사용하고 인증서 만료 전 교체한다. 컨테이너 healthcheck 자동화와 IMDS 접근 명시 차단, 배포 후 실제 장애·부하 테스트는 별도 작업이다.
