<!-- review-to-conventions:RULE-CONV-LOCAL-PROPS:begin -->
# 컴포넌트 전용 입력 타입은 Props로 쓰기

컴포넌트 이름을 반복한 타입명 대신 Props라는 짧은 이름을 사용한다.

- 범위: 단일 컴포넌트 파일 내부에서만 쓰는 Props 타입
- 상태: 후보 · 논의 동의 · 구현 반영

**설명용 예시**

변경 전

```tsx
interface FilterButtonProps {
  label: string;
}
export const FilterButton = ({ label }: FilterButtonProps) => <button>{label}</button>;
```

변경 후

```tsx
interface Props {
  label: string;
}
export const FilterButton = ({ label }: Props) => <button>{label}</button>;
```

근거: 파일 안에서 사용 대상이 분명할 때 타입 이름의 중복을 줄인다. (추론)

- 한계: 공용으로 export하는 타입이나 여러 컴포넌트가 함께 있는 파일의 타입명은 이 근거로 정하지 않는다.

출처: [PR32](https://github.com/woowacourse-teams/2026-jumin/pull/32#discussion_r3811775705) · [PR32·2](https://github.com/woowacourse-teams/2026-jumin/pull/32#discussion_r3812810959) · [14b4e020](https://github.com/woowacourse-teams/2026-jumin/commit/14b4e0203dfe8c7cbb964fa24a07b8795b773b82)
<!-- review-to-conventions:RULE-CONV-LOCAL-PROPS:end -->
