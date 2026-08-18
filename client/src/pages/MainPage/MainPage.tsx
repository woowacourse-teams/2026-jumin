import styled from '@emotion/styled';
import SearchBar from '../../../shared/components/SearchBar';
import BottomNav from '../../../shared/components/BottomNav';
import CurrentLocationButton from './components/CurrentLocationButton';
import { useNavigate } from 'react-router';

export default function MainPage() {
  const navigate = useNavigate();
  return (
    <MainContainer>
      <Body>
        <SearchBar onClick={() => navigate('/search')} />
        {/* 지도 */}
        <Footer>
          <CurrentLocationButton />
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
