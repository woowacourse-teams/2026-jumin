import { http, HttpResponse } from 'msw';

import { getParkingLotDetail } from '../../src/api/parkingLots';
import { parkingDetailFixtures } from '../../mocks/fixtures/parkingDetails';
import { server } from '../msw/server';
import { searchCondition } from '../testData';

describe('추천 상세 API의 잔여석 계약', () => {
  // 용량은 테스트 전용 값으로 고정해 공용 상세 fixture의 숫자 변경과 분리한다.
  it.each([8, 0, null, 60])('잔여석 %s를 가공하지 않고 반환한다', async (availableSpaces) => {
    server.use(
      http.get('/api/parking/101', () =>
        HttpResponse.json({ ...parkingDetailFixtures[101], capacity: 91, availableSpaces }),
      ),
    );

    await expect(getParkingLotDetail(101, searchCondition)).resolves.toMatchObject({
      availableSpaces,
      capacity: 91,
    });
  });

  it.each([-1, 1.5, '8', undefined])(
    '잘못된 잔여석 %s를 스키마 오류로 처리한다',
    async (availableSpaces) => {
      server.use(
        http.get('/api/parking/101', () =>
          HttpResponse.json({ ...parkingDetailFixtures[101], capacity: 91, availableSpaces }),
        ),
      );

      await expect(getParkingLotDetail(101, searchCondition)).rejects.toMatchObject({
        failure: { errorType: 'response', reason: 'schema' },
      });
    },
  );
});
