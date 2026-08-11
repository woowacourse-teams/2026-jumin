/** 최근 이용 화면. */

import styled from '@emotion/styled';

import { BottomNav, colors, Header, Muted, Screen } from '../../components';
import { formatRecentAt, type RecentUse } from '../../domain';
import { CandidateAddress, CandidateName, CenterState } from '../shared';

export const RecentList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const RecentButton = styled.button`
  width: 100%;
  min-height: 86px;
  padding: 14px 20px;
  border: 0;
  border-bottom: 1px solid ${colors.line};
  background: #fff;
  text-align: left;
`;

export const RecentScreen = ({
  items,
  onSelect,
  onNearby,
  onHome,
  onRecent,
}: {
  items: RecentUse[];
  onSelect: (id: string) => void;
  onNearby: () => void;
  onHome: () => void;
  onRecent: () => void;
}) => (
  <Screen bottomNav>
    <Header title="최근 이용" onBack={onHome} />
    {items.length ? (
      <RecentList>
        {items.map((item) => (
          <li key={item.parkingLotId}>
            <RecentButton type="button" onClick={() => onSelect(item.parkingLotId)}>
              <CandidateName>{item.name}</CandidateName>
              <CandidateAddress>{item.address}</CandidateAddress>
              <Muted css={{ marginTop: 5 }}>마지막 이용 {formatRecentAt(item.usedAt)}</Muted>
            </RecentButton>
          </li>
        ))}
      </RecentList>
    ) : (
      <CenterState>최근 이용한 주차장이 없어요.</CenterState>
    )}
    <BottomNav active="RECENT" onNearby={onNearby} onHome={onHome} onRecent={onRecent} />
  </Screen>
);
