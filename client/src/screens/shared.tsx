/** 여러 화면이 함께 쓰는 표시 요소와 헬퍼. */

import styled from '@emotion/styled';

import { ApiClientError } from '../api';
import { colors, SecondaryButton } from '../components';
import { type ParkingTarget } from '../domain';

export const AssetIcon = styled.img`
  display: block;
  width: 20px;
  height: 20px;
`;

export const Ellipsis = styled.span`
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const CandidateName = styled(Ellipsis)`
  margin-bottom: 3px;
  color: ${colors.text};
  font-size: 15px;
  font-weight: 800;
`;

export const CandidateAddress = styled(Ellipsis)`
  color: ${colors.muted};
  font-size: 13px;
`;

export const CenterState = styled.div`
  display: grid;
  min-height: 300px;
  place-items: center;
  padding: 36px 24px;
  text-align: center;
`;

export const BottomSheet = styled.div`
  position: absolute;
  z-index: 4;
  right: 0;
  bottom: var(--nav-height);
  left: 0;
  padding: 12px var(--gutter) var(--gutter);
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  background: #fff;
  box-shadow: 0 -10px 28px rgba(20, 33, 61, 0.1);
`;

export const SheetHandle = styled.div`
  width: 42px;
  height: 4px;
  margin: 0 auto 14px;
  border-radius: 999px;
  background: #c4ccd8;
`;

export const Title = styled.h1`
  margin: 0;
  font-size: var(--font-title);
  font-weight: 850;
  line-height: 30px;
`;

export const SmallButton = styled(SecondaryButton)`
  min-height: 40px;
  padding: 8px 11px;
  font-size: 13px;
`;

export const ErrorPico = styled.img`
  display: block;
  width: 128px;
  height: 118px;
  margin: 0 auto 24px;
`;

export const apiMessage = (error: unknown) => {
  if (!(error instanceof ApiClientError)) return '문제가 생겼어요. 잠시 후 다시 시도해주세요.';
  if (error.kind === 'RATE_LIMIT') return '검색 요청이 많아요. 잠시 후 다시 시도해주세요.';
  if (error.kind === 'CONTRACT') return '최신 정보를 확인할 수 없어요. 새로 검색해주세요.';
  if (error.kind === 'TIMEOUT') return '응답이 늦어지고 있어요. 다시 시도해주세요.';
  return '네트워크 연결을 확인하고 다시 시도해주세요.';
};

export const toTarget = (lot: ParkingTarget): ParkingTarget => ({
  parkingLotId: lot.parkingLotId,
  name: lot.name,
  address: lot.address,
  location: lot.location,
});
