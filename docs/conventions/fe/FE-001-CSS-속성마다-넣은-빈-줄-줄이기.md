<!-- review-to-conventions:RULE-CONV-CSS-SPACING:begin -->
# CSS 속성마다 넣은 빈 줄 줄이기

연속된 속성은 이어 쓰고 의미 없는 빈 줄을 줄인다.

- 범위: 프런트엔드 Emotion CSS 선언 내부의 연속 속성
- 상태: 후보 · 논의 미확인 · 구현 반영

**설명용 예시**

변경 전

```css
.card {
  width: 40px;

  height: 40px;

  border: 0;
}
```

변경 후

```css
.card {
  width: 40px;
  height: 40px;
  border: 0;
}
```

근거: 스타일 정리 커밋이 여러 선언에서 속성마다 들어간 빈 줄을 제거했다. 구체적인 이유를 설명하는 리뷰는 확인하지 못했다. (추론)

- 한계: 커밋 관찰에서 만든 후보이며 팀 합의는 미확인이다. 속성 그룹·선택자 사이의 모든 빈 줄을 금지하지 않는다.; 원래 ParkingLotHeader 파일은 후속 UI 정리에서 제거됐다. 다른 모든 스타일 파일의 일관성까지 조사하지 않았다.

출처: [d84e7e9b](https://github.com/woowacourse-teams/2026-jumin/commit/d84e7e9bcb95c437ca67ea03b849df19a2d7a604) · [PR141](https://github.com/woowacourse-teams/2026-jumin/pull/141) · [PR141·2](https://github.com/woowacourse-teams/2026-jumin/blob/9198b125519f44d98f31b53b46930da2220f43b7/client/shared/components/ParkingLotHeader.tsx#L70)
<!-- review-to-conventions:RULE-CONV-CSS-SPACING:end -->
