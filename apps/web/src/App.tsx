import { Routes, Route, Navigate } from 'react-router-dom';
import RootLayout from './components/RootLayout';
import SettingsPage from './pages/SettingsPage';
import DataromaScreenerPage from './pages/DataromaScreenerPage';
import DataromaUniversePage from './pages/DataromaUniversePage';
import HomePage from './pages/HomePage';

const App = () => {
  return (
    <RootLayout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dataroma-screener" element={<DataromaScreenerPage />} />
        <Route path="/dataroma-screener/universe" element={<DataromaUniversePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RootLayout>
  );
};

export default App;
