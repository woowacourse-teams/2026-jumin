<!-- review-to-conventions:RULE-CONV-PRETTIER:begin -->
# 클라이언트 서식은 Prettier 설정에 맞추기

괄호 always·LF·세미콜론·작은따옴표·들여쓰기 2칸·후행 쉼표 all을 사용하며 printWidth는 100으로 둔다.

- 범위: client/.prettierrc의 명시 서식 설정
- 상태: 후보 · 논의 미확인 · 구현 반영

**설명용 예시**

변경 전

```typescript
const names = items.map(item => "주차장: " + item.name)
```

변경 후

```typescript
const names = items.map((item) => '주차장: ' + item.name);
```

근거: 설정값을 선택한 별도 이유는 원문에서 확인하지 못했다.

- 한계: printWidth는 줄바꿈 기준이며 모든 줄을 무조건 100자 이하로 만들라는 하드 제한으로 쓰지 않는다.; 2026-08-26 a1417ef에서 120→100 변경을 확인했다. fixed 9d3a7817와 별도 320cf372의 파일 내용이 같다.; 예시는 괄호·따옴표·세미콜론을 보여 준다. 실제 Prettier를 실행한 결과나 과거 원문 코드 인용이 아니다.

출처: [9d3a7817](https://github.com/woowacourse-teams/2026-jumin/blob/9d3a7817a56e48807d73ebe3b2816fde053d61cf/client/.prettierrc) · [a1417ef4](https://github.com/woowacourse-teams/2026-jumin/commit/a1417ef488758d54a9caf10d86903d865dbe3e89) · [320cf372](https://github.com/woowacourse-teams/2026-jumin/blob/320cf3725d71d46f738563458af3c1c033f8c05e/client/.prettierrc)
<!-- review-to-conventions:RULE-CONV-PRETTIER:end -->
