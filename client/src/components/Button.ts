/** 기본 버튼. */

import styled from '@emotion/styled';

import { colors } from './tokens';

export const PrimaryButton = styled.button`
  width: 100%;
  min-height: 58px;
  padding: 14px 18px;
  border: 0;
  border-radius: 16px;
  background: ${colors.primary};
  color: #fff;
  font-weight: 800;
  font-size: 16px;

  &:active:not(:disabled) {
    background: ${colors.pressed};
  }

  &:disabled {
    background: #c4ccd8;
    cursor: not-allowed;
  }
`;

export const SecondaryButton = styled.button`
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid ${colors.line};
  border-radius: 12px;
  background: ${colors.surface};
  color: ${colors.accent};
  font-weight: 700;

  &:active:not(:disabled) {
    background: ${colors.tint};
  }

  &:disabled {
    color: #a4a9b7;
    cursor: not-allowed;
  }
`;
