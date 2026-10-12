import { Routes, Route } from 'react-router';
import { SearchPage } from './src/pages/SearchPage/SearchPage';
import { ParkingDetailPage } from './src/pages/ParkingDetailPage/ParkingDetailPage';
import { RecentUsePage } from './src/pages/RecentUsePage/RecentUsePage';
import { ParkingSetupPage } from './src/pages/ParkingSetupPage/ParkingSetupPage';
import { ParkingRecommendPage } from './src/pages/ParkingRecommendPage/ParkingRecommendPage';
import { MapLayout } from './shared/maps/MapLayout';
import { HomePage } from './src/pages/HomePage/HomePage';
import { AdminPage } from './src/pages/AdminPage/AdminPage';
import { RandingPage } from './src/pages/RandingPage/RandingPage';
import { SettingPage } from './src/pages/SettingPage/SettingPage';

const App = () => (
  <Routes>
    <Route element={<MapLayout />}>
      <Route path="/" element={<HomePage />} />

      <Route path="/parkingsetup" element={<ParkingSetupPage />} />
      <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
      <Route path="/parkingDetail" element={<ParkingDetailPage />} />
    </Route>

    <Route path="/search" element={<SearchPage />} />
    <Route path="/recent" element={<RecentUsePage />} />
    <Route path="/setting" element={<SettingPage />} />
    <Route path="/admin" element={<AdminPage />} />
    <Route path="/randing" element={<RandingPage />} />
  </Routes>
);

export default App;
