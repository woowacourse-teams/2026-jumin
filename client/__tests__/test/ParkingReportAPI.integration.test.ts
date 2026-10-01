import { http, HttpResponse } from 'msw';

import { submitParkingReport } from '../../api/reportParkingData';
import { server } from '../msw/server';

const fallbackMessage = '신고 접수에 실패했어요. 잠시 후 다시 시도해주세요.';

describe('주차장 데이터 신고 API', () => {
  it('명세에 맞는 JSON 본문으로 POST 요청을 보낸다', async () => {
    server.use(
      http.post('/api/parking/review', async ({ request }) => {
        expect(request.headers.get('Content-Type')).toBe('application/json');
        expect(await request.json()).toEqual({
          parkingLotId: 12345,
          detail: '주말에는 무료인데 유료라고 되어 있어요.',
        });

        return new HttpResponse(null, { status: 200 });
      }),
    );

    await expect(
      submitParkingReport(12345, '주말에는 무료인데 유료라고 되어 있어요.'),
    ).resolves.toBeUndefined();
  });

  it.each([200, 201, 204])('본문 없는 %i 성공 응답을 허용한다', async (status) => {
    server.use(http.post('/api/parking/review', () => new HttpResponse(null, { status })));

    await expect(submitParkingReport(101, '요금 정보가 달라요.')).resolves.toBeUndefined();
  });

  it('등록된 신고 MSW 핸들러와 연결된다', async () => {
    await expect(submitParkingReport(101, '요금 정보가 달라요.')).resolves.toBeUndefined();
  });

  it.each([400, 404, 500])('HTTP %i 오류의 서버 메시지를 보존한다', async (status) => {
    server.use(
      http.post('/api/parking/review', () =>
        HttpResponse.json({ message: '서버에서 전달한 오류입니다.' }, { status }),
      ),
    );

    await expect(submitParkingReport(101, '요금 정보가 달라요.')).rejects.toThrow(
      '서버에서 전달한 오류입니다.',
    );
  });

  it.each([{}, { message: '' }, { message: 123 }, null])(
    '오류 메시지 구조가 잘못되면 기본 메시지와 검증 원인을 보존한다 (사례 %#)',
    async (body) => {
      server.use(http.post('/api/parking/review', () => HttpResponse.json(body, { status: 500 })));

      await expect(submitParkingReport(101, '요금 정보가 달라요.')).rejects.toMatchObject({
        message: fallbackMessage,
        cause: expect.objectContaining({ name: 'ZodError' }),
      });
    },
  );

  it.each(['', '<html>Bad Gateway</html>'])(
    '오류 응답을 JSON으로 읽지 못하면 기본 메시지와 파싱 원인을 보존한다 (사례 %#)',
    async (body) => {
      server.use(http.post('/api/parking/review', () => HttpResponse.text(body, { status: 502 })));

      await expect(submitParkingReport(101, '요금 정보가 달라요.')).rejects.toMatchObject({
        message: fallbackMessage,
        cause: expect.objectContaining({ name: 'SyntaxError' }),
      });
    },
  );

  it('네트워크 오류는 성공으로 처리하지 않는다', async () => {
    server.use(http.post('/api/parking/review', () => HttpResponse.error()));

    await expect(submitParkingReport(101, '요금 정보가 달라요.')).rejects.toThrow();
  });

  it('전달한 AbortSignal로 취소된 요청의 AbortError를 보존한다', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      submitParkingReport(101, '요금 정보가 달라요.', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
