import { css } from '@emotion/css';
import { useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import type { Destination } from '../../../api/contracts';
import { DestinationMapOverlay } from '../../../shared/components/DestinationMapOverlay';
import { NaverMap } from '../../../shared/components/NaverMap';
import { SearchBar } from '../../../shared/components/SearchBar';

interface NavigationState {
  destination?: Destination;
}

export const DestinationPage = () => {
  const navigate = useNavigate();
  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bottomSheetRef = useRef<HTMLElement>(null);
  const { state } = useLocation();
  const destination = (state as NavigationState | null)?.destination;

  useLayoutEffect(() => {
    if (!map || !destination || !headerRef.current || !bottomSheetRef.current) return;

    const centerDestination = () => {
      map.refresh(true);

      if (!headerRef.current || !bottomSheetRef.current) return;

      const mapRect = map.getElement().getBoundingClientRect();
      const headerBottomY = headerRef.current.getBoundingClientRect().bottom - mapRect.top;
      const bottomSheetTopY = bottomSheetRef.current.getBoundingClientRect().top - mapRect.top;

      if (bottomSheetTopY <= headerBottomY) return;

      const visibleAreaCenterY = (headerBottomY + bottomSheetTopY) / 2;
      const destinationPosition = new naver.maps.LatLng(destination.latitude, destination.longitude);
      const projection = map.getProjection();
      const destinationOffset = projection.fromCoordToOffset(destinationPosition);
      const mapCenterOffset = new naver.maps.Point(map.getSize().width / 2, map.getSize().height / 2);
      const targetCenterOffset = new naver.maps.Point(
        destinationOffset.x,
        mapCenterOffset.y + destinationOffset.y - visibleAreaCenterY,
      );

      map.setCenter(projection.fromOffsetToCoord(targetCenterOffset));
    };

    centerDestination();
    window.addEventListener('resize', centerDestination);

    return () => window.removeEventListener('resize', centerDestination);
  }, [destination, map]);

  if (!destination) return <Navigate to="/search" replace />;

  return (
    <main
      className={css`
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      `}
    >
      <NaverMap latitude={destination.latitude} longitude={destination.longitude} onMapReady={setMap} />
      <DestinationMapOverlay
        map={map}
        latitude={destination.latitude}
        longitude={destination.longitude}
        title={destination.name}
      />

      <div
        ref={headerRef}
        className={css`
          position: relative;
          z-index: 1;
        `}
      >
        <SearchBar readOnly onClick={() => navigate('/search')} />
      </div>

      <section
        ref={bottomSheetRef}
        className={css`
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          z-index: 1;
          padding: 24px 16px max(20px, env(safe-area-inset-bottom));
          border-radius: 28px 28px 0 0;
          background: white;
          box-sizing: border-box;
        `}
        aria-label="선택한 목적지"
      >
        <button
          className={css`
            position: absolute;
            top: 16px;
            right: 16px;
            width: 32px;
            height: 32px;
            padding: 0;
            border: 0;
            background: transparent;
            color: #98a2b3;
            font-size: 22px;
            cursor: pointer;
          `}
          type="button"
          aria-label="목적지 선택 취소"
          onClick={() => navigate('/search')}
        >
          ×
        </button>

        <h1
          className={css`
            margin: 0 40px 4px 0;
            color: #14294c;
            font-size: 18px;
            line-height: 1.4;
          `}
        >
          {destination.name}
        </h1>
        <p
          className={css`
            margin: 0;
            overflow: hidden;
            color: #7f8b9d;
            font-size: 12px;
            text-overflow: ellipsis;
            white-space: nowrap;
          `}
        >
          {destination.roadAddress ?? destination.address}
        </p>

        <button
          className={css`
            width: 100%;
            height: 52px;
            margin-top: 20px;
            border: 0;
            border-radius: 12px;
            background: #4356d8;
            color: white;
            font-size: 14px;
            font-weight: 700;
            cursor: pointer;

            &:hover,
            &:focus-visible {
              background: #1249c4;
            }
          `}
          type="button"
          onClick={() => navigate('/parkingTimeSheet', { state: { destination } })}
        >
          다음
        </button>
      </section>
    </main>
  );
};
