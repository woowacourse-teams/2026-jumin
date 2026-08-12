/** 600m 내 전체 주차장 목록 화면. */

import { useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';

import {
  Badge,
  BottomDock,
  BottomNav,
  colors,
  DraggableSheet,
  Header,
  Muted,
  PrimaryButton,
  Screen,
} from '../../components';
import {
  formatDistance,
  formatFee,
  operationLabel,
  recommendationLabel,
  sortParkingLots,
  type SortCategory,
} from '../../domain';
import { MapView } from '../../map';
import { navigate, openDetail } from '../../router';
import { CategoryTabs } from '../results';
import { CandidateName, SmallButton, toTarget } from '../shared';
import { useGlobalNav } from '../../app/useGlobalNav';
import { useOverlay, useSearchSession } from '../../contexts';

/** 펼친 상태에서 시트 상단이 화면 위에서 떨어진 거리. 지도가 충분히 보이게 잡는다. */
const MORE_SHEET_TOP = 200;
/** 접었을 때 남길 높이. 하단 도크(106px) 위로 정렬 탭과 첫 항목이 보이도록 한다. */
const MORE_SHEET_PEEK = 268;

/** 시트 안에서 실제로 스크롤되는 영역. 하단 도크에 가리지 않도록 여백을 둔다. */
export const MoreContent = styled.div`
  padding-bottom: 106px;
`;

export const ParkingList = styled.ul`
  margin: 0 12px;
  padding: 0 16px;
  list-style: none;
`;

export const ParkingRow = styled.li<{ selected: boolean }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid ${colors.line};
  background: ${({ selected }) => (selected ? colors.tint : '#fff')};
`;

export const ParkingRowButton = styled.button`
  width: 100%;
  min-height: 67px;
  padding: 11px 6px;
  border: 0;
  background: transparent;
  text-align: left;
`;

export const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const MoreScreen = () => {
  const { session, setSession } = useSearchSession();
  const { showDirections: onDirections } = useOverlay();
  const { goHome, goNearby, goRecent } = useGlobalNav();
  const [collapseSignal, setCollapseSignal] = useState(0);
  const onDetail = (id: string) => openDetail(id, 'PARKING_LOTS');
  const response = session.response!;
  const sorted = useMemo(
    () => sortParkingLots(response.parkingLots, session.selectedCategory),
    [response.parkingLots, session.selectedCategory],
  );
  const recommended = useMemo(
    () => new Map(response.recommendedParkingLots.map((item) => [item.parkingLotId, item.recommendationType])),
    [response],
  );
  const selected = sorted.find(({ parkingLotId }) => parkingLotId === session.selectedParkingLotId) ?? sorted[0]!;

  useEffect(() => {
    if (selected.parkingLotId !== session.selectedParkingLotId)
      setSession((value) => ({ ...value, selectedParkingLotId: selected.parkingLotId }));
  }, [selected.parkingLotId, session.selectedParkingLotId, setSession]);

  const changeCategory = (category: SortCategory) => {
    const first = sortParkingLots(response.parkingLots, category)[0];
    setSession((value) => ({
      ...value,
      selectedCategory: category,
      selectedParkingLotId: first?.parkingLotId ?? null,
    }));
  };

  return (
    <Screen css={{ position: 'relative', paddingBottom: 0, overflow: 'hidden' }}>
      <Header title={session.destination!.name} onBack={() => navigate('/results')} />
      <MapView
        center={session.destination!.location}
        destination={session.destination!.location}
        parkingLots={sorted}
        recommendedIds={response.recommendedParkingLots.map(({ parkingLotId }) => parkingLotId)}
        selectedId={selected.parkingLotId}
        radius
        height="calc(100dvh - var(--header-height))"
        onSelect={(parkingLotId) => setSession((value) => ({ ...value, selectedParkingLotId: parkingLotId }))}
        onMapTap={() => setCollapseSignal((token) => token + 1)}
      />
      <DraggableSheet
        expandedTop={MORE_SHEET_TOP}
        peek={MORE_SHEET_PEEK}
        collapseSignal={collapseSignal}
        label="주차장 목록"
      >
        <MoreContent>
          <CategoryTabs category={session.selectedCategory} onChange={changeCategory} />
          <ParkingList>
            {sorted.map((lot) => (
              <ParkingRow key={lot.parkingLotId} selected={lot.parkingLotId === selected.parkingLotId}>
                <ParkingRowButton
                  type="button"
                  onClick={() => setSession((value) => ({ ...value, selectedParkingLotId: lot.parkingLotId }))}
                >
                  <span>
                    {recommended.has(lot.parkingLotId) && (
                      <Badge>{recommendationLabel(recommended.get(lot.parkingLotId)!)}</Badge>
                    )}
                    <CandidateName>{lot.name}</CandidateName>
                    <Muted>
                      {formatFee(lot.estimatedFee, lot.feeCalculationStatus)} · {formatDistance(lot.distanceMeters)} ·{' '}
                      {operationLabel(lot.operation.status)}
                    </Muted>
                  </span>
                </ParkingRowButton>
                <RowActions>
                  <SmallButton type="button" onClick={() => onDetail(lot.parkingLotId)}>
                    상세보기
                  </SmallButton>
                </RowActions>
              </ParkingRow>
            ))}
          </ParkingList>
        </MoreContent>
      </DraggableSheet>
      <BottomDock>
        <PrimaryButton type="button" onClick={() => onDirections(toTarget(selected))}>
          길찾기 시작
        </PrimaryButton>
      </BottomDock>
      <BottomNav active="HOME" onNearby={goNearby} onHome={goHome} onRecent={goRecent} />
    </Screen>
  );
};
