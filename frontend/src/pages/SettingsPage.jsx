import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const [theme, setTheme] = useState(localStorage.getItem('stockr-theme') || 'dark');
  const navigate = useNavigate();

  // Theme toggle
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('stockr-theme', next);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--text3)', fontSize: 18, textDecoration: 'none', lineHeight: 1, padding: 4 }}>←</Link>
          <div>
            <div className="page-title">SETTINGS</div>
            <div className="page-subtitle">Preferences & tools</div>
          </div>
        </div>
      </div>

      {/* Theme Toggle */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Appearance
        </div>
        <div className="card" style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Theme</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              {theme === 'dark' ? 'Dark mode' : 'Light mode'}
            </div>
          </div>
          <button
            onClick={toggleTheme}
            style={{
              width: 52,
              height: 28,
              borderRadius: 14,
              border: 'none',
              background: theme === 'dark' ? 'var(--accent)' : 'var(--border)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 3,
              left: theme === 'dark' ? 27 : 3,
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
      </div>

      {/* Tools */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Tools
        </div>
        <div
          className="card stat-card-nav"
          style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          onClick={() => navigate('/settings/qr-labels')}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Print QR Code Labels</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              Generate a PDF of QR labels for locations, shelves & bins
            </div>
          </div>
          <span style={{ fontSize: 20, color: 'var(--text3)', opacity: 0.5, flexShrink: 0, marginLeft: 12 }}>›</span>
        </div>
      </div>

      {/* App Info */}
      <div style={{ padding: '32px 16px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
          Stockr Inventory
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, opacity: 0.5 }}>
          Built with care
        </div>
      </div>
    </div>
  );
}
