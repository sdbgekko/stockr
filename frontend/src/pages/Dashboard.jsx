import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStats, getItems } from '../utils/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getStats().then(setStats).catch(console.error);
    getItems().then(items => setRecent(items.slice(0, 8))).catch(console.error);
  }, []);

  const navCards = [
    { key: 'locations', value: stats?.locations, label: 'Locations', icon: '◈', path: '/locations' },
    { key: 'shelves', value: stats?.shelves, label: 'Shelves', icon: '▧', path: '/locations' },
    { key: 'containers', value: stats?.containers, label: 'Bins', icon: '▣', path: '/containers' },
    { key: 'items', value: stats?.items, label: 'Items', icon: '≡', path: '/items' },
  ];

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
        {navCards.map(card => (
          <div
            key={card.key}
            className="stat-card stat-card-nav"
            onClick={() => navigate(card.path)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-value">{card.value ?? '—'}</div>
              <span style={{ fontSize: 20, color: 'var(--text3)', opacity: 0.5 }}>›</span>
            </div>
            <div className="stat-label">{card.icon} {card.label}</div>
          </div>
        ))}
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
        {recent.map(item => {
          const detailPath = item.container_id
            ? `/containers/${item.container_id}`
            : item.location_id
              ? `/locations/${item.location_id}`
              : '/items';
          return (
            <div key={item.id} className="item-card" onClick={() => setSelectedItem(item)}>
              <div className="item-thumb">{item.image_url ? <img src={item.image_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}} /> : '📦'}</div>
              <div className="item-info">
                <div className="item-name">{item.name}</div>
                <div className="item-loc">
                  {[item.location_name, item.container_name, item.shelf && `Shelf ${item.shelf}`, item.bin && `Bin ${item.bin}`].filter(Boolean).join(' › ')}
                </div>
              </div>
              <div className="item-qty">×{item.quantity}</div>
            </div>
          );
        })}
      </div>

      {selectedItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedItem(null)}>
          <div className="modal">
            <div className="modal-handle" />
            {selectedItem.image_url && (
              <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden' }}>
                <img src={selectedItem.image_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div className="modal-title" style={{ marginBottom: 4 }}>{selectedItem.name}</div>
                <span className="badge badge-green">×{selectedItem.quantity} {selectedItem.unit}</span>
              </div>
            </div>
            {selectedItem.description && <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 12 }}>{selectedItem.description}</p>}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', lineHeight: 2 }}>
              {selectedItem.location_name && <div>📍 {selectedItem.location_name}</div>}
              {(selectedItem.shelf || selectedItem.container_shelf) && <div>🗄 Shelf: {selectedItem.shelf || selectedItem.container_shelf}</div>}
              {selectedItem.container_name && <div>📦 Bin: {selectedItem.container_name}</div>}
              {selectedItem.barcode && <div>🔖 {selectedItem.barcode}</div>}
            </div>
            {selectedItem.ai_labels?.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selectedItem.ai_labels.map(l => <span key={l} className="badge badge-purple">{l}</span>)}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setSelectedItem(null)}>Close</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setSelectedItem(null); navigate('/items', { state: { openItemId: selectedItem.id } }); }}>Edit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
