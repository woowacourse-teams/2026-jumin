<!-- review-to-conventions:RULE-CONV-NAMED-STYLES:begin -->
# 긴 JSX 스타일은 이름 있는 선언으로 빼기

스타일을 이름 있는 css 선언으로 빼고 JSX에는 그 이름을 전달한다.

- 범위: 프런트엔드의 긴 Emotion 스타일 선언
- 상태: 후보 · 논의 제안 · 구현 반영

**설명용 예시**

변경 전

```tsx
const Toolbar = () => (
  <nav className={css`
    display: flex;
    gap: 8px;
  `}>메뉴</nav>
);
```

변경 후

```tsx
const Toolbar = () => <nav className={toolbarStyle}>메뉴</nav>;

const toolbarStyle = css`
  display: flex;
  gap: 8px;
`;
```

근거: 리뷰는 인라인 className이 읽기 어렵다면 별도 스타일 선언으로 바꾸는 방식을 제안했다.

- 반례·반론: 고정 9d3a7817의 DestinationConfirmSheet에는 긴 className CSS도 남아 있다. 그 위치를 읽기 어렵다고 판정한 논의는 확인되지 않았으므로, 모든 인라인 스타일 금지나 승인된 예외로 확대하지 않는다.
- 한계: 리뷰는 즉시 수정 대신 디자인 규격 정리 후 변경을 제안했다. PR31 병합 때는 인라인이었고 후속 d08cfef의 파일 패치에서 분리를 확인했다. 인과관계나 팀 합의는 추정하지 않는다.

출처: [PR31](https://github.com/woowacourse-teams/2026-jumin/pull/31#discussion_r3812580750) · [PR35](https://github.com/woowacourse-teams/2026-jumin/commit/d08cfef8fca62fef2a405a5d1a9c836e2934aab0) · [9d3a7817](https://github.com/woowacourse-teams/2026-jumin/blob/9d3a7817a56e48807d73ebe3b2816fde053d61cf/client/src/pages/ParkingSetupPage/components/DestinationConfirmSheet.tsx)
<!-- review-to-conventions:RULE-CONV-NAMED-STYLES:end -->
