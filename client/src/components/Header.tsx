/** 화면 상단 헤더와 아이콘 버튼. */

import styled from '@emotion/styled';

import { colors } from './tokens';

export const HeaderBar = styled.header`
  position: relative;
  z-index: 4;
  display: flex;
  min-height: var(--header-height);
  align-items: center;
  gap: 4px;
  padding: var(--safe-top) 12px 0;
  background: rgba(255, 255, 255, 0.96);

  @media (min-width: 768px) {
    flex: 0 0 auto;
    width: var(--panel-width);
    margin-left: var(--rail-width);
    border-bottom: 1px solid ${colors.line};
  }
`;

export const HeaderTitle = styled.h1`
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 15px;
  font-weight: 800;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const IconButton = styled.button`
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font-size: 25px;
  line-height: 1;

  &:active {
    background: ${colors.background};
  }
`;

export const Header = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <HeaderBar>
    <IconButton type="button" aria-label="뒤로 가기" onClick={onBack}>
      ‹
    </IconButton>
    <HeaderTitle>{title}</HeaderTitle>
  </HeaderBar>
);
