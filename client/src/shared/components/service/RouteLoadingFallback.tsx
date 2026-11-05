import { css } from '@emotion/css';
import { useEffect, useState } from 'react';

import { Spinner } from '../ui/Spinner';

const SHOW_DELAY_MS = 500;

export const RouteLoadingFallback = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={overlayStyle}>
      {isVisible && (
        <div role="status" aria-label="페이지를 불러오는 중">
          <Spinner />
        </div>
      )}
    </div>
  );
};

// 지도는 가리지 않고, 페이지 코드 대기 중 지도 클릭·드래그만 막는다.
const overlayStyle = css`
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
`;
