import { css } from '@emotion/css';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { BottomNav } from '../../../shared/components/BottomNav';
import { DeepLinkModal } from '../../../shared/components/Modal/DeepLinkModal';
import { RecentHistoryRow } from '../../../shared/components/RecentHistoryRow';
import {
  loadRecentParkingUses,
  type RecentParkingLot,
  saveRecentParkingUse,
} from '../../../shared/utils/recentParkingUses';

const formatMonthDay = (usedAt: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  }).format(new Date(usedAt));

export const RecentUsePage = () => {
  const navigate = useNavigate();
  const [recentParkingUses, setRecentParkingUses] = useState(loadRecentParkingUses);
  const [selectedParkingLot, setSelectedParkingLot] = useState<RecentParkingLot | null>(null);

  const handleDirectionsStart = () => {
    if (!selectedParkingLot) return;

    saveRecentParkingUse(selectedParkingLot);
    setRecentParkingUses(loadRecentParkingUses());
  };

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <button
          className={backButtonStyle}
          type="button"
          aria-label="이전 화면으로 이동"
          onClick={() => navigate(-1)}
        >
          ‹
        </button>
        <h1 className={titleStyle}>최근 이용</h1>
      </header>

      <section className={listSectionStyle} aria-label="최근 이용한 주차장">
        {recentParkingUses.length === 0 ? (
          <p className={emptyMessageStyle}>길찾기를 시작한 주차장이 아직 없어요.</p>
        ) : (
          <ul className={listStyle}>
            {recentParkingUses.map(({ parkingLot, usedAt }) => (
              <RecentHistoryRow
                key={parkingLot.id}
                title={parkingLot.name}
                address={parkingLot.address}
                metadata={`마지막 이용 ${formatMonthDay(usedAt)}`}
                onSelect={() => setSelectedParkingLot(parkingLot)}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className={footerStyle}>
        <BottomNav />
      </footer>

      {selectedParkingLot && (
        <DeepLinkModal
          isOpen
          onRequestClose={() => setSelectedParkingLot(null)}
          onDirectionsStart={handleDirectionsStart}
          destination={{ name: selectedParkingLot.name, location: selectedParkingLot.location }}
        />
      )}
    </main>
  );
};

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

const pageStyle = css`
  position: relative;

  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  overflow: hidden;

  color: #18233d;

  background: #fff;
`;

const headerStyle = css`
  display: flex;
  align-items: center;
  text-align: center;

  min-height: calc(104px + env(safe-area-inset-top, 0px));
  padding: calc(28px + env(safe-area-inset-top, 0px)) 20px 8px;
  flex-shrink: 0;
`;

const backButtonStyle = css`
  display: grid;
  place-items: center;

  width: 44px;
  height: 44px;
  padding: 0;
  margin-bottom: 10px;

  color: #43506a;
  font-size: 36px;
  line-height: 1;

  background: transparent;
  border: 0;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
`;

const titleStyle = css`
  margin: 0 0 0 6px;

  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.4px;
`;

const listSectionStyle = css`
  min-height: 0;
  padding-bottom: calc(86px + env(safe-area-inset-bottom, 0px));
  flex: 1;
  overflow-y: auto;
`;

const listStyle = css`
  margin: 0;
  padding: 0;

  list-style: none;
`;

const emptyMessageStyle = css`
  margin: 72px 20px 0;

  color: #98a2b3;
  font-size: 14px;
  text-align: center;
`;

const footerStyle = css`
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;

  height: calc(86px + env(safe-area-inset-bottom, 0px));
`;
