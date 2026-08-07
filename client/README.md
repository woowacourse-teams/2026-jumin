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
