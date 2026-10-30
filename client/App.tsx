import { lazy, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Outlet, Route, Routes } from 'react-router';

import { ErrorCard } from './shared/components/service/ErrorCard';
import { MapLayout } from './shared/maps/MapLayout';
import { HomePage } from './src/pages/HomePage/HomePage';

const AdminPage = lazy(() =>
  import('./src/pages/AdminPage/AdminPage').then((module) => ({
    default: module.AdminPage,
  })),
);

const ParkingSetupPage = lazy(() =>
  import('./src/pages/ParkingSetupPage/ParkingSetupPage').then((module) => ({
    default: module.ParkingSetupPage,
  })),
);

const ParkingRecommendPage = lazy(() =>
  import('./src/pages/ParkingRecommendPage/ParkingRecommendPage').then((module) => ({
    default: module.ParkingRecommendPage,
  })),
);

const SearchPage = lazy(() =>
  import('./src/pages/SearchPage/SearchPage').then((module) => ({
    default: module.SearchPage,
  })),
);

const RecentUsePage = lazy(() =>
  import('./src/pages/RecentUsePage/RecentUsePage').then((module) => ({
    default: module.RecentUsePage,
  })),
);

const SettingPage = lazy(() =>
  import('./src/pages/SettingPage/SettingPage').then((module) => ({
    default: module.SettingPage,
  })),
);

const LandingPage = lazy(() =>
  import('./src/pages/LandingPage/LandingPage').then((module) => ({
    default: module.LandingPage,
  })),
);

const App = () => (
  <ErrorBoundary
    fallbackRender={() => (
      <ErrorCard label="페이지를 불러오지 못했어요." onRetry={() => window.location.reload()} />
    )}
  >
    <Routes>
      <Route element={<MapLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/parkingsetup" element={<ParkingSetupPage />} />
        <Route path="/parkingRecommend" element={<ParkingRecommendPage />} />
      </Route>

      <Route
        element={
          <Suspense>
            <Outlet />
          </Suspense>
        }
      >
        <Route path="/search" element={<SearchPage />} />
        <Route path="/recent" element={<RecentUsePage />} />
        <Route path="/setting" element={<SettingPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/landing" element={<LandingPage />} />
      </Route>
    </Routes>
  </ErrorBoundary>
);

export default App;
