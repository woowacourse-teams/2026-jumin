import styled from '@emotion/styled';
import { useState } from 'react';
import SearchBar from '../../../shared/components/SearchBar';
import BottomNav from '../../../shared/components/BottomNav';

export default function SearchPage() {
  const [query, setQuery] = useState('');

  return (
    <MainContainer>
      <Body>
        <SearchBar autoFocus value={query} onChange={(event) => setQuery(event.target.value)} />
        <Footer>
          <BottomNav />
        </Footer>
      </Body>
    </MainContainer>
  );
}

const MainContainer = styled.div`
  width: 390px;
  height: 844px;
  margin: 0 auto;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 28px;
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
`;

const Footer = styled.footer`
  margin-top: auto;
  position: relative;
  flex-shrink: 0;
`;
