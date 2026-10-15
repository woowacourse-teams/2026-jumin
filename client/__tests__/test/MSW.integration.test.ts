import { http, HttpResponse } from 'msw';

import { getParkingLotsInViewport } from '../../api/parkingLots';
import { parkingLotViewportResponseSchema } from '../../api/parkingLotsSchema';
import type { DestinationSearchResponse } from '../../api/contracts';
import {
  parkingViewportFilterMetadata,
  parkingViewportLots,
} from '../../mocks/fixtures/parkingViewport';
import { searchCondition } from '../testData';
import { server } from '../msw/server';

describe('통합 테스트 API Mock 환경', () => {
  it('상대 경로 API 요청을 기존 MSW 핸들러로 처리할 수 있다', async () => {
    const response = await fetch('/api/destinations/search?query=강남역');
    const data = (await response.json()) as DestinationSearchResponse;

    expect(response.ok).toBe(true);
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

  it('뷰포트 필터를 쿼리 파라미터로 받아 결과를 교집합으로 줄인다', async () => {
    const bounds = new URLSearchParams({
      southLatitude: '37',
      westLongitude: '126',
      northLatitude: '38',
      eastLongitude: '128',
      freeOnly: 'true',
      excludeMechanical: 'true',
    });

    const response = await fetch(`/api/parking/viewport?${bounds}`);
    const data = parkingLotViewportResponseSchema.parse(await response.json());

    expect(response.ok).toBe(true);
    expect(data.totalCount).toBe(data.parkingLots.length);
    expect(data.parkingLots.length).toBeLessThan(parkingViewportLots.length);
    expect(
      data.parkingLots.every(({ id }) => {
        const metadata = parkingViewportFilterMetadata[id];
        return metadata?.isFreeToday && !metadata.isMechanical;
      }),
    ).toBe(true);
  });

  it('뷰포트 조회 함수가 활성화된 필터만 쿼리로 전달한다', async () => {
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
        freeOnly: true,
        excludeMechanical: true,
      },
      undefined,
    );

    const actualUrl = request.url;
    if (actualUrl === null) throw new Error('뷰포트 요청 URL이 기록되지 않았습니다.');

    expect(actualUrl.searchParams.get('freeOnly')).toBe('true');
    expect(actualUrl.searchParams.get('excludeMechanical')).toBe('true');
  });
});
