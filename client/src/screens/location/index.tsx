/** 위치 권한 안내 시트. */

import { DialogSheet, Muted, PrimaryButton } from '../../components';
import { initializeHistory, navigate } from '../../router';
import { useLocation } from '../../contexts';

export const LocationSheet = () => {
  const { locationError, locate, dismissLocationError } = useLocation();
  const { result, nearby } = locationError!;
  const onClose = dismissLocationError;
  const onRetry = () => {
    dismissLocationError();
    void locate(nearby);
  };
  const onSearch = () => {
    dismissLocationError();
    navigate('/search');
  };
  const message =
    'reason' in result && result.reason === 'TIMEOUT'
      ? '현재 위치를 확인하는 데 시간이 오래 걸리고 있어요.'
      : result.status === 'DENIED_PERMANENTLY'
        ? '설정에서 위치 권한을 허용해주세요.'
        : result.status === 'DENIED'
          ? '주변 주차장을 찾으려면 위치 권한이 필요해요.'
          : '목적지를 검색해서 이용해주세요.';
  return (
    <DialogSheet title="현재 위치를 확인할 수 없어요" onClose={onClose}>
      <Muted css={{ marginBottom: 18 }}>{message}</Muted>
      {result.status === 'UNAVAILABLE' ? (
        <PrimaryButton type="button" onClick={onSearch}>
          목적지 검색
        </PrimaryButton>
      ) : (
        <PrimaryButton type="button" onClick={result.status === 'DENIED_PERMANENTLY' ? onClose : onRetry}>
          {result.status === 'DENIED_PERMANENTLY' ? '확인' : '다시 시도'}
        </PrimaryButton>
      )}
    </DialogSheet>
  );
};

initializeHistory();
