/** 추천 결과 화면. 정렬 세그먼트와 상위 카드 carousel. */

import { useCallback, useMemo, useRef } from 'react';
import styled from '@emotion/styled';

import { picoError, search } from '../../assets';
import { BottomNav, colors, Header, Muted, PrimaryButton, Screen } from '../../components';
import {
  EMPTY_SESSION,
  formatDistance,
  formatDuration,
  formatFee,
  formatVisit,
  isSortableBy,
  sortParkingLots,
  type SortCategory,
} from '../../domain';
import { MapView } from '../../map';
import { navigate, openDetail } from '../../router';
import { AssetIcon, CandidateName, CenterState, ErrorPico, SmallButton, Title } from '../shared';
import { useGlobalNav } from '../../app/useGlobalNav';
import { useSearchSession } from '../../contexts';

export const TOP_CARD_COUNT = 3;

export const Tabs = styled.div<{ flush?: boolean }>`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: ${({ flush }) => (flush ? '0' : '10px 16px 6px')};
  background: ${({ flush }) => (flush ? 'transparent' : '#fff')};
`;

export const TabButton = styled.button<{ active: boolean }>`
  min-height: 37px;
  border: 0;
  border-radius: 10px;
  background: ${({ active }) => (active ? colors.primary : colors.tint)};
  color: ${({ active }) => (active ? '#fff' : colors.primary)};
  font-size: 13px;
  font-weight: 800;
`;

export const ResultTop = styled.div`
  position: absolute;
  z-index: 4;
  top: calc(10px + var(--safe-top));
  right: 17px;
  left: 17px;
  display: grid;
  gap: 10px;
  padding: 8px 12px 10px;
  border-radius: var(--radius-card);
  background: #fff;
  box-shadow: 0 6px 9px rgba(20, 33, 61, 0.1);

  @media (min-width: 768px) {
    right: auto;
    left: calc(var(--rail-width) + 16px);
    width: calc(var(--panel-width) - 32px);
  }
`;

export const ResultTopSummary = styled.div`
  display: grid;
  min-height: 49px;
  grid-template-columns: 34px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
`;

export const ResultTopButton = styled.button`
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  background: transparent;
  color: ${colors.text};
  font-size: 28px;
`;

export const ResultsPanel = styled.div`
  position: absolute;
  z-index: 4;
  right: 0;
  bottom: var(--nav-height);
  left: 0;

  /* 패널 안에서는 카드가 가로 캐러셀이 아니라 세로 목록이 된다. */
  @media (min-width: 768px) {
    top: calc(var(--safe-top) + 150px);
    right: auto;
    left: var(--rail-width);
    width: var(--panel-width);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
`;

export const Carousel = styled.div`
  display: flex;
  gap: 12px;
  padding: 6px 16px 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (min-width: 768px) {
    flex-direction: column;
    overflow-x: visible;
    scroll-snap-type: none;
    padding-bottom: 16px;
  }
`;

export const ResultCard = styled.article<{ selected: boolean }>`
  min-width: 211px;
  min-height: 124px;

  @media (min-width: 768px) {
    min-width: 0;
    min-height: 0;
    width: 100%;
  }

  padding: 14px 16px;
  scroll-snap-align: center;
  border: 2px solid ${({ selected }) => (selected ? colors.primary : '#fff')};
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(31, 42, 82, 0.18);
`;

export const EmptySortNotice = styled.p`
  margin: 0;
  padding: 28px 4px;
  color: ${colors.muted};
  font-size: 14px;
`;

export const CardName = styled.h3`
  margin: 0 0 4px;
  font-size: 17px;
  line-height: 24px;
`;

export const Price = styled.strong`
  display: block;
  margin: 6px 0;
  color: ${colors.primary};
  font-size: 24px;
  line-height: 31px;
`;

export const MoreCard = styled.button`
  min-width: 94px;
  min-height: 144px;
  scroll-snap-align: center;
  border: 0;
  border-radius: 16px;
  background: ${colors.primary};
  color: #fff;
  font-size: 28px;
  font-weight: 900;
  box-shadow: 0 8px 26px rgba(31, 42, 82, 0.2);

  /* 세로 목록에서는 카드가 아니라 목록 끝의 버튼처럼 보이게 한다. */
  @media (min-width: 768px) {
    min-width: 0;
    min-height: 52px;
    width: 100%;
    font-size: 22px;
  }
`;

export const CategoryTabs = ({
  category,
  onChange,
  flush,
}: {
  category: SortCategory;
  onChange: (category: SortCategory) => void;
  flush?: boolean;
}) => (
  <Tabs aria-label="주차장 정렬" flush={flush}>
    {(
      [
        ['DISTANCE', '거리순'],
        ['PRICE', '가격순'],
        ['BALANCED', '균형순'],
      ] as const
    ).map(([value, label]) => (
      <TabButton
        key={value}
        type="button"
        active={category === value}
        aria-pressed={category === value}
        onClick={() => onChange(value)}
      >
        {label}
      </TabButton>
    ))}
  </Tabs>
);

export const ResultsScreen = () => {
  const { session, setSession } = useSearchSession();
  const { goHome: onHome, goNearby: onNearby, goRecent: onRecent } = useGlobalNav();
  const onDetail = (id: string) => openDetail(id, 'RESULTS');
  const onMore = () => navigate('/parking-lots');
  const response = session.response!;
  const carouselRef = useRef<HTMLDivElement>(null);
  // 카드는 선택한 정렬 기준의 1~3위다. 추천 유형별 대표가 아니라 해당 정렬의 상위 N개를 노출한다.
  // rank가 null인 주차장(요금 계산 불가·운영 불가)은 그 기준의 순위가 없으므로 채워 넣지 않는다.
  const topLots = useMemo(
    () =>
      sortParkingLots(
        response.parkingLots.filter((lot) => isSortableBy(lot, session.selectedCategory)),
        session.selectedCategory,
      ).slice(0, TOP_CARD_COUNT),
    [response.parkingLots, session.selectedCategory],
  );
  const topIds = useMemo(() => topLots.map(({ parkingLotId }) => parkingLotId), [topLots]);

  const select = useCallback(
    (parkingLotId: string) => {
      setSession((value) => ({ ...value, selectedParkingLotId: parkingLotId }));
      carouselRef.current
        ?.querySelector<HTMLElement>(`[data-parking-id="${CSS.escape(parkingLotId)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    },
    [setSession],
  );

  const changeCategory = (category: SortCategory) => {
    const [first] = sortParkingLots(
      response.parkingLots.filter((lot) => isSortableBy(lot, category)),
      category,
    );
    setSession((value) => ({
      ...value,
      selectedCategory: category,
      selectedParkingLotId: first?.parkingLotId ?? null,
    }));
  };

  // 추천 0건이어도 반경 안에 주차장이 있으면 정렬해서 보여준다.
  // (계약: 추천 후보가 부족하면 해당 유형을 생략하며 recommendedParkingLots는 빈 배열이 될 수 있다)
  if (!response.parkingLots.length)
    return (
      <Screen>
        <Header title="추천 결과" onBack={() => navigate('/visit')} />
        <CenterState css={{ minHeight: 'calc(100dvh - var(--header-height))' }}>
          <div>
            <ErrorPico src={picoError} alt="" />
            <Title>주차장을 찾지 못했어요</Title>
            <Muted css={{ margin: '12px 0 24px' }}>검색 반경(600m) 안에서 이용 가능한 주차장을 찾지 못했어요.</Muted>
            <PrimaryButton
              type="button"
              onClick={() => {
                setSession(EMPTY_SESSION);
                navigate('/search');
              }}
            >
              목적지 다시 검색
            </PrimaryButton>
          </div>
        </CenterState>
      </Screen>
    );

  return (
    <Screen bottomNav css={{ position: 'relative', paddingBottom: 0 }}>
      <MapView
        center={session.destination!.location}
        destination={session.destination!.location}
        parkingLots={topLots}
        recommendedIds={topIds}
        selectedId={session.selectedParkingLotId}
        radius
        height="100dvh"
        onSelect={select}
      />
      <ResultTop>
        <ResultTopSummary>
          <ResultTopButton type="button" aria-label="방문 시간으로 돌아가기" onClick={() => navigate('/visit')}>
            ‹
          </ResultTopButton>
          <span css={{ minWidth: 0 }}>
            <CandidateName>{session.destination!.name}</CandidateName>
            <Muted>{formatVisit(session.confirmedVisit!)}</Muted>
          </span>
          <AssetIcon src={search} alt="" />
        </ResultTopSummary>
        <CategoryTabs flush category={session.selectedCategory} onChange={changeCategory} />
      </ResultTop>
      <ResultsPanel>
        <Carousel
          ref={carouselRef}
          onScroll={(event) => {
            const viewportCenter = event.currentTarget.scrollLeft + event.currentTarget.clientWidth / 2;
            const cards = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-parking-id]'));
            const nearest = cards.reduce<{ id: string; distance: number } | null>((best, card) => {
              const id = card.dataset.parkingId;
              if (!id) return best;
              const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - viewportCenter);
              return !best || distance < best.distance ? { id, distance } : best;
            }, null);
            if (nearest && nearest.id !== session.selectedParkingLotId)
              setSession((value) => ({ ...value, selectedParkingLotId: nearest.id }));
          }}
        >
          {!topLots.length && <EmptySortNotice>이 기준으로 정렬할 수 있는 주차장이 없어요.</EmptySortNotice>}
          {topLots.map((lot) => (
            <ResultCard
              key={lot.parkingLotId}
              data-parking-id={lot.parkingLotId}
              selected={session.selectedParkingLotId === lot.parkingLotId}
              onClick={() => select(lot.parkingLotId)}
            >
              <CardName>{lot.name}</CardName>
              <Price>{formatFee(lot.estimatedFee, lot.feeCalculationStatus)}</Price>
              <Muted>
                {formatDuration(response.searchCondition.durationMinutes)} · {formatDistance(lot.distanceMeters)}
              </Muted>
              <SmallButton
                type="button"
                css={{ marginTop: 12 }}
                onClick={(event) => {
                  event.stopPropagation();
                  onDetail(lot.parkingLotId);
                }}
              >
                상세보기
              </SmallButton>
            </ResultCard>
          ))}
          <MoreCard type="button" aria-label="600미터 내 주차장 더 보기" onClick={onMore}>
            +
          </MoreCard>
        </Carousel>
      </ResultsPanel>
      <BottomNav active="HOME" onNearby={onNearby} onHome={onHome} onRecent={onRecent} />
    </Screen>
  );
};
