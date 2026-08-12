/** 상태·보조 정보를 알리는 작은 표시 요소들. */

import styled from '@emotion/styled';

import { colors } from './tokens';

export const ErrorText = styled.p`
  margin: 8px 0 0;
  color: ${colors.danger};
  font-size: 13px;
  line-height: 19px;
`;

export const Muted = styled.p`
  margin: 0;
  color: ${colors.muted};
  font-size: 14px;
  line-height: 21px;
`;

export const Badge = styled.span`
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  background: ${colors.tint};
  color: ${colors.primary};
  font-size: 12px;
  font-weight: 800;
`;

export const LoadingBlock = styled.div`
  display: grid;
  min-height: 180px;
  place-items: center;
  color: ${colors.muted};
  font-size: 14px;
`;
