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

## Sentry 소스맵

[Sentry 공식 Webpack 지침](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/webpack/)에 따라 프로덕션 빌드에서 `hidden-source-map`을 생성합니다. 개발·운영 CD의 빌드 단계는 JS와 소스맵을 Sentry에 업로드한 뒤 `.map` 파일을 삭제합니다. 삭제 후 동일한 JS를 Artifact로 전달하므로 AWS 설정을 변경하지 않습니다.

GitHub 저장소의 Actions 설정에 다음 값을 등록해야 CD 빌드가 성공합니다.

| 이름                | 저장 위치 | 값                                             |
| ------------------- | --------- | ---------------------------------------------- |
| `SENTRY_AUTH_TOKEN` | Secret    | 공용 Sentry 조직의 업로드용 Organization Token |
| `SENTRY_ORG`        | Variable  | 조직 slug                                      |
| `SENTRY_PROJECT`    | Variable  | 기존 `SENTRY_DSN`이 가리키는 프로젝트 slug     |

토큰은 클라이언트 번들에 주입하지 않습니다. 로컬 빌드와 PR 검사에서는 업로드하지 않습니다. `SENTRY_UPLOAD_SOURCEMAPS=true`인 CD에서는 인증값 누락이나 업로드 실패로 빌드가 실패하며 배포가 실행되지 않습니다. Artifact 업로드 전에는 `.map` 파일이 남아 있지 않은지도 검사합니다.

개발 배포 후 새 테스트 오류를 발생시키고 Sentry에서 원본 `.tsx` 경로, 줄 번호와 코드 문맥을 확인합니다. 이벤트의 Debug ID와 업로드한 소스맵의 Debug ID가 일치해야 합니다. 기존에 수집한 오류는 새 소스맵 업로드만으로 재처리되지 않으므로 반드시 새 이벤트로 검증합니다. 확인 후 테스트 코드를 제거합니다.

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
