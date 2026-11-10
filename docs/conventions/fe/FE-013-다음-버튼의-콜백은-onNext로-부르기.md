<!-- review-to-conventions:RULE-CONV-NEXT-CALLBACK:begin -->
# 다음 버튼의 콜백은 onNext로 부르기

컴포넌트 이름의 Confirm보다 실제 버튼 동작을 드러내는 onNext를 사용한다.

- 범위: DestinationConfirmSheet의 다음 버튼 입력 이름과 사용부
- 상태: 후보 · 논의 동의 · 구현 반영

**설명용 예시**

변경 전

```tsx
interface Props { onConfirm: () => void }
const NextButton = ({ onConfirm }: Props) => (
  <button onClick={onConfirm}>다음</button>
);
```

변경 후

```tsx
interface Props { onNext: () => void }
const NextButton = ({ onNext }: Props) => (
  <button onClick={onNext}>다음</button>
);
```

근거: 리뷰는 버튼이 다음 버튼이라는 점을 이유로 들었고 작성자는 onNext를 유지하겠다고 수용했다.

- 한계: 실제 변경에는 onComfirm 오타도 있었다. 이 후보는 오타 수정만이 아니라 컴포넌트명과 버튼 행동 중 어느 의미를 이름에 담을지에 관한 답변을 근거로 한다.; 모든 확인·제출 버튼을 onNext로 바꾸라는 규칙은 아니다.

출처: [PR134](https://github.com/woowacourse-teams/2026-jumin/pull/134#discussion_r4231591272) · [PR134·2](https://github.com/woowacourse-teams/2026-jumin/pull/134#discussion_r4233368083) · [9d3a7817](https://github.com/woowacourse-teams/2026-jumin/blob/9d3a7817a56e48807d73ebe3b2816fde053d61cf/client/src/pages/ParkingSetupPage/components/DestinationConfirmSheet.tsx)
<!-- review-to-conventions:RULE-CONV-NEXT-CALLBACK:end -->
