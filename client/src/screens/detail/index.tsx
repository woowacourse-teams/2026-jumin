/** 주차장 상세 화면. */

import { useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';

import { api, ApiClientError } from '../../api';
import { picoError, retry as retryIcon } from '../../assets';
import {
  Badge,
  BottomDock,
  colors,
  Header,
  LoadingBlock,
  Muted,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from '../../components';
import {
  formatCheckedAt,
  formatDistance,
  formatDuration,
  formatFee,
  operationLabel,
  recommendationLabel,
  type ParkingLotDetailResponse,
  type ParkingTarget,
  type RecentUse,
  type SearchSession,
} from '../../domain';
import { MapView } from '../../map';
import { AssetIcon, CenterState, ErrorPico, Title, apiMessage, toTarget } from '../shared';

export const SectionTitle = styled.h2`
  margin: 0 0 14px;
  font-size: 16px;
  line-height: 24px;
`;

export const DetailBody = styled.div`
  position: relative;
  z-index: 1;
  min-height: calc(100dvh - 205px - var(--safe-top));
  margin-top: -16px;
  padding: 40px 20px 126px;
  border-radius: 24px 24px 0 0;
  background: #fff;
`;

export const FeeBox = styled.dl`
  margin: 12px 0 24px;
  overflow: hidden;
  border: 1px solid ${colors.line};
  border-radius: 16px;

  div {
    display: flex;
    min-height: 45px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid ${colors.line};
  }
  div:last-child {
    border-bottom: 0;
    background: ${colors.tint};
    color: ${colors.primary};
    font-weight: 800;
  }
  dt,
  dd {
    margin: 0;
  }
`;

export const DetailRows = styled.dl`
  margin: 24px 0;

  div {
    display: flex;
    min-height: 38px;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  dt {
    color: ${colors.muted};
  }
  dd {
    margin: 0;
    text-align: right;
  }
`;

export const DetailScreen = ({
  parkingLotId,
  session,
  recent,
  onBack,
  onDirections,
}: {
  parkingLotId: string;
  session: SearchSession;
  recent: RecentUse[];
  onBack: () => void;
  onDirections: (target: ParkingTarget) => void;
}) => {
  const inSearch = Boolean(
    session.response?.parkingLots.some((lot) => lot.parkingLotId === parkingLotId) &&
    session.confirmedVisit &&
    session.destination,
  );
  const condition = useMemo(
    () =>
      inSearch
        ? {
            destinationLatitude: session.destination!.location.latitude,
            destinationLongitude: session.destination!.location.longitude,
            entryAt: session.confirmedVisit!.entryAt,
            exitAt: session.confirmedVisit!.exitAt,
          }
        : undefined,
    [inSearch, session.confirmedVisit, session.destination],
  );
  const summary = session.response?.parkingLots.find((lot) => lot.parkingLotId === parkingLotId);
  const recentItem = recent.find((item) => item.parkingLotId === parkingLotId);
  const [detail, setDetail] = useState<ParkingLotDetailResponse | null>(null);
  const [status, setStatus] = useState<'LOADING' | 'SUCCESS' | 'ERROR'>('LOADING');
  const [error, setError] = useState<unknown>(null);
  const [withoutCondition, setWithoutCondition] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void api
      .getParkingLot(parkingLotId, withoutCondition ? undefined : condition, controller.signal)
      .then((value) => {
        setDetail(value);
        setStatus('SUCCESS');
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught);
        setStatus('ERROR');
      });
    return () => controller.abort();
  }, [condition, parkingLotId, retry, withoutCondition]);

  const recommendation = session.response?.recommendedParkingLots.find(
    (item) => item.parkingLotId === parkingLotId,
  )?.recommendationType;
  const target = detail ? toTarget(detail) : summary ? toTarget(summary) : recentItem;

  if (status === 'LOADING')
    return (
      <Screen>
        <Header title={summary?.name ?? recentItem?.name ?? '주차장 상세'} onBack={onBack} />
        {summary && (
          <MapView center={summary.location} parkingLots={[summary]} selectedId={summary.parkingLotId} height="165px" />
        )}
        <LoadingBlock>주차장 정보를 불러오고 있어요…</LoadingBlock>
      </Screen>
    );

  if (status === 'ERROR') {
    const notFound = error instanceof ApiClientError && error.kind === 'NOT_FOUND';
    const invalidCondition = error instanceof ApiClientError && error.code === 'INVALID_SEARCH_CONDITION';
    return (
      <Screen>
        <Header title={summary?.name ?? recentItem?.name ?? '주차장 상세'} onBack={onBack} />
        <CenterState css={{ minHeight: 'calc(100dvh - var(--header-height))' }}>
          <div>
            <ErrorPico src={picoError} alt="" />
            <Title>{notFound ? '주차장 정보를 찾을 수 없어요.' : '다시 시도해주세요'}</Title>
            <Muted css={{ margin: '10px 0 22px' }}>
              {notFound ? '이전 화면에서 다른 주차장을 선택해주세요.' : apiMessage(error)}
            </Muted>
            {!notFound && (
              <PrimaryButton
                type="button"
                onClick={() => {
                  setStatus('LOADING');
                  if (invalidCondition) setWithoutCondition(true);
                  else setRetry((value) => value + 1);
                }}
              >
                <span css={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {!invalidCondition && <AssetIcon src={retryIcon} alt="" />}
                  {invalidCondition ? '검색 조건 없이 다시 조회' : '다시 시도'}
                </span>
              </PrimaryButton>
            )}
            {target && !notFound && (
              <SecondaryButton
                type="button"
                css={{ width: '100%', marginTop: 10 }}
                onClick={() => onDirections(toTarget(target))}
              >
                저장된 위치로 길찾기
              </SecondaryButton>
            )}
          </div>
        </CenterState>
      </Screen>
    );
  }

  const value = detail!;
  return (
    <Screen>
      <Header title={value.name} onBack={onBack} />
      <MapView
        center={value.location}
        parkingLots={[
          {
            ...(summary ?? {
              parkingLotId: value.parkingLotId,
              name: value.name,
              address: value.address,
              location: value.location,
              distanceMeters: 0,
              estimatedFee: null,
              feeCalculationStatus: 'UNAVAILABLE' as const,
              operation: { status: 'UNKNOWN' as const },
              sortRanks: { distance: 1, price: null, balanced: null },
            }),
          },
        ]}
        selectedId={value.parkingLotId}
        height="165px"
      />
      <DetailBody>
        {recommendation && <Badge>{recommendationLabel(recommendation)}</Badge>}
        <Title css={{ marginTop: recommendation ? 10 : 0 }}>{value.name}</Title>
        <Muted>{value.address}</Muted>
        {value.feeRule && (
          <>
            <SectionTitle css={{ marginTop: 24 }}>요금 정보</SectionTitle>
            <FeeBox>
              <div>
                <dt>기본 {value.feeRule.baseMinutes}분</dt>
                <dd>{formatFee(value.feeRule.baseFee, 'CALCULATED')}</dd>
              </div>
              {value.feeRule.additionalMinutes !== null && value.feeRule.additionalFee !== null && (
                <div>
                  <dt>추가 {value.feeRule.additionalMinutes}분당</dt>
                  <dd>{formatFee(value.feeRule.additionalFee, 'CALCULATED')}</dd>
                </div>
              )}
              {value.feeRule.dailyMaxFee !== null && (
                <div>
                  <dt>일 최대요금</dt>
                  <dd>{formatFee(value.feeRule.dailyMaxFee, 'CALCULATED')}</dd>
                </div>
              )}
              {value.feeCalculationStatus !== 'NOT_REQUESTED' && (
                <div>
                  <dt>
                    {session.confirmedVisit
                      ? `${formatDuration(session.confirmedVisit.durationMinutes)} 총액`
                      : '예상 총액'}
                  </dt>
                  <dd>{formatFee(value.estimatedFee, value.feeCalculationStatus)}</dd>
                </div>
              )}
            </FeeBox>
          </>
        )}
        <DetailRows>
          {value.distanceMeters !== null && (
            <div>
              <dt>거리</dt>
              <dd>직선거리 {formatDistance(value.distanceMeters)}</dd>
            </div>
          )}
          <div>
            <dt>운영 상태</dt>
            <dd>{operationLabel(value.operation.status)}</dd>
          </div>
          <div>
            <dt>운영시간</dt>
            <dd>{value.operation.businessHours ?? '운영시간 확인 필요'}</dd>
          </div>
        </DetailRows>
        <Muted>
          {value.source.url ? (
            <a href={value.source.url} target="_blank" rel="noreferrer">
              {value.source.name}
            </a>
          ) : (
            value.source.name
          )}{' '}
          · {formatCheckedAt(value.source.lastCheckedAt)}
        </Muted>
      </DetailBody>
      <BottomDock>
        <PrimaryButton type="button" onClick={() => onDirections(toTarget(value))}>
          길찾기 시작
        </PrimaryButton>
      </BottomDock>
    </Screen>
  );
};
