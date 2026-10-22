import { jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { delay, http, HttpResponse } from 'msw';

import type { ParkingLikeState } from '../../api/contracts';
import { useParkingLike } from '../../shared/hooks/useParkingLike';
import { createTestQueryClient } from '../renderWithProviders';
import { server } from '../msw/server';

const initialLike: ParkingLikeState = { likeCount: 12, likedByMe: false };

const renderLikeHook = (confirmed: ParkingLikeState = initialLike) => {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(() => useParkingLike(101, confirmed), { wrapper });
};

const waitForDebounce = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)));

describe('주차장 좋아요 훅', () => {
  it('클릭하면 서버 요청 전까지 낙관적 상태를 반환한다', async () => {
    const requested = jest.fn();
    server.use(
      http.put('/api/parking/101/like', async () => {
        requested();
        await delay(50);
        return HttpResponse.json({ parkingLotId: 101, likeCount: 13, likedByMe: true });
      }),
    );
    const { result } = renderLikeHook();

    act(() => result.current.toggle());

    expect(result.current.likedByMe).toBe(true);
    expect(result.current.likeCount).toBe(13);
    expect(requested).not.toHaveBeenCalled();

    await waitFor(() => expect(requested).toHaveBeenCalledTimes(1));
  });

  it('연속 클릭으로 원래 상태가 되면 요청하지 않는다', async () => {
    const requested = jest.fn();
    server.use(
      http.put('/api/parking/101/like', () => {
        requested();
        return HttpResponse.json({ parkingLotId: 101, likeCount: 13, likedByMe: true });
      }),
    );
    const { result } = renderLikeHook();

    act(() => result.current.toggle());
    act(() => result.current.toggle());
    await waitForDebounce();

    expect(requested).not.toHaveBeenCalled();
    expect(result.current.likedByMe).toBe(false);
    expect(result.current.likeCount).toBe(12);
  });

  it('이미 좋아요한 상태에서 클릭하면 취소 요청을 보낸다', async () => {
    const requested = jest.fn();
    server.use(
      http.delete('/api/parking/101/like', () => {
        requested();
        return HttpResponse.json({ parkingLotId: 101, likeCount: 11, likedByMe: false });
      }),
    );
    const { result } = renderLikeHook({ likeCount: 12, likedByMe: true });

    act(() => result.current.toggle());
    expect(result.current.likedByMe).toBe(false);
    expect(result.current.likeCount).toBe(11);

    await waitFor(() => expect(requested).toHaveBeenCalledTimes(1));
  });

  it('요청이 실패하면 오류를 반환하고 낙관적 상태를 되돌린다', async () => {
    server.use(http.put('/api/parking/101/like', () => HttpResponse.error()));
    const { result } = renderLikeHook();

    act(() => result.current.toggle());
    await waitFor(() =>
      expect(result.current.errorMessage).toBe('좋아요를 변경하지 못했어요. 다시 시도해주세요.'),
    );

    expect(result.current.likedByMe).toBe(false);
    expect(result.current.likeCount).toBe(12);
  });

  it('언마운트하면 예약된 요청을 취소한다', async () => {
    const requested = jest.fn();
    server.use(
      http.put('/api/parking/101/like', () => {
        requested();
        return HttpResponse.error();
      }),
    );
    const { result, unmount } = renderLikeHook();

    act(() => result.current.toggle());
    unmount();
    await waitForDebounce();

    expect(requested).not.toHaveBeenCalled();
  });
});
