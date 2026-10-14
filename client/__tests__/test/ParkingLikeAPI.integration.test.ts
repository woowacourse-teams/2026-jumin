import { jest } from '@jest/globals';
import { http, HttpResponse } from 'msw';
import { updateParkingLike } from '../../api/parkingLikes';
import { getParkingLotDetail, getViewportParkingLotDetail } from '../../api/parkingLots';
import { parkingDetailFixtures } from '../../mocks/fixtures/parkingDetails';
import { viewportParkingLotDetailFixtures } from '../../mocks/fixtures/viewportParkingLotDetails';
import { server } from '../msw/server';
import { searchCondition } from '../testData';
import { getGuestId, UUID_V4_PATTERN } from '../../shared/utils/guestId';

describe('주차장 좋아요 API와 익명 ID', () => {
  it('UUID v4를 localStorage에 저장하고 이후 요청에서 재사용한다', () => {
    const guestId = getGuestId();

    expect(guestId).toMatch(UUID_V4_PATTERN);
    expect(localStorage.getItem('guestId')).toBe(guestId);
    expect(getGuestId()).toBe(guestId);
  });

  it('저장된 ID 형식이 잘못되면 새 UUID v4로 교체한다', () => {
    localStorage.setItem('guestId', 'invalid-id');
    expect(getGuestId()).toMatch(UUID_V4_PATTERN);
    expect(localStorage.getItem('guestId')).not.toBe('invalid-id');
  });

  it('저장소 접근이 거부되면 매 요청마다 새 ID로 좋아요를 보내지 않는다', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('저장소 접근 거부', 'SecurityError');
    });
    await expect(updateParkingLike(101, true)).rejects.toThrow('익명 ID를 저장하지 못했어요.');
  });

  it.each([true, false])('좋아요 상태 %s에 맞는 메서드와 익명 ID 헤더를 보낸다', async (liked) => {
    const guestId = getGuestId();
    const handler = liked ? http.put : http.delete;
    server.use(
      handler('/api/parking/101/like', async ({ request }) => {
        expect(request.headers.get('X-Guest-Id')).toBe(guestId);
        expect(request.headers.has('X-Anonymous-Id')).toBe(false);
        expect(await request.text()).toBe('');
        return HttpResponse.json({ parkingLotId: 101, likeCount: 12, likedByMe: liked });
      }),
    );
    await expect(updateParkingLike(101, liked)).resolves.toEqual({
      parkingLotId: 101,
      likeCount: 12,
      likedByMe: liked,
    });
  });

  it('두 상세 조회 API에도 같은 익명 ID 헤더를 보낸다', async () => {
    const guestId = getGuestId();
    server.use(
      http.get('/api/parking/101', ({ request }) => {
        expect(request.headers.get('X-Guest-Id')).toBe(guestId);
        expect(request.headers.has('X-Anonymous-Id')).toBe(false);
        return HttpResponse.json(parkingDetailFixtures[101]);
      }),
      http.get('/api/parking/viewport/101', ({ request }) => {
        expect(request.headers.get('X-Guest-Id')).toBe(guestId);
        expect(request.headers.has('X-Anonymous-Id')).toBe(false);
        return HttpResponse.json(viewportParkingLotDetailFixtures[101]);
      }),
    );
    await expect(getParkingLotDetail(101, searchCondition)).resolves.toMatchObject({
      id: 101,
      estimatedFee: parkingDetailFixtures[101]!.estimatedFee,
    });
    await expect(getViewportParkingLotDetail(101)).resolves.toMatchObject({
      likeCount: 12,
      likedByMe: false,
    });
  });

  it('동일 익명 ID의 중복 등록과 취소는 개수를 중복 변경하지 않는다', async () => {
    await updateParkingLike(101, true);
    await expect(updateParkingLike(101, true)).resolves.toMatchObject({ likeCount: 13 });
    await expect(getViewportParkingLotDetail(101)).resolves.toMatchObject({
      likeCount: 13,
      likedByMe: true,
    });
    await updateParkingLike(101, false);
    await expect(updateParkingLike(101, false)).resolves.toMatchObject({
      likeCount: 12,
      likedByMe: false,
    });
  });

  it.each([400, 404, 500])('HTTP %i 오류의 서버 메시지를 보존한다', async (status) => {
    server.use(
      http.put('/api/parking/101/like', () =>
        HttpResponse.json({ message: '좋아요 요청 오류' }, { status }),
      ),
    );
    await expect(updateParkingLike(101, true)).rejects.toThrow('좋아요 요청 오류');
  });

  it.each([
    { parkingLotId: 101, likeCount: -1, likedByMe: true },
    { parkingLotId: 101, likeCount: 1.5, likedByMe: true },
    { parkingLotId: 101, likeCount: 13 },
    { parkingLotId: 102, likeCount: 13, likedByMe: true },
    { parkingLotId: 101, likeCount: 13, likedByMe: false },
  ])('잘못된 좋아요 응답을 성공으로 처리하지 않는다 (사례 %#)', async (body) => {
    server.use(http.put('/api/parking/101/like', () => HttpResponse.json(body)));
    await expect(updateParkingLike(101, true)).rejects.toThrow('좋아요를 변경하지 못했어요.');
  });
});
