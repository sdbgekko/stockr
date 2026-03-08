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
      <NavLink to="/items" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">≡</span>
        <span>Items</span>
      </NavLink>
      <NavLink to="/containers" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">▣</span>
        <span>Bins</span>
      </NavLink>
      <NavLink to="/locations" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">◈</span>
        <span>Places</span>
      </NavLink>
    </nav>
  );
}

export default function App() {
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
          </Routes>
        </main>
        <Nav />
      </div>
    </BrowserRouter>
  );
}
