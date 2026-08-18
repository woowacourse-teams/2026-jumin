import { Routes, Route } from 'react-router';
import MainPage from './src/pages/MainPage/MainPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />;
    </Routes>
  );
}

export default App;
