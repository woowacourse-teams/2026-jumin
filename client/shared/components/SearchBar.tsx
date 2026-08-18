import styled from '@emotion/styled';

export default function SearchBar() {
  return (
    <MainContainer>
      <SearchIcon src="/image/searchIcon.svg" alt="검색 아이콘" />
      <SearchInput aria-label="목적지 검색" placeholder="어디에 방문하세요?" />
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
