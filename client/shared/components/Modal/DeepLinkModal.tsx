import { useEffect, useState } from 'react';

import { css, cx } from '@emotion/css';
import Modal from 'react-modal';

import { trackEvent } from '../../analytics';
import { buildDirectionsLinks, type Coordinate, type DirectionsProvider } from './deepLink';
import { eventName } from '../../monitoring/constants';
import { color } from '../../../src/theme/color';
import { typography } from '../../../src/theme/typography';

if (typeof document !== 'undefined') {
  const appElement = document.querySelector<HTMLElement>('#root, #storybook-root');
  if (appElement) Modal.setAppElement(appElement);
}

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
      isOpen
      onRequestClose={onRequestClose}
      overlayClassName={overlayStyle}
      className={modalStyle}
      contentLabel="길찾기 앱 선택"
      shouldCloseOnOverlayClick
    >
      <button
        className={closeButtonStyle}
        type="button"
        aria-label="길찾기 앱 선택 닫기"
        onClick={onRequestClose}
      >
        ×
      </button>

      <h2 className={titleStyle}>어떤 앱으로 갈까요?</h2>
      <p className={descriptionStyle}>{destination.name}까지 안내합니다.</p>

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
              ›
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
          <button type="button" onClick={() => setRequestToken((token) => token + 1)}>
            다시 시도
          </button>
        </div>
      )}
    </Modal>
  );
};

const overlayStyle = css`
  position: fixed;
  inset: 0;
  z-index: 2000;

  display: grid;
  place-items: center;

  padding: 20px;
  box-sizing: border-box;

  background: ${color.overlay.scrim};
`;

const modalStyle = css`
  position: relative;

  width: min(100%, 340px);
  padding: 26px 20px 18px;
  box-sizing: border-box;

  color: ${color.text.primary};
  background: ${color.background.default};
  border: 0;
  border-radius: 24px;
  box-shadow: 0 24px 64px rgb(16 27 55 / 24%);
  outline: none;
`;

const closeButtonStyle = css`
  position: absolute;
  top: 14px;
  right: 14px;

  display: grid;
  place-items: center;

  width: 36px;
  height: 36px;
  padding: 0;

  color: ${color.icon.default};
  ${typography.titleSection}
  line-height: 1;

  background: transparent;
  border: 0;
  border-radius: 10px;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
  }
`;

const titleStyle = css`
  margin: 0 40px 6px 0;

  ${typography.titleSection};
  letter-spacing: -0.5px;
`;

const descriptionStyle = css`
  margin: 0 0 14px;
  overflow: hidden;

  ${typography.caption};
  color: ${color.text.secondary};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

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

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: -3px;
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

  button {
    padding: 8px 12px;

    color: ${color.text.brand};
    font: inherit;
    ${typography.bodySmallStrong}

    background: ${color.background.brandSubtle};
    border: 0;
    border-radius: 9px;
    cursor: pointer;
  }
`;
