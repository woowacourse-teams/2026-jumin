<!-- review-to-conventions:RULE-CONV-PARSE-NAME:begin -->
# 파싱 메서드 이름에 parse 넣기

yesNo처럼 값의 모양만 적지 않고 parseYesNo처럼 파싱 동작을 드러낸다.

- 범위: 서버 CSV Y/N 파싱과 유사한 변환 메서드 이름
- 상태: 후보 · 논의 동의 · 구현 반영

**설명용 예시**

변경 전

```java
private boolean yesNo(Column column) {
    return readYesNo(column);
}
```

변경 후

```java
private boolean parseYesNo(Column column) {
    return readYesNo(column);
}
```

근거: 호출부에서 값 조회와 문자열 해석을 이름으로 구분할 수 있다. (추론)

- 한계: 모든 변환·조회 메서드를 parse 접두사로 바꾸라는 근거는 아니다.

출처: [PR150](https://github.com/woowacourse-teams/2026-jumin/pull/150#discussion_r4266764800) · [PR150·2](https://github.com/woowacourse-teams/2026-jumin/pull/150#discussion_r4267288319) · [ea9fe438](https://github.com/woowacourse-teams/2026-jumin/commit/ea9fe438ee529ceb16f177b1a0890e435263cf09)
<!-- review-to-conventions:RULE-CONV-PARSE-NAME:end -->
