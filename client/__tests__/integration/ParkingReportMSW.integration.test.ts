const submitReport = (body: unknown) =>
  fetch('/api/parking/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('주차장 데이터 신고 API Mock', () => {
  it('유효한 요청에 본문 없는 성공 응답을 반환한다', async () => {
    const response = await submitReport({ parkingLotId: 12345, detail: '요금 정보가 달라요.' });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('400자 신고 내용을 허용한다', async () => {
    const response = await submitReport({ parkingLotId: 101, detail: '가'.repeat(400) });

    expect(response.ok).toBe(true);
  });

  it.each(['', '   ', '가'.repeat(401), 123, null, undefined])(
    '빈 내용·400자 초과·잘못된 자료형을 거부한다 (사례 %#)',
    async (detail) => {
      const response = await submitReport({ parkingLotId: 101, detail });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        message: expect.any(String),
        errors: expect.arrayContaining([expect.objectContaining({ field: 'detail' })]),
      });
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '101', null, undefined])(
    '잘못된 주차장 ID를 거부한다 (사례 %#)',
    async (parkingLotId) => {
      const response = await submitReport({ parkingLotId, detail: '요금 정보가 달라요.' });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        message: expect.any(String),
        errors: expect.arrayContaining([expect.objectContaining({ field: 'parkingLotId' })]),
      });
    },
  );

  it('잘못된 JSON을 거부한다', async () => {
    const response = await fetch('/api/parking/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
  });

  it.each([null, [], '신고 내용'])('객체가 아닌 요청 본문을 거부한다 (사례 %#)', async (body) => {
    const response = await submitReport(body);

    expect(response.status).toBe(400);
  });

  it('서버 오류 시나리오에서 오류 메시지를 반환한다', async () => {
    window.history.replaceState({}, '', '/?mock=parking-report-server-error');

    const response = await submitReport({ parkingLotId: 101, detail: '요금 정보가 달라요.' });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: '신고 접수에 실패했어요. 잠시 후 다시 시도해주세요.',
    });
  });

  it('네트워크 오류 시나리오에서 요청이 실패한다', async () => {
    window.history.replaceState({}, '', '/?mock=parking-report-network-error');

    await expect(
      submitReport({ parkingLotId: 101, detail: '요금 정보가 달라요.' }),
    ).rejects.toThrow();
  });

  it('느린 응답 시나리오에서도 본문 없는 성공 응답을 반환한다', async () => {
    window.history.replaceState({}, '', '/?mock=parking-report-slow');

    const response = await submitReport({ parkingLotId: 101, detail: '요금 정보가 달라요.' });

    expect(response.ok).toBe(true);
    expect(await response.text()).toBe('');
  });
});
