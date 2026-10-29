import { http, HttpResponse } from 'msw';

import { searchDestinations } from '../../api/parkingLots';
import { destinationSearchQueryOptions } from '../../api/queries/destinationSearchQuery';
import { destinationFixtures } from '../../mocks/fixtures/destinations';
import { server } from '../msw/server';
import { createTestQueryClient } from '../renderWithProviders';

const searchCenter = { latitude: 37.5, longitude: 127 };
const destination = { ...destinationFixtures[0]!, roadAddress: null };

describe('목적지 검색 API', () => {
  it('검색어와 지도 중심 좌표를 GET으로 보내고 카카오 응답을 파싱한다', async () => {
    server.use(
      http.get('/api/destinations/search', ({ request }) => {
        expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
          query: '강남역 & 카페',
          latitude: '37.5',
          longitude: '127',
        });

        return HttpResponse.json({
          query: '강남역 & 카페',
          destinations: [{ ...destination, provider: 'KAKAO' }],
        });
      }),
    );

    const queryClient = createTestQueryClient();
    try {
      await expect(
        queryClient.fetchQuery(
          destinationSearchQueryOptions({ query: '  강남역 & 카페  ', ...searchCenter }),
        ),
      ).resolves.toEqual({ query: '강남역 & 카페', destinations: [destination] });
    } finally {
      queryClient.clear();
    }
  });

  it.each([
    { latitude: 35.1, longitude: searchCenter.longitude },
    { latitude: searchCenter.latitude, longitude: 129 },
  ])('검색어가 같아도 기준 위치가 달라지면 새 결과를 요청한다 (사례 %#)', async (nextCenter) => {
    let requestCount = 0;
    const nextDestination = destinationFixtures[2]!;
    server.use(
      http.get('/api/destinations/search', ({ request }) => {
        requestCount += 1;
        const params = new URL(request.url).searchParams;
        const isFirstCenter =
          params.get('latitude') === String(searchCenter.latitude) &&
          params.get('longitude') === String(searchCenter.longitude);

        return HttpResponse.json({
          query: '카페',
          destinations: [{ ...(isFirstCenter ? destination : nextDestination), provider: 'KAKAO' }],
        });
      }),
    );

    const queryClient = createTestQueryClient();
    const firstSearch = destinationSearchQueryOptions({ query: '카페', ...searchCenter });
    try {
      await expect(queryClient.fetchQuery(firstSearch)).resolves.toMatchObject({
        destinations: [destination],
      });
      await expect(
        queryClient.fetchQuery(destinationSearchQueryOptions({ query: '카페', ...nextCenter })),
      ).resolves.toMatchObject({ destinations: [nextDestination] });
      await expect(queryClient.fetchQuery(firstSearch)).resolves.toMatchObject({
        destinations: [destination],
      });
      expect(requestCount).toBe(2);
    } finally {
      queryClient.clear();
    }
  });

  it('검색 결과가 없으면 빈 배열을 반환한다', async () => {
    window.history.replaceState({}, '', '/?mock=destination-empty');

    await expect(searchDestinations('강남역', 37.5, 127)).resolves.toEqual({
      query: '강남역',
      destinations: [],
    });
  });

  it.each([
    ['destination-rate-limited', 429, '목적지 검색 요청이 너무 많습니다.'],
    ['destination-failed', 502, '일시적으로 목적지 검색을 이용할 수 없습니다.'],
  ] as const)('%s 응답의 HTTP 상태와 서버 메시지를 보존한다', async (scenario, status, message) => {
    window.history.replaceState({}, '', `/?mock=${scenario}`);

    await expect(searchDestinations('강남역', 37.5, 127)).rejects.toMatchObject({
      name: 'ApiError',
      failure: {
        errorType: 'http',
        status,
        serverMessage: message,
        serverCode: undefined,
        fieldErrors: [],
      },
      cause: undefined,
    });
  });

  it('trim 후 두 글자 미만인 검색어의 서버 오류를 파싱한다', async () => {
    await expect(searchDestinations(' 강 ', 37.5, 127)).rejects.toMatchObject({
      failure: {
        errorType: 'http',
        status: 400,
        serverMessage: '검색어는 2자 이상 입력해 주세요.',
        fieldErrors: [],
      },
      cause: undefined,
    });
  });

  it('카카오 응답에서도 숫자가 아닌 목적지 좌표는 거부한다', async () => {
    server.use(
      http.get('/api/destinations/search', () =>
        HttpResponse.json({
          query: '강남역',
          destinations: [{ ...destination, provider: 'KAKAO', latitude: '37.5' }],
        }),
      ),
    );

    await expect(searchDestinations('강남역', 37.5, 127)).rejects.toMatchObject({
      failure: { errorType: 'response', reason: 'schema' },
    });
  });

  it('좌표 뒤에 전달한 AbortSignal로 요청을 취소할 수 있다', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(searchDestinations('강남역', 37.5, 127, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('목적지 검색 API Mock', () => {
  it.each(['', '&latitude=0&longitude=0'])(
    '선택 좌표 생략과 0 좌표를 허용하며 카카오 제공자를 반환한다 (사례 %#)',
    async (coordinates) => {
      const response = await fetch(`/api/destinations/search?query=강남역${coordinates}`);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        query: '강남역',
        destinations: expect.arrayContaining([
          expect.objectContaining({
            destinationId: expect.stringMatching(/^kakao_/),
            provider: 'KAKAO',
          }),
        ]),
      });
    },
  );

  it.each([
    'latitude=37.5',
    'longitude=127',
    'latitude=undefined&longitude=undefined',
    'latitude=NaN&longitude=127',
    'latitude=Infinity&longitude=127',
    'latitude=91&longitude=127',
    'latitude=37.5&longitude=181',
  ])('잘못된 좌표를 공통 오류 형식으로 거부한다 (%s)', async (coordinates) => {
    const response = await fetch(`/api/destinations/search?query=강남역&${coordinates}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: '요청 값이 올바르지 않습니다.',
      errors: expect.arrayContaining([
        expect.objectContaining({ field: expect.any(String), message: expect.any(String) }),
      ]),
    });
  });
});
