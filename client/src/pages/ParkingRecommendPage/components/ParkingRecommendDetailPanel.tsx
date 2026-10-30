import { useQueries } from '@tanstack/react-query';
import { css } from '@emotion/css';
import { API_ERROR_MESSAGES } from '../../../../api/apiErrorMessages';
import { parkingDetailQueryOptions } from '../../../../api/queries/parkingDetailQuery';
import { viewportParkingLotDetailQueryOptions } from '../../../../api/queries/viewportParkingLotDetailQuery';
import { ErrorCard } from '../../../../shared/components/service/ErrorCard';
import type { ParkingSearchCondition } from '../../../../shared/types/navigation';
import { ParkingDetailSkeleton } from '../LoadingUI/ParkingDetailSkeleton';
import { ParkingRecommendDetailContent } from './ParkingRecommendDetailContent';

interface Props {
  parkingLotId: number;
  searchCondition: ParkingSearchCondition;
}

/** 상세 모드에서만 마운트한다. 상세/좋아요 API의 로딩과 오류를 시트 내부에 한정한다. */
export const ParkingRecommendDetailPanel = ({ parkingLotId, searchCondition }: Props) => {
  const [detailQuery, likeQuery] = useQueries({
    queries: [
      parkingDetailQueryOptions({ parkingLotId, condition: searchCondition }),
      viewportParkingLotDetailQueryOptions(parkingLotId),
    ],
  });

  if (detailQuery.isError || likeQuery.isError) {
    return (
      <ErrorCard
        className={errorStyle}
        label={API_ERROR_MESSAGES.PARKING_DETAIL}
        onRetry={() => {
          if (detailQuery.isError) void detailQuery.refetch();
          if (likeQuery.isError) void likeQuery.refetch();
        }}
      />
    );
  }

  if (detailQuery.isPending || likeQuery.isPending) return <ParkingDetailSkeleton />;

  return (
    <ParkingRecommendDetailContent
      searchCondition={searchCondition}
      parkingLotDetail={detailQuery.data}
      parkingLike={likeQuery.data}
    />
  );
};

const errorStyle = css`
  position: relative;
  inset: auto;
  max-height: 100%;
  overflow-y: auto;
`;
