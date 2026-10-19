import { palette } from './palette';

export const color = {
  text: {
    primary: palette.gray900,
    secondary: palette.gray600,
    placeholder: palette.gray500,
    disabled: palette.gray550,
    inverse: palette.white,
    inverseSecondary: palette.gray200,
    brand: palette.primary500,
    selected: palette.primary500,
    error: palette.red500,
  },

  icon: {
    default: palette.gray600,
    selected: palette.primary500,
    inverse: palette.white,
  },

  parkingFilter: {
    freeOnly: palette.green500,
    excludeMechanical: palette.gray700,
  },

  background: {
    default: palette.white,
    subtle: palette.gray50,
    inverse: palette.gray900,
    disabled: palette.gray250,
    brand: palette.primary500,
    brandHovered: palette.primary600,
    brandPressed: palette.primary600,
    brandSubtle: palette.primary50,
    brandSubtleHovered: palette.primary100,
    brandSubtlePressed: palette.primary100,
    selected: palette.primary500,
    selectedSubtle: palette.primary50,
  },

  mapProvider: {
    naver: { foreground: palette.white, background: palette.naverGreen },
    kakao: { foreground: palette.kakaoDark, background: palette.kakaoYellow },
    tmap: { foreground: palette.tmapGray, background: palette.tmapLightGray },
  },

  border: {
    default: palette.gray200,
    brand: palette.primary500,
    brandSubtle: palette.primary200,
    selected: palette.primary500,
    focused: palette.primary500,
  },

  focus: {
    ring: palette.primary500Alpha30,
  },

  overlay: {
    scrim: palette.gray900Alpha48,
  },
} as const;
