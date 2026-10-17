import { fontSize, fontWeight, lineHeight } from './font';

export const typography = {
  titlePage: {
    fontSize: fontSize[30],
    lineHeight: lineHeight[130],
    fontWeight: fontWeight[800],
  },
  titleSection: {
    fontSize: fontSize[20],
    lineHeight: lineHeight[140],
    fontWeight: fontWeight[800],
  },
  titleCard: {
    fontSize: fontSize[18],
    lineHeight: lineHeight[140],
    fontWeight: fontWeight[800],
  },
  body: {
    fontSize: fontSize[16],
    lineHeight: lineHeight[150],
    fontWeight: fontWeight[400],
  },
  bodyStrong: {
    fontSize: fontSize[16],
    lineHeight: lineHeight[150],
    fontWeight: fontWeight[800],
  },
  bodySmall: {
    fontSize: fontSize[14],
    lineHeight: lineHeight[150],
    fontWeight: fontWeight[400],
  },
  bodySmallStrong: {
    fontSize: fontSize[14],
    lineHeight: lineHeight[150],
    fontWeight: fontWeight[800],
  },
  caption: {
    fontSize: fontSize[12],
    lineHeight: lineHeight[150],
    fontWeight: fontWeight[400],
  },
  label: {
    fontSize: fontSize[14],
    lineHeight: lineHeight[140],
    fontWeight: fontWeight[700],
  },
} as const;
