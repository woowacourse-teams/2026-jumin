# 클라이언트

프론트엔드 애플리케이션을 이 디렉터리에 둡니다.

패키지 매니저로 pnpm을 사용합니다. 로컬과 CI에서 동일하게 설치할 수 있도록 `pnpm-lock.yaml`을 커밋하고, 다른 패키지 매니저의 잠금 파일은 포함하지 않습니다.

```bash
pnpm install
pnpm start
pnpm typecheck
pnpm build
```

`pnpm build`는 타입 검사를 통과한 뒤 프로덕션 번들을 생성합니다.

## Mock API

백엔드 없이 목적지 검색, 주차장 검색, 주차장 상세 조회를 개발할 때 MSW 개발 서버를 실행합니다.

```bash
pnpm dev:mock
```

기본 시나리오는 성공 응답입니다. 앱 URL의 `mock` 검색 파라미터로 다른 응답을 확인할 수 있습니다.

```text
?mock=destination-empty
?mock=destination-rate-limited
?mock=destination-failed
?mock=parking-empty
?mock=parking-slow
?mock=parking-server-error
?mock=parking-network-error
?mock=parking-detail-slow
?mock=parking-detail-not-found
?mock=parking-detail-server-error
```

일반 `pnpm dev`와 프로덕션 빌드에서는 MSW가 시작되지 않습니다.
