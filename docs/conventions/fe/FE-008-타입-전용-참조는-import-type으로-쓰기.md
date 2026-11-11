<!-- review-to-conventions:RULE-CONV-TYPE-IMPORT:begin -->
# 타입 전용 참조는 import type으로 쓰기

타입만 가져오면 import type을 쓰고 값과 함께 가져오면 해당 이름에 type 수식어를 붙인다.

- 범위: 클라이언트 TypeScript의 타입 전용 import
- 상태: 후보 · 논의 미확인 · 구현 반영

**설명용 예시**

변경 전

```typescript
import { Destination } from './contracts';
const getName = (destination: Destination) => destination.name;
```

변경 후

```typescript
import type { Destination } from './contracts';
const getName = (destination: Destination) => destination.name;
```

근거: PR120은 타입 전용 import로 바꿔 Webpack의 missing export 경고를 없애고 TypeScript 검사로 구분을 강제한다고 설명했다.

- 한계: 런타임에서 호출하거나 읽는 값의 import를 type-only로 바꾸지 않는다. 모듈 실행이 필요한 별도 side-effect import는 별도로 판단한다.; 초기 ESLint의 consistent-type-imports 선언은 ef91d46에서 제거됐다. 이후 PR120과 고정 tsconfig의 verbatimModuleSyntax는 별도 근거이며, ESLint 제거를 타입 전용 import 관례의 철회로 읽지 않는다.

출처: [PR120](https://github.com/woowacourse-teams/2026-jumin/pull/120) · [ef91d46e](https://github.com/woowacourse-teams/2026-jumin/commit/ef91d46e3ec7a0b782b5db2d94b2127968e3d602) · [9d3a7817](https://github.com/woowacourse-teams/2026-jumin/blob/9d3a7817a56e48807d73ebe3b2816fde053d61cf/client/tsconfig.json)
<!-- review-to-conventions:RULE-CONV-TYPE-IMPORT:end -->
