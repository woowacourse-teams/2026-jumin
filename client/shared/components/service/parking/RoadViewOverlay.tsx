import { useEffect, useRef, useState } from 'react';

import { css } from '@emotion/css';
import * as Sentry from '@sentry/react';
import ReactModal from 'react-modal';

import { loadNaverMaps } from '../../../maps/loadNaverMaps';
import { color } from '../../../../src/theme/color';
import { CloseIcon } from '../../ui/icons';
import { typography } from '../../../../src/theme/typography';

if (typeof document !== 'undefined') {
  const appElement = document.querySelector<HTMLElement>('#root, #storybook-root');
  if (appElement) ReactModal.setAppElement(appElement);
}

interface Props {
  parkingLotName: string;
  parkingLotAddress: string;
  latitude: number;
  longitude: number;
  onRequestClose: () => void;
}

type RoadViewState = 'LOADING' | 'READY' | 'UNAVAILABLE' | 'ERROR';

const getPanoramaStatus = (event: unknown) => {
  if (typeof event === 'string') return event;

  if (typeof event === 'object' && event !== null && 'status' in event) {
    const status = event.status;
    return typeof status === 'string' ? status : null;
  }

  return null;
};

export const RoadViewOverlay = ({
  parkingLotName,
  parkingLotAddress,
  latitude,
  longitude,
  onRequestClose,
}: Props) => {
  const panoramaContainerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<naver.maps.Panorama | null>(null);
  const statusListenerRef = useRef<naver.maps.MapEventListener | null>(null);
  const initListenerRef = useRef<naver.maps.MapEventListener | null>(null);
  const parkingMarkerRef = useRef<naver.maps.Marker | null>(null);
  const [roadViewState, setRoadViewState] = useState<RoadViewState>('LOADING');

  useEffect(() => {
    let isCancelled = false;

    const initializePanorama = async () => {
      try {
        await loadNaverMaps();

        if (isCancelled || !panoramaContainerRef.current) return;

        const parkingPosition = new naver.maps.LatLng(latitude, longitude);

        const panorama = new naver.maps.Panorama(panoramaContainerRef.current, {
          position: parkingPosition,
          visible: true,
          aroundControl: true,
          zoomControl: false,
        });

        const parkingMarker = new naver.maps.Marker({
          position: parkingPosition,
          title: `${parkingLotName} 위치`,
        });
        parkingMarkerRef.current = parkingMarker;

        initListenerRef.current = panorama.addListener('init', () => {
          if (isCancelled) return;

          parkingMarker.setMap(panorama as unknown as naver.maps.Map);

          const targetPov = panorama.getProjection().fromCoordToPov(parkingPosition);
          if (targetPov) {
            panorama.setPov(targetPov);
          }
        });

        panoramaRef.current = panorama;
        statusListenerRef.current = panorama.addListener('pano_status', (event: unknown) => {
          if (isCancelled) return;

          setRoadViewState(getPanoramaStatus(event) === 'OK' ? 'READY' : 'UNAVAILABLE');
        });
      } catch (error) {
        if (isCancelled) return;

        Sentry.captureException(error, {
          tags: {
            feature: 'naver-road-view',
            operation: 'initialize-panorama',
          },
        });
        setRoadViewState('ERROR');
      }
    };

    void initializePanorama();

    return () => {
      isCancelled = true;

      if (statusListenerRef.current && panoramaRef.current) {
        panoramaRef.current.removeListener(statusListenerRef.current);
      }

      if (initListenerRef.current && panoramaRef.current) {
        panoramaRef.current.removeListener(initListenerRef.current);
      }

      parkingMarkerRef.current?.setMap(null);
      panoramaRef.current?.setVisible(false);

      panoramaRef.current = null;
      statusListenerRef.current = null;
      initListenerRef.current = null;
      parkingMarkerRef.current = null;
    };
  }, [latitude, longitude, parkingLotName]);

  const hasStatusMessage = roadViewState !== 'READY';

  return (
    <ReactModal
      isOpen
      onRequestClose={onRequestClose}
      contentLabel={`${parkingLotName} 로드뷰`}
      overlayClassName={overlayStyle}
      className={contentStyle}
      shouldCloseOnOverlayClick={false}
    >
      <header className={headerStyle}>
        <button
          className={closeButtonStyle}
          type="button"
          aria-label="로드뷰 닫기"
          onClick={onRequestClose}
        >
          <CloseIcon size={28} aria-hidden="true" />
        </button>

        <div className={headerTextStyle}>
          <h2>{parkingLotName}</h2>
          <p>{parkingLotAddress}</p>
        </div>
      </header>

      <div ref={panoramaContainerRef} className={panoramaStyle} aria-label="로드뷰" />

      {hasStatusMessage && (
        <div className={statusStyle} role={roadViewState === 'ERROR' ? 'alert' : 'status'}>
          {roadViewState === 'LOADING' && <p>로드뷰를 불러오고 있어요.</p>}
          {roadViewState === 'UNAVAILABLE' && <p>이 주차장 주변에는 로드뷰가 없어요.</p>}
          {roadViewState === 'ERROR' && <p>로드뷰를 불러오지 못했어요.</p>}
        </div>
      )}
    </ReactModal>
  );
};

const overlayStyle = css`
  position: fixed;
  inset: 0;
  z-index: 3000;

  background: ${color.background.inverse};

  @media (min-width: 431px) and (hover: hover) and (pointer: fine) {
    inset: 50% auto auto 50%;
    width: 430px;
    height: min(844px, 100dvh);
    transform: translate(-50%, -50%);
    border-radius: 28px;
    overflow: hidden;
  }
`;

const contentStyle = css`
  position: relative;

  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;

  background: ${color.background.inverse};
  outline: none;
`;

const headerStyle = css`
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 2;

  display: flex;
  align-items: flex-start;
  gap: 12px;

  padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 24px;

  color: ${color.text.inverse};
  background: linear-gradient(rgb(16 27 55 / 80%), rgb(16 27 55 / 0%));
  pointer-events: none;
`;

const closeButtonStyle = css`
  display: grid;
  flex: 0 0 44px;
  place-items: center;

  width: 44px;
  height: 44px;
  padding: 0;

  color: ${color.icon.inverse};

  background: rgb(16 27 55 / 64%);
  border: 1px solid rgb(255 255 255 / 25%);
  border-radius: 14px;
  cursor: pointer;
  pointer-events: auto;

  &:focus-visible {
    outline: 3px solid rgb(255 255 255 / 80%);
    outline-offset: 3px;
  }
`;

const headerTextStyle = css`
  min-width: 0;
  padding-top: 3px;
  text-shadow: 0 1px 4px rgb(0 0 0 / 20%);

  h2,
  p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h2 {
    ${typography.titleCard};
  }

  p {
    margin-top: 3px;
    color: rgb(255 255 255 / 78%);
    ${typography.caption};
  }
`;

const panoramaStyle = css`
  width: 100%;
  height: 100%;
  background: ${color.background.inverse};
`;

const statusStyle = css`
  position: absolute;
  top: 50%;
  right: 24px;
  left: 24px;
  z-index: 1;

  padding: 18px 20px;

  color: ${color.text.primary};
  text-align: center;

  background: rgb(255 255 255 / 94%);
  border-radius: 16px;
  box-shadow: 0 10px 30px rgb(16 27 55 / 18%);
  transform: translateY(-50%);

  p {
    margin: 0;
    ${typography.label};
  }
`;
