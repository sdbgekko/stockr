import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import DrillBrowser from './pages/DrillBrowser';
import EntityDetail from './pages/EntityDetail';
import ScanPage from './pages/ScanPage';
import SettingsPage from './pages/SettingsPage';
import QrLabelsPage from './pages/QrLabelsPage';
import './App.css';

export default function App() {
  useEffect(() => {
    const saved = localStorage.getItem('shelfsnap-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 2500,
            style: { background: '#1a1a2e', color: '#e2e8f0', border: '1px solid #334155' },
          }}
        />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<DrillBrowser />} />
            <Route path="/entities/:id" element={<EntityDetail />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/qr-labels" element={<QrLabelsPage />} />
            {/* Legacy routes redirect home for now */}
            <Route path="/items" element={<Navigate to="/" replace />} />
            <Route path="/containers" element={<Navigate to="/" replace />} />
            <Route path="/locations" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
