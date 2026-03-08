import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getLocation, addShelf, deleteShelf, updateLocation } from '../utils/api';
import QRModal from '../components/QRModal';
import LocationModal from '../components/LocationModal';

const TYPE_ICONS = { warehouse: '\ud83c\udfed', room: '\ud83d\udeaa', area: '\ud83d\udccd' };

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z"/>
  </svg>
);

export default function LocationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [qrModal, setQrModal] = useState(null);
  const [addingShelf, setAddingShelf] = useState(false);
  const [newShelfName, setNewShelfName] = useState('');

  const load = async () => {
    try {
      const data = await getLocation(id);
      setLocation(data);
    } catch (e) {
      toast.error('Location not found');
      navigate('/locations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="page"><div className="loading pulsing">Loading…</div></div>;
  if (!location) return null;

  const shelves = location.shelves
    ? location.shelves.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const shelfStats = location.shelf_stats || {};
  const containers = location.containers || [];

  const handleAddShelf = async () => {
    if (!newShelfName.trim()) return;
    try {
      await addShelf(id, newShelfName.trim());
      toast.success(`Shelf "${newShelfName.trim()}" added`);
      setNewShelfName('');
      setAddingShelf(false);
      load();
    } catch (e) {
      if (e.response?.status === 409) toast.error('Shelf already exists');
      else toast.error('Failed to add shelf');
    }
  };

  const handleDeleteShelf = async (shelfName) => {
    const stats = shelfStats[shelfName] || { item_count: 0, bin_count: 0 };
    const hasContent = stats.item_count > 0 || stats.bin_count > 0;
    const message = hasContent
      ? `Delete shelf "${shelfName}"?\n\n${stats.item_count} item(s) and ${stats.bin_count} bin(s) will be unassigned from this shelf.`
      : `Delete shelf "${shelfName}"?`;
    if (!window.confirm(message)) return;
    try {
      await deleteShelf(location.id, shelfName);
      toast.success(`Shelf "${shelfName}" deleted`);
      load();
    } catch (e) {
      toast.error('Failed to delete shelf');
    }
  };

  const handleEditSave = async (data) => {
    await updateLocation(location.id, data);
    toast.success('Updated!');
    setEditModal(false);
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/locations" style={{ color: 'var(--text3)', fontSize: 18, textDecoration: 'none', lineHeight: 1, padding: 4 }}>←</Link>
          <div>
            <div className="page-title">{location.name}</div>
            <div className="page-subtitle">{location.type}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditModal(true)}>Edit</button>
      </div>

      {/* Location image + description */}
      {location.image_url && (
        <div style={{ margin: '0 16px 16px', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <img src={location.image_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
        </div>
      )}
      {location.description && (
        <div style={{ padding: '0 16px 16px', fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>
          {location.description}
        </div>
      )}

      {/* Summary stats */}
      <div style={{ padding: '0 16px 20px', display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{shelves.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Shelves</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{containers.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Bins</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{location.total_items || 0}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Items</div>
        </div>
      </div>

      {/* Shelves section */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Shelves ({shelves.length})
          </div>
          {!addingShelf && (
            <button className="btn btn-ghost btn-sm" onClick={() => setAddingShelf(true)}>+ Add Shelf</button>
          )}
        </div>

        {addingShelf && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              value={newShelfName}
              onChange={e => setNewShelfName(e.target.value)}
              placeholder="Shelf name (e.g. A, Top, Left)"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddShelf();
                if (e.key === 'Escape') { setAddingShelf(false); setNewShelfName(''); }
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleAddShelf} disabled={!newShelfName.trim()}>Add</button>
            <button className="btn-icon" onClick={() => { setAddingShelf(false); setNewShelfName(''); }}>✕</button>
          </div>
        )}

        {shelves.length === 0 && !addingShelf ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No shelves yet
          </div>
        ) : (
          shelves.map(shelfName => {
            const stats = shelfStats[shelfName] || { item_count: 0, bin_count: 0 };
            return (
              <div key={shelfName} className="card" style={{ margin: '0 0 10px', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Shelf {shelfName}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                      {stats.item_count} {stats.item_count === 1 ? 'item' : 'items'} · {stats.bin_count} {stats.bin_count === 1 ? 'bin' : 'bins'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-icon" title="Shelf QR"
                      onClick={() => setQrModal({ data: `stockr://location/${location.id}/shelf/${shelfName}`, title: `${location.name} — Shelf ${shelfName}` })}>
                      ⬡
                    </button>
                    <button className="btn-icon btn-icon-danger" title="Delete shelf"
                      onClick={() => handleDeleteShelf(shelfName)}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bins section */}
      <div style={{ padding: '16px 16px 24px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Bins ({containers.length})
        </div>
        {containers.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No bins at this location
          </div>
        ) : (
          containers.map(c => (
            <div key={c.id} className="card" style={{ margin: '0 0 10px', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    {c.shelf ? `Shelf ${c.shelf}` : 'No shelf'} · {parseInt(c.item_count) || 0} {parseInt(c.item_count) === 1 ? 'item' : 'items'}
                  </div>
                </div>
                <span className="badge badge-green">{parseInt(c.item_count) || 0}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit modal */}
      {editModal && (
        <LocationModal
          location={location}
          onSave={handleEditSave}
          onClose={() => setEditModal(false)}
        />
      )}

      {/* QR modal */}
      {qrModal && (
        <QRModal
          data={qrModal.data}
          title={qrModal.title}
          onClose={() => setQrModal(null)}
        />
      )}
    </div>
  );
}
