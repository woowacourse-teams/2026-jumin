<!-- review-to-conventions:RULE-CONV-BOOLEAN-ACCUMULATION:begin -->
# boolean 상태 누적은 조건과 대입으로 쓰기

boolean 복합 대입 연산자 대신 if 안에서 플래그를 true로 설정한다.

- 범위: 운영 상태 평가처럼 발견 여부를 누적하는 Java 코드
- 상태: 후보 · 논의 동의 · 구현 반영

**설명용 예시**

변경 전

```java
unknownFound |= status == Status.UNKNOWN;
```

변경 후

```java
if (status == Status.UNKNOWN) {
    unknownFound = true;
}
```

근거: 답글에서 boolean 상태 누적 의도가 한눈에 드러나도록 명시적인 if문으로 바꾼다고 설명했다.

- 한계: 비트 마스크 연산이나 모든 복합 대입 연산자를 금지하는 규칙으로 확대하지 않는다.

출처: [PR21](https://github.com/woowacourse-teams/2026-jumin/pull/21#discussion_r3790856970) · [PR21·2](https://github.com/woowacourse-teams/2026-jumin/pull/21#discussion_r3791409895) · [251225ee](https://github.com/woowacourse-teams/2026-jumin/commit/251225ee78c81b629f4617a172fbca463e391dac)
<!-- review-to-conventions:RULE-CONV-BOOLEAN-ACCUMULATION:end -->
