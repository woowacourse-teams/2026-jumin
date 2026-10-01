import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { delay, http, HttpResponse } from 'msw';

import { useParkingReport } from '../../shared/hooks/useParkingReport';
import { createTestQueryClient } from '../renderWithProviders';
import { server } from '../msw/server';

const renderReportHook = () => {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(() => useParkingReport({ parkingLotId: 101 }), { wrapper });
};

describe('주차장 신고 훅', () => {
  it('모달이 닫혀 있으면 제출할 수 없다', async () => {
    const { result } = renderReportHook();
    act(() => result.current.setContent('요금 정보가 달라요.'));

    expect(result.current.canSubmit).toBe(false);
    act(() => result.current.submit());
    expect(result.current.isPending).toBe(false);
  });

  it('렌더링 전 연속 제출은 한 번만 요청하고 요청 중 닫기를 막는다', async () => {
    let requestCount = 0;
    server.use(
      http.post('/api/parking/review', async () => {
        requestCount += 1;
        await delay(100);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = renderReportHook();
    act(() => result.current.open());
    act(() => result.current.setContent('요금 정보가 달라요.'));
    act(() => {
      result.current.submit();
      result.current.submit();
      result.current.close();
    });

    expect(result.current.isOpen).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestCount).toBe(1);
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.close());
    act(() => result.current.open());
    expect(result.current.content).toBe('');
    expect(result.current.isSuccess).toBe(false);
  });
});
