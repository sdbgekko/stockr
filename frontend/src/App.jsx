import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import ItemsPage from './pages/ItemsPage';
import ContainersPage from './pages/ContainersPage';
import LocationsPage from './pages/LocationsPage';
import LocationDetail from './pages/LocationDetail';
import ShelfDetail from './pages/ShelfDetail';
import BinDetail from './pages/BinDetail';
import ScanPage from './pages/ScanPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

function Nav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">⬡</span>
        <span>Overview</span>
      </NavLink>
      <NavLink to="/scan" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon scan-btn">◎</span>
        <span>Scan</span>
      </NavLink>
      <NavLink to="/settings" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">⚙</span>
        <span>Settings</span>
      </NavLink>
    </nav>
  );
}

export default function App() {
  useEffect(() => {
    const saved = localStorage.getItem('stockr-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <Toaster position="top-center" toastOptions={{ duration: 2500, style: { background: '#1a1a2e', color: '#e2e8f0', border: '1px solid #334155' } }} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/containers" element={<ContainersPage />} />
            <Route path="/containers/:id" element={<BinDetail />} />
            <Route path="/locations" element={<LocationsPage />} />
            <Route path="/locations/:id" element={<LocationDetail />} />
            <Route path="/locations/:id/shelves/:shelf" element={<ShelfDetail />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <Nav />
      </div>
    </BrowserRouter>
  );
}
