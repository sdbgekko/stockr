import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getLocations, createLocation, updateLocation, deleteLocation } from '../utils/api';
import QRModal from '../components/QRModal';

function LocationModal({ location, onSave, onClose }) {
  const [form, setForm] = useState({
    name: location?.name || '',
    type: location?.type || 'room',
    description: location?.description || '',
    shelves: location?.shelves || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">{location ? 'Edit Location' : 'New Location'}</div>
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Garage, Warehouse A" />
        </div>
        <div className="form-group">
          <label className="form-label">Type</label>
          <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
            <option value="warehouse">Warehouse</option>
            <option value="room">Room</option>
            <option value="area">Area</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
        </div>
        <div className="form-group">
          <label className="form-label">Shelves (comma separated)</label>
          <input className="form-input" value={form.shelves} onChange={e => set('shelves', e.target.value)} placeholder="e.g. A, B, C or 1, 2, 3" />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onSave(form)} disabled={!form.name.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}

const TYPE_ICONS = { warehouse: '🏭', room: '🚪', area: '📍' };

export default function LocationsPage() {
  const [locations, setLocations] = useState([]);
  const [modal, setModal] = useState(null);
  const [qrModal, setQrModal] = useState(null);

  const load = () => getLocations().then(setLocations).catch(console.error);
  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (modal?.id) { await updateLocation(modal.id, data); toast.success('Updated!'); }
    else { await createLocation(data); toast.success('Created!'); }
    setModal(null);
    load();
  };

  const handleDelete = async (l) => {
    if (!window.confirm(`Delete "${l.name}"?`)) return;
    await deleteLocation(l.id);
    toast.success('Deleted');
    load();
  };

  const parseShelves = (s) => s ? s.split(',').map(x => x.trim()).filter(Boolean) : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">LOCATIONS</div>
          <div className="page-subtitle">{locations.length} places</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}>+ Add</button>
      </div>

      {locations.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">◈</div>
          <div className="empty-text">No locations yet — add a warehouse, room, or area</div>
        </div>
      ) : (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {locations.map(l => {
            const shelves = parseShelves(l.shelves);
            return (
              <div key={l.id} className="card" style={{ margin: 0 }}>
                <div className="card-header">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 24 }}>{TYPE_ICONS[l.type] || '📍'}</span>
                    <div>
                      <div className="card-title">{l.name}</div>
                      <div className="card-meta">{l.type}</div>
                    </div>
                  </div>
                  <button
                    className="btn-icon"
                    title="Location QR"
                    onClick={() => setQrModal({ data: `stockr://location/${l.id}`, title: l.name })}
                  >⬡</button>
                </div>
                {l.description && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>{l.description}</div>}
                {shelves.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Shelves</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {shelves.map(s => (
                        <button
                          key={s}
                          className="badge badge-purple"
                          style={{ cursor: 'pointer', border: 'none', background: 'rgba(124,58,237,0.2)' }}
                          onClick={() => setQrModal({ data: `stockr://location/${l.id}/shelf/${s}`, title: `${l.name} — Shelf ${s}` })}
                        >
                          {s} ⬡
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(l)}>Delete</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setModal(l)}>Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <LocationModal
          location={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

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
