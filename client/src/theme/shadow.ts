import { color } from './color';

/** 높이에 따른 그림자. 색은 color.shadow에서 가져온다. */
export const shadow = {
  /** 지도 위에 떠 있는 컨트롤(검색창·칩·조건 바·안내). */
  floating: `0 2px 12px ${color.shadow.floating}`,
  /** 화면 아래에서 올라오는 시트. */
  sheet: `0 -10px 30px ${color.shadow.sheet}`,
  /** 화면 가운데 모달. */
  modal: `0 24px 64px ${color.shadow.modal}`,
} as const;
