import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStats, getItems } from '../utils/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    getStats().then(setStats).catch(console.error);
    getItems().then(items => setRecent(items.slice(0, 5))).catch(console.error);
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">STOCKR</div>
          <div className="page-subtitle">Inventory Tracker</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/scan')}>
          ◎ Scan
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.items ?? '—'}</div>
          <div className="stat-label">Item Types</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalQuantity ?? '—'}</div>
          <div className="stat-label">Total Units</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.containers ?? '—'}</div>
          <div className="stat-label">Bins / Boxes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.locations ?? '—'}</div>
          <div className="stat-label">Locations</div>
        </div>
      </div>

      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Recently Updated
        </div>
        {recent.length === 0 && (
          <div className="empty">
            <div className="empty-icon">📦</div>
            <div className="empty-text">No items yet — tap Scan to add your first item</div>
          </div>
        )}
        {recent.map(item => (
          <div key={item.id} className="item-card" onClick={() => navigate('/items')}>
            <div className="item-thumb">{item.image_url ? <img src={item.image_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}} /> : '📦'}</div>
            <div className="item-info">
              <div className="item-name">{item.name}</div>
              <div className="item-loc">
                {[item.location_name, item.container_name, item.shelf && `Shelf ${item.shelf}`, item.bin && `Bin ${item.bin}`].filter(Boolean).join(' › ')}
              </div>
            </div>
            <div className="item-qty">×{item.quantity}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
