import styled from '@emotion/styled';
import { ChangeEventHandler, MouseEventHandler } from 'react';

interface Props {
  onClick?: MouseEventHandler<HTMLDivElement>;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  value?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
}

export default function SearchBar({ onClick, onChange, value, readOnly, autoFocus }: Props) {
  return (
    <MainContainer onClick={onClick}>
      <SearchIcon src="/image/searchIcon.svg" alt="검색 아이콘" />
      <SearchInput
        aria-label="목적지 검색"
        placeholder="어디에 방문하세요?"
        value={value}
        readOnly={readOnly}
        autoFocus={autoFocus}
        onChange={onChange}
      />
    </MainContainer>
  );
}

const MainContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  width: 100%;
  max-width: 358px;
  height: 54px;
  margin: 16px auto 0;
  padding: 0 16px;
  box-sizing: border-box;

  border: 1px solid #155eef;
  border-radius: 16px;
`;

const SearchIcon = styled.img`
  width: 20px;
  height: 20px;
  flex-shrink: 0;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
`;
