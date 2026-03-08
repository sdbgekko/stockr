import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getItems, updateItem, deleteItem, getLocations, getContainers } from '../utils/api';
import ItemForm from '../components/ItemForm';

function ItemDetail({ item, onClose, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    await deleteItem(item.id);
    toast.success('Deleted');
    onDeleted();
  };

  if (editing) {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditing(false)}>
        <div className="modal">
          <div className="modal-handle" />
          <div className="modal-title">Edit Item</div>
          <ItemForm
            initial={{ ...item, labels: item.ai_labels || [] }}
            capturedImage={item.image_url}
            onSave={async (data) => { await updateItem(item.id, data); toast.success('Updated!'); setEditing(false); onSaved(); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        {item.image_url && (
          <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden' }}>
            <img src={item.image_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div className="modal-title" style={{ marginBottom: 4 }}>{item.name}</div>
            <span className="badge badge-green">×{item.quantity} {item.unit}</span>
          </div>
        </div>
        {item.description && <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 12 }}>{item.description}</p>}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', lineHeight: 2 }}>
          {item.location_name && <div>📍 {item.location_name}</div>}
          {item.container_name && <div>📦 {item.container_name}</div>}
          {(item.shelf || item.container_shelf) && <div>🗄 Shelf: {item.shelf || item.container_shelf}</div>}
          {(item.bin || item.container_bin) && <div>🔲 Bin: {item.bin || item.container_bin}</div>}
          {item.barcode && <div>🔖 {item.barcode}</div>}
        </div>
        {item.ai_labels?.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {item.ai_labels.map(l => <span key={l} className="badge badge-purple">{l}</span>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 20, alignItems: 'center' }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setEditing(true)}>Edit</button>
          <button className="btn-icon btn-icon-danger" title="Delete" onClick={handleDelete}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ItemsPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getItems({ search: search || undefined });
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">ITEMS</div>
          <div className="page-subtitle">{items.length} found</div>
        </div>
      </div>

      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search items, barcodes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading pulsing">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🔍</div>
          <div className="empty-text">{search ? 'No items match your search' : 'No items yet'}</div>
        </div>
      ) : (
        <div className="item-list">
          {items.map(item => (
            <div key={item.id} className="item-card" onClick={() => setSelected(item)}>
              <div className="item-thumb">
                {item.image_url
                  ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                  : '📦'}
              </div>
              <div className="item-info">
                <div className="item-name">{item.name}</div>
                <div className="item-loc">
                  {[item.location_name, item.container_name,
                    (item.shelf || item.container_shelf) && `Shelf ${item.shelf || item.container_shelf}`,
                    (item.bin || item.container_bin) && `Bin ${item.bin || item.container_bin}`
                  ].filter(Boolean).join(' › ') || 'No location'}
                </div>
              </div>
              <div className="item-qty">×{item.quantity}</div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <ItemDetail
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); }}
          onDeleted={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}
