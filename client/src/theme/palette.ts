/** 색상 원본값. 사용 목적과 도메인별 연결은 color.ts에서 정의한다. */
export const palette = {
  white: '#FFFFFF',
  whiteAlpha94: 'rgb(255 255 255 / 94%)',

  // 파랑
  blue50: '#F1F3FF',
  blue100: '#E2E6FF',
  blue500: '#4356D8',
  blue600: '#3548C8',
  blue700: '#2B3BA8',

  // 중립색
  gray50: '#F7F9FC',
  gray75: '#EEF1F7',
  gray100: '#EDF0F5',
  gray200: '#DFE4EF',
  gray500: '#8A94A8',
  gray600: '#697386',
  gray650: '#546176',
  gray700: '#43506A',
  gray800: '#25314A',
  gray900: '#101B37',
  gray900Alpha10: 'rgb(16 27 55 / 10%)',
  gray900Alpha12: 'rgb(16 27 55 / 12%)',
  gray900Alpha24: 'rgb(16 27 55 / 24%)',
  gray900Alpha48: 'rgb(16 27 55 / 48%)',
  neutral900: '#231F20',

  // 초록
  green400: '#03C75A',
  green500: '#00AD78',

  // 빨강
  red400: '#E45454',
  red600: '#C02B3C',

  // 노랑
  yellow400: '#FEE500',
} as const;
