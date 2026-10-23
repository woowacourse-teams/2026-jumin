import { palette } from './palette';

export const color = {
  text: {
    primary: palette.gray900,
    secondary: palette.gray600,
    placeholder: palette.gray600,
    disabled: palette.gray500,
    inverse: palette.white,
    inverseSecondary: palette.gray200,
    brand: palette.blue500,
    selected: palette.blue500,
    error: palette.red600,
  },

  icon: {
    default: palette.gray600,
    /** 선택 상태와 무관한 브랜드 강조 아이콘. */
    brand: palette.blue500,
    /** 현재 선택된 항목의 아이콘. */
    selected: palette.blue500,
    inverse: palette.white,
  },

  /** 필터 종류를 나타내는 고유색. 선택 표시는 공통 selected 토큰을 사용한다. */
  parkingFilter: {
    freeOnly: { icon: palette.green500 },
    excludeMechanical: { icon: palette.gray700 },
    isPublic: { icon: palette.blue500 },
  },

  parkingLike: {
    /** 좋아요를 누른 버튼의 하트·숫자·테두리. */
    selected: palette.red600,
  },

  background: {
    default: palette.white,
    subtle: palette.gray50,
    /** 스켈레톤·핸들·비선택 표시점 등 중립색 면. */
    muted: palette.gray200,
    inverse: palette.gray900,
    disabled: palette.gray200,
    brand: palette.blue500,
    brandHovered: palette.blue600,
    brandPressed: palette.blue600,
    brandSubtle: palette.blue50,
    brandSubtleHovered: palette.blue100,
    brandSubtlePressed: palette.blue100,
    selected: palette.blue500,
    selectedSubtle: palette.blue50,
  },

  mapProvider: {
    naver: { foreground: palette.white, background: palette.green400 },
    kakao: { foreground: palette.neutral900, background: palette.yellow400 },
    tmap: { foreground: palette.gray650, background: palette.gray75 },
  },

  border: {
    default: palette.gray200,
    brand: palette.blue500,
    brandSubtle: palette.blue100,
    selected: palette.blue500,
    /** 포커스된 입력 요소의 테두리. 외곽선에는 focus.ring을 사용한다. */
    focused: palette.blue500,
  },

  focus: {
    ring: palette.blue500,
  },

  overlay: {
    scrim: palette.gray900Alpha48,
  },
} as const;
