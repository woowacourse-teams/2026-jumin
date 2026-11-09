<!-- review-to-conventions:RULE-CONV-JAVA-IF:begin -->
# Java의 조건 분기는 if로 풀기

Java 코드에서 삼항 연산자, `else`(`else if` 포함), `switch` 문과 식을 사용하지 않는다. 독립적인 `if`, 조기 반환, 기본값 설정 후 조건부 대입으로 분기한다.

- 범위: 서버 Java 구현과 테스트의 조건 분기
- 상태: 사용자 명시 채택

**설명용 예시**

변경 전

```java
return unknownFound ? Status.UNKNOWN : Status.AVAILABLE;
```

변경 후

```java
if (unknownFound) {
    return Status.UNKNOWN;
}
return Status.AVAILABLE;
```

기본값이 있는 경우

```java
Duration ttl = properties.getTtl();
if (cell.items().isEmpty()) {
    ttl = properties.getEmptyTtl();
}
```

근거: 기존 리뷰의 삼항식 정리 요청과 PR401의 `else` 제거 요청에 더해, 사용자가 삼항 연산자·`else`·`switch`를 모두 금지하도록 명시했다.

- 반례·반론: PR187에서는 같은 지적을 후속 리팩터링으로 제안했으며 현재 여석 계산에도 삼항식이 남아 있다. 이를 허용 예외로 합의했다는 근거는 없다.; 별도 고정 브랜치 320cf372는 ViewportObservation의 지표명과 ViewportSearchService의 요청 제한 선택을 if에서 삼항식으로 바꿨다. 9d3a7817 최종 병합 트리와 구분하며, 명시된 허용 예외나 규칙 철회로 해석하지 않는다.
- 한계: 분기를 정리할 때 조건의 평가 순서와 null 처리를 보존한다.

출처: [PR85](https://github.com/woowacourse-teams/2026-jumin/pull/85#discussion_r4056406511) · [PR187](https://github.com/woowacourse-teams/2026-jumin/pull/187#discussion_r4388648322) · [320cf372](https://github.com/woowacourse-teams/2026-jumin/commit/320cf3725d71d46f738563458af3c1c033f8c05e)

추가 근거: [PR401](https://github.com/woowacourse-teams/2026-jumin/pull/401#discussion_r4489151045) · 사용자 명시 채택
<!-- review-to-conventions:RULE-CONV-JAVA-IF:end -->
