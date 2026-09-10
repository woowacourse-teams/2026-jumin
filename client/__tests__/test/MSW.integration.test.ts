import type { DestinationSearchResponse } from '../../api/contracts';
import { searchCondition } from '../testData';

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
});
