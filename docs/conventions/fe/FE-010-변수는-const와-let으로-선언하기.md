<!-- review-to-conventions:RULE-CONV-CONST-LET:begin -->
# 변수는 const와 let으로 선언하기

no-var·prefer-const 선언에 맞춰 var 대신 const/let을 쓰고 재대입하지 않는 값은 const로 둔다.

- 범위: client ESLint의 **/*.{ts,tsx} 명시 rules 선언 범위
- 상태: 후보 · 논의 미확인 · 구현 반영

**설명용 예시**

변경 전

```typescript
const countItems = (items: string[]) => {
  var count = items.length;
  return count;
};
```

변경 후

```typescript
const countItems = (items: string[]) => {
  const count = items.length;
  return count;
};
```

근거: 개별 규칙 선택 이유는 원문에서 확인하지 못했다.

- 한계: 고정 9d3a7817와 별도 320cf372의 명시 rules 선언이 같다. recommended 확장과 마지막 eslintConfigPrettier를 합친 실효 설정은 실행·계산하지 않아 최종 강제 수준으로 단정하지 않는다.; 설정 주석은 Airbnb를 참고해 선별했다고 말한다. 개별 선택 이유와 논의 합의는 미확인이며 Airbnb 전체 지침을 가져오지 않는다.; 호이스팅·스코프·초기화 이전 참조를 사용하는 기존 코드는 기계적으로 바꾸지 않는다. 재대입하는 변수에는 let이 필요하다.

출처: [a65725f5](https://github.com/woowacourse-teams/2026-jumin/commit/a65725f5379f2a49fa7e58dfacf68d396b5b2eb5) · [9d3a7817](https://github.com/woowacourse-teams/2026-jumin/blob/9d3a7817a56e48807d73ebe3b2816fde053d61cf/client/eslint.config.mjs) · [320cf372](https://github.com/woowacourse-teams/2026-jumin/blob/320cf3725d71d46f738563458af3c1c033f8c05e/client/eslint.config.mjs)
<!-- review-to-conventions:RULE-CONV-CONST-LET:end -->
