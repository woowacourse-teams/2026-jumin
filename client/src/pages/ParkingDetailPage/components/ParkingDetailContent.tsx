import { useSuspenseQueries } from '@tanstack/react-query';
import { parkingDetailQueryOptions } from '../../../../api/queries/parkingDetailQuery';
import { viewportParkingLotDetailQueryOptions } from '../../../../api/queries/viewportParkingLotDetailQuery';
import type { ParkingDetailCondition } from '../../../../shared/types/navigation';
import type { ParkingOperationPeriod } from '../../../../api/contracts';
import { css } from '@emotion/css';
import { DeepLinkModal } from '../../../../shared/components/service/directions/DeepLinkModal';
import BottomSheet, { BOTTOM_SHEET_HEIGHT } from '../../../../shared/components/ui/BottomSheet';
import { useCallback, useEffect, useState } from 'react';
import { saveRecentParkingUse } from '../../../../shared/utils/recentParkingUses';

import selectedParkingMarkerUrl from '../../../../assets/icons/markers/selectedRecommandMarker.svg';
import { DestinationMapOverlay } from '../../../../shared/components/service/destination/DestinationMapOverlay';
import { NaverMapMarker } from '../../../../shared/maps/NaverMapMarker';
import { useModal } from '../../../../shared/hooks/useModal';
import { ParkingDetailActions } from '../../../../shared/components/service/parking/ParkingDetailActions';
import { ParkingReportAction } from '../../../../shared/components/service/parking/ParkingReportAction';
import { useMapClick } from '../../../../shared/hooks/useMapClick';
import { trackEvent } from '../../../../shared/analytics';
import { eventName } from '../../../../shared/monitoring/constants';
import { RoadViewOverlay } from '../../../../shared/components/service/parking/RoadViewOverlay';
import { Row } from '../../../../shared/components/ui/Row';
import { Stack } from '../../../../shared/components/ui/Stack';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import type { BottomSheetSnap } from '../../../../shared/types/ui';

interface Props {
  map: naver.maps.Map | null;
  detailCondition: ParkingDetailCondition;
}

const parkingLotMarkerIcon = {
  url: selectedParkingMarkerUrl,
  width: 50,
  height: 60,
  anchorX: 25,
  anchorY: 60,
};

const formatFee = (fee: number | null) =>
  fee === null ? '미제공' : `${fee.toLocaleString('ko-KR')}원`;

const formatDuration = (entryAt: string, exitAt: string) => {
  const durationMinutes = Math.round(
    (new Date(exitAt).getTime() - new Date(entryAt).getTime()) / 60_000,
  );

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return '예상';

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;

  return `${hours}시간 ${minutes}분`;
};

const formatWeekdayHours = ({ status, openTime, closeTime }: ParkingOperationPeriod) => {
  if (status === 'CLOSED') return '평일 휴무';
  if (status === 'UNKNOWN' || openTime === null || closeTime === null) return '미제공';
  if (openTime === '00:00' && closeTime === '00:00') return '평일 24시간';

  return `평일 ${openTime} – ${closeTime}`;
};

export const ParkingDetailContent = ({ map, detailCondition }: Props) => {
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('expanded');
  const [isRoadViewOpen, setIsRoadViewOpen] = useState(false);

  const deepLinkModal = useModal();

  const [{ data: parkingLotDetail }, { data: parkingLike }] = useSuspenseQueries({
    queries: [
      parkingDetailQueryOptions({
        parkingLotId: detailCondition.parkingLotId,
        condition: {
          destinationLatitude: detailCondition.destinationLatitude,
          destinationLongitude: detailCondition.destinationLongitude,
          entryAt: detailCondition.entryAt,
          exitAt: detailCondition.exitAt,
        },
      }),
      viewportParkingLotDetailQueryOptions(detailCondition.parkingLotId),
    ],
  });

  const { feeRule, operation } = parkingLotDetail;
  const durationLabel = formatDuration(detailCondition.entryAt, detailCondition.exitAt);

  useEffect(() => {
    if (!map) return;

    const destinationPosition = new naver.maps.LatLng(
      detailCondition.destinationLatitude,
      detailCondition.destinationLongitude,
    );

    const parkingLotPosition = new naver.maps.LatLng(
      parkingLotDetail.location.latitude,
      parkingLotDetail.location.longitude,
    );

    map.fitBounds([destinationPosition, parkingLotPosition], {
      top: 112,
      right: 40,
      bottom: sheetSnap === 'expanded' ? BOTTOM_SHEET_HEIGHT + 24 : 124,
      left: 40,
      maxZoom: 15,
    });

    map.panBy(new naver.maps.Point(0, 100));
  }, [map, parkingLotDetail.location, detailCondition, sheetSnap]);

  const collapseBottomSheet = useCallback(() => {
    setSheetSnap('collapsed');
  }, []);

  useMapClick({
    map,
    enabled: sheetSnap === 'expanded',
    onMapClick: collapseBottomSheet,
  });

  const handleRecommendDirectionButtonClick = () => {
    trackEvent(eventName.RECOMMEND_DIRECTIONS_BUTTON);
    deepLinkModal.open();
  };

  const handleRoadViewButtonClick = () => {
    trackEvent(eventName.ROAD_VIEW_BUTTON, { surface: 'parking_detail' });
    setIsRoadViewOpen(true);
  };

  return (
    <div>
      <DestinationMapOverlay
        map={map}
        latitude={detailCondition.destinationLatitude}
        longitude={detailCondition.destinationLongitude}
        title={detailCondition.destinationName}
      />

      <NaverMapMarker
        map={map}
        latitude={parkingLotDetail.location.latitude}
        longitude={parkingLotDetail.location.longitude}
        icon={parkingLotMarkerIcon}
        title={parkingLotDetail.name}
        zIndex={30}
      />
      <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
        <Stack as="section" className={sheetContentStyle}>
          <ParkingDetailActions
            parkingLotId={parkingLotDetail.id}
            likeCount={parkingLike.likeCount}
            likedByMe={parkingLike.likedByMe}
            onDirections={handleRecommendDirectionButtonClick}
            onRoadView={handleRoadViewButtonClick}
          />
          <Stack className={scrollContentStyle}>
            <div className={feeCardStyle}>
              <Row align="center" justify="between" className={totalFeeStyle}>
                <span>{durationLabel} 예상 요금</span>
                <strong>{formatFee(parkingLotDetail.estimatedFee)}</strong>
              </Row>

              <Stack as="dl" gap={18} className={feeRuleListStyle}>
                {feeRule?.baseFreeMinutes !== null &&
                  feeRule?.baseFreeMinutes !== undefined &&
                  feeRule.baseFreeMinutes > 0 && (
                    <Row align="center" justify="between">
                      <dt>기본 무료 {feeRule.baseFreeMinutes}분</dt>
                      <dd>0원</dd>
                    </Row>
                  )}

                {feeRule && feeRule.baseMinutes !== null && feeRule.baseFee !== null && (
                  <Row align="center" justify="between">
                    <dt>기본 {feeRule.baseMinutes}분</dt>
                    <dd>{formatFee(feeRule.baseFee)}</dd>
                  </Row>
                )}

                {feeRule &&
                  feeRule.additionalMinutes !== null &&
                  feeRule.additionalFee !== null && (
                    <Row align="center" justify="between">
                      <dt>추가 {feeRule.additionalMinutes}분당</dt>
                      <dd>{formatFee(feeRule.additionalFee)}</dd>
                    </Row>
                  )}

                {!feeRule && (
                  <Row align="center" justify="between">
                    <dt>요금 규칙</dt>
                    <dd>미제공</dd>
                  </Row>
                )}
              </Stack>
            </div>

            <Stack as="dl" gap={12} className={detailsStyle}>
              <Row align="center" justify="between">
                <dt>도보 거리</dt>

                <dd>
                  {parkingLotDetail.walkingDurationMinutes === null ||
                  parkingLotDetail.distanceMeters === null
                    ? '도보 정보 없음'
                    : `${parkingLotDetail.distanceMeters.toLocaleString(
                        'ko-KR',
                      )}m(${parkingLotDetail.walkingDurationMinutes}분)`}
                </dd>
              </Row>

              <Row align="center" justify="between">
                <dt>운영시간</dt>

                <dd>{formatWeekdayHours(operation.weekday)}</dd>
              </Row>

              <Row align="center" justify="between">
                <dt>잔여석</dt>

                <dd>미제공</dd>
              </Row>
            </Stack>
            <ParkingReportAction parkingLotId={parkingLotDetail.id} />
          </Stack>
        </Stack>
      </BottomSheet>

      {isRoadViewOpen && (
        <RoadViewOverlay
          parkingLotName={parkingLotDetail.name}
          parkingLotAddress={parkingLotDetail.address}
          latitude={parkingLotDetail.location.latitude}
          longitude={parkingLotDetail.location.longitude}
          onRequestClose={() => setIsRoadViewOpen(false)}
        />
      )}

      {deepLinkModal.isOpen && (
        <DeepLinkModal
          onRequestClose={deepLinkModal.close}
          onDirectionsStart={() => {
            saveRecentParkingUse(parkingLotDetail);
          }}
          destination={{ name: parkingLotDetail.name, location: parkingLotDetail.location }}
        />
      )}
    </div>
  );
};

const sheetContentStyle = css`
  height: 100%;
  min-height: 0;
`;

const scrollContentStyle = css`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;

  > div,
  > dl {
    flex-shrink: 0;
  }
`;

const feeCardStyle = css`
  overflow: hidden;

  background: ${color.background.default};

  border: 1px solid ${color.border.default};

  border-radius: 18px;

  box-sizing: border-box;
`;

const feeRuleListStyle = css`
  margin: 0;
  padding: 20px 18px;

  dt,
  dd {
    margin: 0;

    ${typography.bodySmall};
  }

  dt {
    color: ${color.text.secondary};
  }

  dd {
    ${typography.bodySmallStrong};
    color: ${color.text.primary};
  }
`;

const totalFeeStyle = css`
  min-height: 64px;
  padding: 0 18px;

  ${typography.bodySmallStrong};
  color: ${color.text.primary};

  background: ${color.background.brandSubtle};

  strong {
    ${typography.titleCard};
    color: ${color.text.brand};
  }
`;

const detailsStyle = css`
  margin: 24px 0 0;
  dt,
  dd {
    margin: 0;
    ${typography.bodySmall};
  }
  dt {
    color: ${color.text.secondary};
  }
  dd {
    ${typography.bodySmallStrong};
    color: ${color.text.primary};
  }
`;
