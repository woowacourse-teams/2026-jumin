<!-- review-to-conventions:RULE-CONV-DOUBLE-LITERAL:begin -->
# double 리터럴은 소수점으로 표현하기

0d, 1d 대신 0.0, 1.0처럼 소수점이 보이는 표기를 사용한다.

- 범위: 주차 균형점수 계산기와 관련 테스트의 실수 리터럴
- 상태: 후보 · 논의 동의 · 구현 반영

**설명용 예시**

변경 전

```java
double scale = 10_000d;
return Math.min(Math.max(value, 0d), 1d);
```

변경 후

```java
double scale = 10_000.0;
return Math.min(Math.max(value, 0.0), 1.0);
```

근거: 리뷰에서는 익숙한 소수점 표기를 제안했고 작성자는 기존 d 표기가 생성 코드의 스타일이라 바꾸겠다고 답했다.

- 반례·반론: 리뷰어는 작성자가 평소 d 표기를 사용한다면 유지해도 된다고 명시했다. 저장소 전체의 d 접미사 금지로 확정하지 않는다.
- 한계: 이 후보는 해당 계산 코드의 표기 통일이다. 실수 타입 선택이나 반올림 정책 변경을 포함하지 않는다.

출처: [PR21](https://github.com/woowacourse-teams/2026-jumin/pull/21#discussion_r3792027234) · [PR21·2](https://github.com/woowacourse-teams/2026-jumin/pull/21#discussion_r3792382271) · [a5484fa6](https://github.com/woowacourse-teams/2026-jumin/commit/a5484fa63efc7fb7bff0fa3bf3f659fc5033e351)
<!-- review-to-conventions:RULE-CONV-DOUBLE-LITERAL:end -->
