import { useRef, useState } from 'react';
import { useModal } from './useModal';
import { useMutation } from '@tanstack/react-query';
import { submitParkingReport } from '../../api/reportParkingData';

export type ParkingReport = ReturnType<typeof useParkingReport>;

/** 주차장 데이터 제보 기능을 제공하는 커스텀 훅 */
export const useParkingReport = ({ parkingLotId }: { parkingLotId: number }) => {
  const modal = useModal();
  const [content, setContent] = useState('');
  const requestInFlight = useRef(false);

  const mutation = useMutation({
    mutationFn: (reportContent: string) => submitParkingReport(parkingLotId, reportContent),
    retry: false,
    onSettled: () => {
      requestInFlight.current = false;
    },
  });

  const canSubmit =
    modal.isOpen &&
    content.trim().length > 0 &&
    content.length <= 400 &&
    !mutation.isPending &&
    !mutation.isSuccess;

  const reset = () => {
    setContent('');
    mutation.reset();
  };

  const open = () => {
    if (requestInFlight.current || mutation.isPending || modal.isOpen) return;

    reset();
    modal.open();
  };

  const close = () => {
    if (requestInFlight.current || mutation.isPending) return;

    modal.close();
    reset();
  };

  const submit = () => {
    if (!canSubmit || requestInFlight.current) return;

    requestInFlight.current = true;
    mutation.mutate(content.trim());
  };

  return {
    isOpen: modal.isOpen,
    open,
    close,
    content,
    setContent,
    canSubmit,
    submit,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    errorMessage: mutation.error?.message ?? null,
  };
};
