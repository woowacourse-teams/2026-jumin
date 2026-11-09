<!-- review-to-conventions:RULE-CONV-NESTED-MESSAGE:begin -->
# 여러 단계의 메시지 선택은 if로 풀기

중첩 삼항식을 순서가 보이는 if와 반환으로 풀어 쓴다.

- 범위: 프런트엔드 검색 결과처럼 여러 상태에 따른 안내 문구 선택
- 상태: 후보 · 논의 동의 · 구현 반영

**설명용 예시**

변경 전

```typescript
const getMessage = () =>
  query.length < 2 ? '두 글자 이상' : isSearching ? '검색 중' : errorMessage || '';
```

변경 후

```typescript
const getMessage = () => {
  if (query.length < 2) return '두 글자 이상';
  if (isSearching) return '검색 중';
  return errorMessage || '';
};
```

근거: 리뷰는 연속 삼항식의 가독성을 지적했고 작성자는 해당 안내 문구를 if로 바꿨다.

- 반례·반론: 작성자는 중첩 두 번 정도는 괜찮고 길이를 줄이고 싶었다는 선호를 밝혔다. 이번 분기는 수정했지만 단순한 모든 삼항식에 대한 금지는 합의하지 않았다.
- 한계: 입력 검사→로딩→오류→빈 결과의 우선순위를 보존한다. Java의 조건부 값 선택 규칙과 범위를 구분한다.

출처: [PR31](https://github.com/woowacourse-teams/2026-jumin/pull/31#discussion_r3812682277) · [PR31·2](https://github.com/woowacourse-teams/2026-jumin/pull/31#discussion_r3813236030) · [a4bcae9b](https://github.com/woowacourse-teams/2026-jumin/commit/a4bcae9b98f31ff9b0c82fd79d659cabbd348870)
<!-- review-to-conventions:RULE-CONV-NESTED-MESSAGE:end -->
