import { Routes, Route } from 'react-router';
import { MainPage } from './src/pages/MainPage/MainPage';
import { SearchPage } from './src/pages/SearchPage/SearchPage';
import { ParkingDetailPage } from './src/pages/ParkingDetailPage/ParkingDetailPage';
import { RecentUsePage } from './src/pages/RecentUsePage/RecentUsePage';
import { ParkingSetupPage } from './src/pages/ParkingSetupPage/ParkingSetupPage';
import { ParkingRecommendPage } from './src/pages/ParkingRecommendationPage/ParkingRecommendPage';

const App = () => (
  <Routes>
    <Route path="/" element={<MainPage />} />
    <Route path="/search" element={<SearchPage />} />
    <Route path="/parkingsetup" element={<ParkingSetupPage />} />
    <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
    <Route path="/parkingDetail" element={<ParkingDetailPage />} />
    <Route path="/recent" element={<RecentUsePage />} />
  </Routes>
);

export default App;
