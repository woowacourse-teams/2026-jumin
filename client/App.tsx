import { Routes, Route } from 'react-router';
import { SearchPage } from './src/pages/SearchPage/SearchPage';
import { ParkingDetailPage } from './src/pages/ParkingDetailPage/ParkingDetailPage';
import { RecentUsePage } from './src/pages/RecentUsePage/RecentUsePage';
import { ParkingSetupPage } from './src/pages/ParkingSetupPage/ParkingSetupPage';
import { ParkingRecommendPage } from './src/pages/ParkingRecommendPage/ParkingRecommendPage';
import { MapLayout } from './shared/maps/MapLayout';
import { HomePage } from './src/pages/HomePage/HomePage';

const App = () => (
  <Routes>
    <Route path="/" element={<HomePage />} />

    <Route element={<MapLayout />}>
      <Route path="/parkingsetup" element={<ParkingSetupPage />} />
      <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
      <Route path="/parkingDetail" element={<ParkingDetailPage />} />
    </Route>

    <Route path="/search" element={<SearchPage />} />
    <Route path="/recent" element={<RecentUsePage />} />
  </Routes>
);

export default App;
