// 루트 글자 크기가 16px일 때의 크기를 나타내며, 실제 값은 rem으로 정의
export const fontSize = {
  12: '0.75rem',
  14: '0.875rem',
  16: '1rem',
  18: '1.125rem',
  20: '1.25rem',
  30: '1.875rem',
} as const;

// 단위 없는 배율을 사용해 각 요소의 글자 크기에 비례하도록 구성
export const lineHeight = {
  130: 1.3,
  140: 1.4,
  150: 1.5,
} as const;

// 폰트 두께
export const fontWeight = {
  400: 400,
  700: 700,
  800: 800,
} as const;
