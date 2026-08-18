import { Routes, Route } from 'react-router';
import MainPage from './src/pages/MainPage/MainPage';
import SearchPage from './src/pages/SearchPage/SearchPage';
import DestinationPage from './src/pages/DestinationPage/DestinationPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/destination" element={<DestinationPage />} />
    </Routes>
  );
}

export default App;
