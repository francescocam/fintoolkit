import { Routes, Route, Navigate } from 'react-router-dom';
import RootLayout from './components/RootLayout';
import SettingsPage from './pages/SettingsPage';
import DataromaScreenerPage from './pages/DataromaScreenerPage';
import DataromaUniversePage from './pages/DataromaUniversePage';
import DataromaMatchesPage from './pages/DataromaMatchesPage';
import HomePage from './pages/HomePage';
import { DataromaScreenerSessionProvider } from './hooks/useDataromaScreenerSession';

const App = () => {
  return (
    <RootLayout>
      <DataromaScreenerSessionProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dataroma-screener" element={<DataromaScreenerPage />} />
          <Route path="/dataroma-screener/universe" element={<DataromaUniversePage />} />
          <Route path="/dataroma-screener/matches" element={<DataromaMatchesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DataromaScreenerSessionProvider>
    </RootLayout>
  );
};

export default App;
