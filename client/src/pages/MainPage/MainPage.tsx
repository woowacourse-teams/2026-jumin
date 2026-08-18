import styled from '@emotion/styled';
import SearchBar from '../../../shared/components/SearchBar';
import BottomNav from '../../../shared/components/BottomNav';
import CurrentLocationButton from './components/CurrentLocationButton';

export default function MainPage() {
  return (
    <MainContainer>
      <Body>
        <SearchBar />
        {/* 지도 */}
        <CurrentLocationButton />

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
`;
