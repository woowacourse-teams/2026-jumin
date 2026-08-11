/** 지도 마커 아이콘. 목적지·현재 위치는 글자로, 주차장은 피코 핀으로 구분한다. */

import type { NaverMaps, NaverMarkerIcon } from './naverTypes';

const labelPinHtml = (label: string) =>
  `<button type="button" aria-label="${label}" style="width:34px;height:34px;border:3px solid #4356d8;border-radius:50% 50% 50% 12%;background:#ffffff;color:#4356d8;font:700 13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 12px rgba(30,42,90,.28);transform:rotate(-45deg)"><span style="display:block;transform:rotate(45deg)">${label}</span></button>`;

export const labelMarkerIcon = (maps: NaverMaps, label: string): NaverMarkerIcon => ({
  content: labelPinHtml(label),
  size: new maps.Size(34, 34),
  anchor: new maps.Point(17, 34),
});

// 주차장 마커는 피코 핀으로 통일한다. 순번을 적지 않고 색과 크기로 선택을 표시한다.
const PIN_TEARDROP = 'M16 0C7.163 0 0 7.163 0 16c0 10.5 16 24 16 24s16-13.5 16-24C32 7.163 24.837 0 16 0Z';
const PIN_MARK = '<circle cx="16" cy="16" r="5.5" fill="#fff"/>';
const PIN_WIDTH = 32;
const PIN_HEIGHT = 40;
const PIN_SELECTED_SCALE = 1.3;

export const lotMarkerIcon = (maps: NaverMaps, label: string, selected: boolean): NaverMarkerIcon => {
  const scale = selected ? PIN_SELECTED_SCALE : 1;
  const width = Math.round(PIN_WIDTH * scale);
  const height = Math.round(PIN_HEIGHT * scale);
  const outline = selected
    ? `<path d="${PIN_TEARDROP}" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>`
    : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 32 40" style="display:block">` +
    `<path d="${PIN_TEARDROP}" fill="${selected ? '#1249c4' : '#4356d8'}"/>${outline}${PIN_MARK}</svg>`;
  return {
    content: `<button type="button" aria-label="${label}" aria-pressed="${selected}" style="display:block;width:${width}px;height:${height}px;padding:0;border:0;background:transparent;filter:drop-shadow(0 3px 6px rgba(20,33,61,.32))">${svg}</button>`,
    size: new maps.Size(width, height),
    anchor: new maps.Point(width / 2, height),
  };
};
