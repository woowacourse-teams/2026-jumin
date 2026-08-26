import { Routes, Route } from 'react-router';
import { MainPage } from './src/pages/MainPage/MainPage';
import { SearchPage } from './src/pages/SearchPage/SearchPage';
import { DestinationPage } from './src/pages/DestinationPage/DestinationPage';
import { ParkingTimePage } from './src/pages/ParkingTimePage/ParkingTimePage';
import { ParkingRecommendationPage } from './src/pages/ParkingRecommendationPage/ParkingRecommendationPage';
import { ParkingDetailPage } from './src/pages/ParkingDetailPage/ParkingDetailPage';
import { RecentUsePage } from './src/pages/RecentUsePage/RecentUsePage';

const App = () => (
  <Routes>
    <Route path="/" element={<MainPage />} />
    <Route path="/search" element={<SearchPage />} />
    <Route path="/destination" element={<DestinationPage />} />
    <Route path="/parkingTimeSheet" element={<ParkingTimePage />} />
    <Route path="/parkingRecommendation" element={<ParkingRecommendationPage />} />
    <Route path="/parkingDetail" element={<ParkingDetailPage />} />
    <Route path="/recent" element={<RecentUsePage />} />
  </Routes>
);

export default App;
