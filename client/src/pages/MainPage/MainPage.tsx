import styled from '@emotion/styled';
import SearchBar from '../../../shared/components/SearchBar';
import BottomNav from '../../../shared/components/BottomNav';
import CurrentLocationButton from './components/CurrentLocationButton';

export default function MainPage() {
  return (
    <MainContainer>
      <SearchBar />
      {/* 지도 */}
      <CurrentLocationButton />
      <BottomNav />
    </MainContainer>
  );
}

const MainContainer = styled.div`
  width: 390px;
  height: 844px;
  border-radius: 28px;
  border-color: #dce4f0;
`;
