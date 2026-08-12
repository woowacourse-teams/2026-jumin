/** 지도 영역 스타일. 네이티브에서는 웹뷰를 투명하게 두고 네이티브 지도를 뒤에 깐다. */

import styled from '@emotion/styled';

export const MapFrame = styled.div<{ height: string; native: boolean }>`
  position: relative;
  width: 100%;
  height: ${({ height }) => height};
  overflow: hidden;
  ${({ native }) =>
    native
      ? 'background: transparent;'
      : `background-color: #eef1f8;
         background-image:
           linear-gradient(36deg, transparent 45%, rgba(255, 255, 255, 0.9) 46% 52%, transparent 53%),
           linear-gradient(110deg, transparent 44%, rgba(203, 210, 225, 0.65) 45% 49%, transparent 50%);`}
`;

export const Canvas = styled.div`
  width: 100%;
  height: 100%;

  img[src='http://static.naver.net/maps/mantle/2x/new-naver-logo-normal.png'],
  img[src='https://static.naver.net/maps/mantle/2x/new-naver-logo-normal.png'] {
    display: none !important;
  }
`;

export const ErrorBanner = styled.div`
  position: absolute;
  inset: 50% 16px auto;
  z-index: 2;
  transform: translateY(-50%);
  padding: 10px 12px;
  border: 1px solid #d8dce8;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  color: #4f566b;
  font-size: 13px;
  text-align: center;
`;
