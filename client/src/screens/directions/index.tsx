/** 외부 지도 앱 선택 시트. */

import styled from '@emotion/styled';

import { colors, DialogSheet, ErrorText, Muted, SecondaryButton } from '../../components';
import { type DirectionsProvider, type ParkingTarget } from '../../domain';

export const DirectionButton = styled.button`
  display: grid;
  width: 100%;
  min-height: 75px;
  grid-template-columns: 44px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border: 0;
  border-bottom: 1px solid ${colors.line};
  background: #fff;
  text-align: left;
`;

export const ProviderLogo = styled.span<{ provider: DirectionsProvider }>`
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 10px;
  background: ${({ provider }) => (provider === 'NAVER' ? '#03c75a' : provider === 'KAKAO' ? '#fee500' : '#eef1f8')};
  color: ${({ provider }) => (provider === 'NAVER' ? '#fff' : provider === 'KAKAO' ? '#231f20' : '#52606f')};
  font-weight: 900;
`;

export const DirectionsSheet = ({
  target,
  error,
  onOpen,
  onFallback,
  onClose,
}: {
  target: ParkingTarget;
  error: string;
  onOpen: (provider: DirectionsProvider) => void;
  onFallback: () => void;
  onClose: () => void;
}) => (
  <DialogSheet title="어떤 앱으로 갈까요?" onClose={onClose}>
    <Muted css={{ marginBottom: 10 }}>{target.name}까지 길찾기를 시작합니다.</Muted>
    {(
      [
        ['NAVER', '네이버 지도', 'N'],
        ['KAKAO', '카카오맵', 'K'],
        ['TMAP', 'TMAP', 'T'],
      ] as const
    ).map(([provider, label, mark]) => (
      <DirectionButton key={provider} type="button" onClick={() => onOpen(provider)}>
        <ProviderLogo provider={provider}>{mark}</ProviderLogo>
        <span>
          <strong>{label}</strong>
          <Muted>목적지만 전달</Muted>
        </span>
        <span aria-hidden>›</span>
      </DirectionButton>
    ))}
    {error && (
      <div>
        <ErrorText>{error}</ErrorText>
        <SecondaryButton type="button" css={{ width: '100%', marginTop: 10 }} onClick={onFallback}>
          네이버 지도 웹으로 열기
        </SecondaryButton>
      </div>
    )}
  </DialogSheet>
);
