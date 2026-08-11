/** 홈 화면. 지도 위에 검색 진입점과 현재 위치 버튼을 얹는다. */

import styled from '@emotion/styled';

import { location, search } from '../../assets';
import { BottomNav, colors, IconButton, Screen } from '../../components';
import { type Coordinate } from '../../domain';
import { MapView } from '../../map';
import { AssetIcon } from '../shared';

export const GANGNAM_STATION = { latitude: 37.4981, longitude: 127.0279 };
/** 추천 결과 화면 carousel에 노출하는 상위 카드 수 */

export const SearchButton = styled.button`
  position: absolute;
  z-index: 5;
  top: calc(10px + env(safe-area-inset-top));
  left: 16px;
  display: flex;
  width: calc(100% - 32px);
  min-height: 54px;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  border: 1.5px solid transparent;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 6px 9px rgba(20, 33, 61, 0.1);
  color: ${colors.muted};
  font-size: 15px;
  font-weight: 600;
  text-align: left;

  &:hover,
  &:focus-visible {
    border-color: ${colors.primary};
  }
`;

export const LocationButton = styled(IconButton)`
  position: absolute;
  z-index: 5;
  right: 16px;
  bottom: calc(100px + env(safe-area-inset-bottom));
  width: 46px;
  height: 46px;
  border: 0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 5px 18px rgba(31, 42, 78, 0.18);
`;

export const HomeScreen = ({
  currentLocation,
  locating,
  mapFocusToken,
  onSearch,
  onLocate,
  onNearby,
  onHome,
  onRecent,
}: {
  currentLocation: Coordinate | null;
  locating: boolean;
  mapFocusToken: number;
  onSearch: () => void;
  onLocate: () => void;
  onNearby: () => void;
  onHome: () => void;
  onRecent: () => void;
}) => (
  <Screen bottomNav css={{ position: 'relative', height: '100dvh', paddingBottom: 0, overflow: 'hidden' }}>
    <MapView
      center={currentLocation ?? GANGNAM_STATION}
      currentLocation={currentLocation}
      focusToken={mapFocusToken}
      height="100dvh"
    />
    <SearchButton type="button" onClick={onSearch}>
      <AssetIcon src={search} alt="" />
      어디에 방문하세요?
    </SearchButton>
    <LocationButton type="button" aria-label="현재 위치로 이동" disabled={locating} onClick={onLocate}>
      <AssetIcon src={location} alt="" css={{ opacity: locating ? 0.4 : 1 }} />
    </LocationButton>
    <BottomNav active="HOME" onNearby={onNearby} onHome={onHome} onRecent={onRecent} />
  </Screen>
);
