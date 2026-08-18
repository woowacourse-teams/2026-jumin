import { delay, http, HttpResponse } from 'msw';
import type { ApiErrorResponse, DestinationSearchResponse } from '../../api/contracts';
import { destinationFixtures } from '../fixtures/destinations';
import { getMockScenario } from '../scenario';

export const destinationHandlers = [
  http.get('/api/destinations/search', async ({ request }) => {
    const query = new URL(request.url).searchParams.get('query')?.trim() ?? '';
    const scenario = getMockScenario();

    if (query.length < 2) {
      return HttpResponse.json<ApiErrorResponse>(
        {
          code: 'INVALID_QUERY',
          message: '목적지 검색어는 2글자 이상이어야 합니다.',
          traceId: null,
        },
        { status: 400 },
      );
    }

    await delay(300);

    if (scenario === 'destination-rate-limited') {
      return HttpResponse.json<ApiErrorResponse>(
        {
          code: 'DESTINATION_SEARCH_RATE_LIMITED',
          message: '잠시 후 다시 검색해 주세요.',
          traceId: null,
        },
        { status: 429 },
      );
    }

    if (scenario === 'destination-failed') {
      return HttpResponse.json<ApiErrorResponse>(
        {
          code: 'NAVER_DESTINATION_SEARCH_FAILED',
          message: '목적지를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          traceId: null,
        },
        { status: 502 },
      );
    }

    const response: DestinationSearchResponse = {
      query,
      destinations: scenario === 'destination-empty' ? [] : destinationFixtures,
    };

    return HttpResponse.json(response);
  }),
];
