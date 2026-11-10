import { Button } from '../../ui/Button';
import { useEffect, useState } from 'react';

import { css, cx } from '@emotion/css';
import { Modal } from '../../ui/Modal';
import { ChevronRightIcon } from '../../ui/icons';

import { trackEvent } from '../../../analytics';
import { buildDirectionsLinks, type Coordinate, type DirectionsProvider } from './deepLink';
import { eventName } from '../../../monitoring/constants';
import { color } from '../../../../theme/color';
import { typography } from '../../../../theme/typography';

interface Props {
  onRequestClose: () => void;
  onDirectionsStart?: (provider: DirectionsProvider) => void;
  destination: {
    name: string;
    location: Coordinate;
  };
}

type LocationState =
  | { status: 'LOADING' }
  | { status: 'READY'; coordinate: Coordinate }
  | { status: 'ERROR'; message: string };

const providers: Array<{ provider: DirectionsProvider; label: string; mark: string }> = [
  { provider: 'NAVER', label: '네이버 지도', mark: 'N' },
  { provider: 'KAKAO', label: '카카오맵', mark: 'K' },
  { provider: 'TMAP', label: '티맵', mark: 'T' },
];

export const DeepLinkModal = ({ onRequestClose, onDirectionsStart, destination }: Props) => {
  const [locationState, setLocationState] = useState<LocationState>({ status: 'LOADING' });
  const [requestToken, setRequestToken] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    if (!navigator.geolocation) {
      queueMicrotask(() => {
        if (!isCancelled)
          setLocationState({ status: 'ERROR', message: '현재 위치를 지원하지 않는 브라우저예요.' });
      });
      return () => {
        isCancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!isCancelled) setLocationState({ status: 'LOADING' });
    });

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (isCancelled) return;
        setLocationState({
          status: 'READY',
          coordinate: { latitude: coords.latitude, longitude: coords.longitude },
        });
      },
      (error) => {
        if (isCancelled) return;
        setLocationState({
          status: 'ERROR',
          message:
            error.code === error.PERMISSION_DENIED
              ? '브라우저 설정에서 위치 권한을 허용해주세요.'
              : '현재 위치를 가져오지 못했어요.',
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );

    return () => {
      isCancelled = true;
    };
  }, [requestToken]);

  const handleProviderClick = (provider: DirectionsProvider) => {
    if (locationState.status !== 'READY') return;

    const links = buildDirectionsLinks({
      provider,
      start: locationState.coordinate,
      destination,
      appName: window.location.origin,
    });
    trackEvent(eventName.SELECTED_MAP_APP, {
      provider: provider.toLowerCase(),
    });
    onDirectionsStart?.(provider);

    const userAgent = navigator.userAgent;

    if (/Android/i.test(userAgent)) {
      window.location.assign(links.androidIntentUrl);
      return;
    }

    const isIOS =
      /iPad|iPhone|iPod/i.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!isIOS) {
      window.location.assign(links.webUrl);
      return;
    }

    let appOpened = false;
    const markAppOpened = () => {
      appOpened = true;
    };

    document.addEventListener('visibilitychange', markAppOpened, { once: true });
    window.addEventListener('pagehide', markAppOpened, { once: true });
    window.location.assign(links.appUrl);

    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', markAppOpened);
      window.removeEventListener('pagehide', markAppOpened);
      if (!appOpened) window.location.assign(links.iosStoreUrl);
    }, 1500);
  };

  return (
    <Modal
      onClose={onRequestClose}
      label="어떤 앱으로 갈까요?"
      description={`${destination.name}까지 안내합니다.`}
    >
      <div aria-busy={locationState.status === 'LOADING'}>
        {providers.map(({ provider, label, mark }) => (
          <button
            className={providerButtonStyle}
            type="button"
            key={provider}
            disabled={locationState.status !== 'READY'}
            onClick={() => handleProviderClick(provider)}
          >
            <span className={cx(providerLogoBaseStyle, providerLogoStyles[provider])}>{mark}</span>
            <span>
              <strong>{label}</strong>
            </span>
            <span className={chevronStyle} aria-hidden="true">
              <ChevronRightIcon size={16} />
            </span>
          </button>
        ))}
      </div>

      {locationState.status === 'LOADING' && (
        <p className={statusStyle}>현재 위치를 확인하고 있어요.</p>
      )}
      {locationState.status === 'ERROR' && (
        <div className={errorStyle} role="alert">
          <p>{locationState.message}</p>
          <Button variant="subtle" size="sm" onClick={() => setRequestToken((token) => token + 1)}>
            다시 시도
          </Button>
        </div>
      )}
    </Modal>
  );
};

const providerButtonStyle = css`
  display: grid;
  grid-template-columns: 42px 1fr 16px;
  align-items: center;
  gap: 12px;

  width: 100%;
  min-height: 68px;
  padding: 8px 4px;

  color: ${color.text.primary};
  text-align: left;

  background: ${color.background.default};
  border: 0;
  border-top: 1px solid ${color.border.default};
  cursor: pointer;

  strong,
  small {
    display: block;
  }

  strong {
    ${typography.bodySmallStrong};
  }

  small {
    margin-top: 3px;
    ${typography.caption};
    color: ${color.text.secondary};
  }

  &:disabled {
    cursor: wait;
    opacity: 0.62;
  }
`;

const providerLogoBaseStyle = css`
  display: grid;
  place-items: center;

  width: 42px;
  height: 42px;

  ${typography.bodyStrong};

  border-radius: 11px;
`;

const providerLogoStyles: Record<DirectionsProvider, string> = {
  NAVER: css`
    color: ${color.mapProvider.naver.foreground};
    background: ${color.mapProvider.naver.background};
  `,
  KAKAO: css`
    color: ${color.mapProvider.kakao.foreground};
    background: ${color.mapProvider.kakao.background};
  `,
  TMAP: css`
    color: ${color.mapProvider.tmap.foreground};
    background: ${color.mapProvider.tmap.background};
  `,
};

const chevronStyle = css`
  color: ${color.icon.default};
  ${typography.titleSection}
`;

const statusStyle = css`
  margin: 12px 0 0;

  ${typography.caption};
  color: ${color.text.secondary};
  text-align: center;
`;

const errorStyle = css`
  margin-top: 12px;

  ${typography.caption};
  color: ${color.text.error};
  text-align: center;

  p {
    margin: 0 0 8px;
  }
`;
