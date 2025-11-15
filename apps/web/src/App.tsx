import { Routes, Route, Navigate } from 'react-router-dom';
import RootLayout from './components/RootLayout';
import SettingsPage from './pages/SettingsPage';
import WizardPage from './pages/WizardPage';

const App = () => {
  return (
    <RootLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/wizard" replace />} />
        <Route path="/wizard" element={<WizardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/wizard" replace />} />
      </Routes>
    </RootLayout>
  );
};

export default App;
