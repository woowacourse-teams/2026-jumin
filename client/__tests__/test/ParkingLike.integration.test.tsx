import { jest } from '@jest/globals';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import type { ParkingLikeState } from '../../api/contracts';
import { ParkingLikeButton } from '../../shared/components/service/parking/ParkingLikeButton';

import { color } from '../../src/theme/color';
import { palette } from '../../src/theme/palette';
import { createTestQueryClient, renderWithProviders } from '../renderWithProviders';
import { server } from '../msw/server';

const initialLike: ParkingLikeState = { likeCount: 12, likedByMe: false };
const viewportKey = ['parking-lots', 'viewport-detail', 101];
const otherViewportKey = ['parking-lots', 'viewport-detail', 102];

const LikeDetail = ({ parkingLotId = 101, likedByMe = false }) => {
  const { data } = useQuery({
    queryKey: ['parking-lots', 'viewport-detail', parkingLotId],
    queryFn: () => ({ ...initialLike, likedByMe }),
    initialData: { ...initialLike, likedByMe },
    staleTime: Infinity,
  });
  return <ParkingLikeButton key={parkingLotId} parkingLotId={parkingLotId} {...data} />;
};

const waitForDebounce = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)));

describe('주차장 좋아요 버튼', () => {
  it('서버의 좋아요 수를 상세 캐시에 반영하고 다른 주차장의 캐시는 유지한다', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(viewportKey, { ...initialLike, name: '주차장' });
    queryClient.setQueryData(otherViewportKey, initialLike);
    renderWithProviders(<LikeDetail />, { queryClient });
    server.use(
      http.put('/api/parking/101/like', async () => {
        await delay(150);
        return HttpResponse.json({ parkingLotId: 101, likeCount: 20, likedByMe: true });
      }),
    );

    const button = screen.getByRole('button', { name: '좋아요 12개' });
    expect(button).toHaveTextContent(/^12$/);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(button).toHaveAccessibleName('좋아요 13개');
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() => expect(button).toHaveAccessibleName('좋아요 20개'));
    expect(queryClient.getQueryData(otherViewportKey)).toEqual(initialLike);
    expect(queryClient.getQueryData(viewportKey)).toEqual({
      name: '주차장',
      likeCount: 20,
      likedByMe: true,
    });
  });

  it('300ms 안의 연속 클릭은 마지막 상태로 한 번만 요청한다', async () => {
    const requested = jest.fn();
    server.use(
      http.put('/api/parking/101/like', () => {
        requested();
        return HttpResponse.json({ parkingLotId: 101, likeCount: 13, likedByMe: true });
      }),
    );
    renderWithProviders(<LikeDetail />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: '좋아요 12개' });
    await user.click(button);
    await user.click(button);
    await user.click(button);
    expect(requested).not.toHaveBeenCalled();

    await waitFor(() => expect(requested).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('연속 클릭으로 원래 상태가 되면 요청하지 않는다', async () => {
    const requested = jest.fn();
    server.use(
      http.put('/api/parking/101/like', () => {
        requested();
        return HttpResponse.error();
      }),
    );
    renderWithProviders(<LikeDetail />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: '좋아요 12개' });
    await user.dblClick(button);
    await waitForDebounce();
    expect(requested).not.toHaveBeenCalled();
    expect(button).toHaveAccessibleName('좋아요 12개');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('이미 좋아요한 주차장은 DELETE로 취소한다', async () => {
    const requested = jest.fn();
    server.use(
      http.delete('/api/parking/101/like', () => {
        requested();
        return HttpResponse.json({ parkingLotId: 101, likeCount: 11, likedByMe: false });
      }),
    );
    renderWithProviders(<LikeDetail likedByMe />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: '좋아요 12개' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await user.click(button);
    await waitFor(() => expect(requested).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveAccessibleName('좋아요 11개');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('실패하면 상태와 개수를 복구하고 오류를 표시하며 다시 시도할 수 있다', async () => {
    server.use(http.put('/api/parking/101/like', () => HttpResponse.error()));
    renderWithProviders(<LikeDetail />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: '좋아요 12개' });
    await user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('좋아요를 변경하지 못했어요.');
    expect(button).toHaveAccessibleName('좋아요 12개');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    server.use(
      http.put('/api/parking/101/like', () =>
        HttpResponse.json({
          parkingLotId: 101,
          likeCount: 13,
          likedByMe: true,
        }),
      ),
    );
    await user.click(button);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveAccessibleName('좋아요 13개');
  });

  it('요청 중에는 추가 클릭을 막는다', async () => {
    const requested = jest.fn();
    server.use(
      http.put('/api/parking/101/like', async () => {
        requested();
        await delay(400);
        return HttpResponse.json({ parkingLotId: 101, likeCount: 13, likedByMe: true });
      }),
    );
    renderWithProviders(<LikeDetail />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: '좋아요 12개' });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(requested).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('전송 전에 상세 화면을 닫으면 예약된 요청을 취소한다', async () => {
    const requested = jest.fn();
    server.use(
      http.put('/api/parking/101/like', () => {
        requested();
        return HttpResponse.error();
      }),
    );
    const { unmount } = renderWithProviders(<LikeDetail />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '좋아요 12개' }));
    unmount();
    await waitForDebounce();
    expect(requested).not.toHaveBeenCalled();
  });

  it('다른 주차장으로 바꾸면 이전 주차장의 예약 요청과 낙관적 상태를 취소한다', async () => {
    const requested = jest.fn();
    server.use(
      http.put('/api/parking/101/like', () => {
        requested();
        return HttpResponse.error();
      }),
    );
    const { rerender } = renderWithProviders(<LikeDetail />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '좋아요 12개' }));
    rerender(<LikeDetail parkingLotId={102} />);
    await waitForDebounce();
    expect(requested).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '좋아요 12개' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
