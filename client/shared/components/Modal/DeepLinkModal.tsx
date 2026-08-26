import { useEffect, useState } from 'react';

import { css, cx } from '@emotion/css';
import Modal from 'react-modal';

import { trackEvent } from '../../analytics';
import { buildDirectionsLinks, type Coordinate, type DirectionsProvider } from './deepLink';

if (typeof document !== 'undefined') {
  const appElement = document.querySelector<HTMLElement>('#root, #storybook-root');
  if (appElement) Modal.setAppElement(appElement);
}

interface Props {
  isOpen: boolean;
  onRequestClose: () => void;
  onDirectionsStart?: (provider: DirectionsProvider) => void;
  destination: {
    name: string;
    location: Coordinate;
  };
}

type LocationState =
  { status: 'LOADING' } | { status: 'READY'; coordinate: Coordinate } | { status: 'ERROR'; message: string };

const providers: Array<{ provider: DirectionsProvider; label: string; mark: string }> = [
  { provider: 'NAVER', label: '네이버 지도', mark: 'N' },
  { provider: 'KAKAO', label: '카카오맵', mark: 'K' },
  { provider: 'TMAP', label: '티맵', mark: 'T' },
];

export const DeepLinkModal = ({ isOpen, onRequestClose, onDirectionsStart, destination }: Props) => {
  const [locationState, setLocationState] = useState<LocationState>({ status: 'LOADING' });
  const [requestToken, setRequestToken] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;

    if (!navigator.geolocation) {
      queueMicrotask(() => {
        if (!isCancelled) setLocationState({ status: 'ERROR', message: '현재 위치를 지원하지 않는 브라우저예요.' });
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
              ? '브라우저 설정에서 이 사이트의 위치 권한을 허용한 뒤 다시 시도해주세요.' // 일단 웹 출시이니까 이런식으로
              : '현재 위치를 가져오지 못했어요.',
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );

    return () => {
      isCancelled = true;
    };
  }, [isOpen, requestToken]);

  const handleProviderClick = (provider: DirectionsProvider) => {
    if (locationState.status !== 'READY') return;

    const links = buildDirectionsLinks({
      provider,
      start: locationState.coordinate,
      destination,
      appName: window.location.origin,
    });
    trackEvent('directions_requested', {
      provider: provider.toLowerCase(),
    });
    onDirectionsStart?.(provider);

    const userAgent = navigator.userAgent;

    if (/Android/i.test(userAgent)) {
      window.location.assign(links.androidIntentUrl);
      return;
    }

    const isIOS =
      /iPad|iPhone|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      overlayClassName={overlayStyle}
      className={modalStyle}
      contentLabel="길찾기 앱 선택"
      shouldCloseOnOverlayClick
    >
      <button className={closeButtonStyle} type="button" aria-label="길찾기 앱 선택 닫기" onClick={onRequestClose}>
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

      {locationState.status === 'LOADING' && <p className={statusStyle}>현재 위치를 확인하고 있어요.</p>}
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

  background: rgb(16 27 55 / 48%);
`;

const modalStyle = css`
  position: relative;

  width: min(100%, 340px);
  padding: 26px 20px 18px;
  box-sizing: border-box;

  color: #18233d;
  background: #fff;
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

  color: #7f8a9f;
  font-size: 24px;
  line-height: 1;

  background: transparent;
  border: 0;
  border-radius: 10px;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 25%);
  }
`;

const titleStyle = css`
  margin: 0 40px 6px 0;

  font-size: 20px;
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: -0.5px;
`;

const descriptionStyle = css`
  margin: 0 0 14px;
  overflow: hidden;

  color: #8a94a8;
  font-size: 12px;
  line-height: 1.5;
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

  color: #18233d;
  text-align: left;

  background: #fff;
  border: 0;
  border-top: 1px solid #edf0f5;
  cursor: pointer;

  strong,
  small {
    display: block;
  }

  strong {
    font-size: 14px;
    font-weight: 800;
  }

  small {
    margin-top: 3px;
    color: #99a2b3;
    font-size: 11px;
  }

  &:disabled {
    cursor: wait;
    opacity: 0.62;
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 20%);
    outline-offset: -3px;
  }
`;

const providerLogoBaseStyle = css`
  display: grid;
  place-items: center;

  width: 42px;
  height: 42px;

  font-size: 15px;
  font-weight: 900;

  border-radius: 11px;
`;

const providerLogoStyles: Record<DirectionsProvider, string> = {
  NAVER: css`
    color: #fff;
    background: #03c75a;
  `,
  KAKAO: css`
    color: #231f20;
    background: #fee500;
  `,
  TMAP: css`
    color: #546176;
    background: #eef1f7;
  `,
};

const chevronStyle = css`
  color: #a6afbf;
  font-size: 22px;
`;

const statusStyle = css`
  margin: 12px 0 0;

  color: #7f8a9f;
  font-size: 12px;
  text-align: center;
`;

const errorStyle = css`
  margin-top: 12px;

  color: #d64545;
  font-size: 12px;
  text-align: center;

  p {
    margin: 0 0 8px;
  }

  button {
    padding: 8px 12px;

    color: #4356d8;
    font: inherit;
    font-weight: 800;

    background: #f1f3ff;
    border: 0;
    border-radius: 9px;
    cursor: pointer;
  }
`;
