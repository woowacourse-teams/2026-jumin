import { http, HttpResponse } from 'msw';

import { getParkingLotsInViewport, searchDestinations } from '../../api/parkingLots';
import { parkingViewportQueryOptions } from '../../api/queries/parkingViewportQuery';
import { parkingLotViewportResponseSchema } from '../../api/parkingLotsSchema';
import {
  parkingViewportFilterMetadata,
  parkingViewportLots,
} from '../../mocks/fixtures/parkingViewport';
import { searchCondition } from '../testData';
import { server } from '../msw/server';
import { createTestQueryClient } from '../renderWithProviders';

const viewportBounds = {
  southLatitude: 37,
  westLongitude: 126,
  northLatitude: 38,
  eastLongitude: 128,
};

const viewportFilterCases = [
  [false, false, false],
  [true, false, false],
  [false, true, false],
  [true, true, false],
  [false, false, true],
  [true, false, true],
  [false, true, true],
  [true, true, true],
] as const;

describe('통합 테스트 API Mock 환경', () => {
  it('목적지 검색 함수의 요청을 기존 MSW 핸들러로 처리할 수 있다', async () => {
    const data = await searchDestinations('강남역', 37.5, 127);

    expect(data.destinations).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '강남역 11번 출구' })]),
    );
  });

  it('주차장 추천과 상세 API 요청을 기존 MSW 핸들러로 처리할 수 있다', async () => {
    const searchParams = new URLSearchParams({
      destinationLatitude: String(searchCondition.destinationLatitude),
      destinationLongitude: String(searchCondition.destinationLongitude),
      entryAt: searchCondition.entryAt,
      exitAt: searchCondition.exitAt,
    });

    const recommendationResponse = await fetch(`/api/parking/search?${searchParams}`);
    const detailResponse = await fetch(`/api/parking/101?${searchParams}`);

    expect(recommendationResponse.ok).toBe(true);
    expect(detailResponse.ok).toBe(true);
  });

  it.each(viewportFilterCases)(
    '무료=%s, 기계식 제외=%s, 공영=%s 필터를 AND로 적용한다',
    async (freeOnly, excludeMechanical, isPublic) => {
      const bounds = new URLSearchParams({
        southLatitude: '37',
        westLongitude: '126',
        northLatitude: '38',
        eastLongitude: '128',
        freeOnly: String(freeOnly),
        excludeMechanical: String(excludeMechanical),
        isPublic: String(isPublic),
      });

      const response = await fetch(`/api/parking/viewport?${bounds}`);
      const data = parkingLotViewportResponseSchema.parse(await response.json());

      expect(response.ok).toBe(true);
      expect(data.totalCount).toBe(data.parkingLots.length);
      const expectedParkingLots = parkingViewportLots.filter(({ id }) => {
        const metadata = parkingViewportFilterMetadata[id];
        return (
          (!freeOnly || metadata?.isFreeToday) &&
          (!excludeMechanical || !metadata?.isMechanical) &&
          (!isPublic || metadata?.isPublic === true)
        );
      });
      expect(data.parkingLots).toEqual(expectedParkingLots);
      expect(data.parkingLots.length).toBeGreaterThan(0);
    },
  );

  it.each(viewportFilterCases)(
    '뷰포트 조회 함수가 활성 필터만 전달한다 (무료=%s, 기계식 제외=%s, 공영=%s)',
    async (freeOnly, excludeMechanical, isPublic) => {
      const request = { url: null as URL | null };
      server.use(
        http.get('/api/parking/viewport', ({ request: requestEvent }) => {
          request.url = new URL(requestEvent.url);
          return HttpResponse.json({ totalCount: 0, parkingLots: [] });
        }),
      );

      await getParkingLotsInViewport(
        {
          southLatitude: 37,
          westLongitude: 126,
          northLatitude: 38,
          eastLongitude: 128,
          freeOnly,
          excludeMechanical,
          isPublic,
        },
        undefined,
      );

      const actualUrl = request.url;
      if (actualUrl === null) throw new Error('뷰포트 요청 URL이 기록되지 않았습니다.');

      expect(actualUrl.searchParams.get('freeOnly')).toBe(freeOnly ? 'true' : null);
      expect(actualUrl.searchParams.get('excludeMechanical')).toBe(
        excludeMechanical ? 'true' : null,
      );
      expect(actualUrl.searchParams.get('isPublic')).toBe(isPublic ? 'true' : null);
    },
  );

  it('필터를 생략하면 공영·민영·미확인 주차장을 모두 조회한다', async () => {
    await expect(getParkingLotsInViewport(viewportBounds)).resolves.toEqual({
      totalCount: parkingViewportLots.length,
      parkingLots: parkingViewportLots,
    });
  });

  it('같은 영역에서 공영 필터를 켰다가 꺼도 이전 필터의 캐시를 반환하지 않는다', async () => {
    const queryClient = createTestQueryClient();
    const filters = { freeOnly: false, excludeMechanical: false, isPublic: true };
    const publicParkingLots = parkingViewportLots.filter(
      ({ id }) => parkingViewportFilterMetadata[id]?.isPublic === true,
    );

    try {
      const publicResponse = await queryClient.fetchQuery(
        parkingViewportQueryOptions(viewportBounds, filters),
      );
      expect(publicResponse.parkingLots).toEqual(publicParkingLots);

      const allResponse = await queryClient.fetchQuery(
        parkingViewportQueryOptions(viewportBounds, { ...filters, isPublic: false }),
      );
      expect(allResponse.parkingLots).toEqual(parkingViewportLots);

      const publicResponseFromParams = await queryClient.fetchQuery(
        parkingViewportQueryOptions({ ...viewportBounds, isPublic: true }),
      );
      expect(publicResponseFromParams.parkingLots).toEqual(publicParkingLots);
    } finally {
      queryClient.clear();
    }
  });
});
