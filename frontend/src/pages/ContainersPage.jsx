import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getContainers, createContainer, updateContainer, deleteContainer, getLocations } from '../utils/api';

function ContainerModal({ container, locations, onSave, onClose }) {
  const [form, setForm] = useState({
    name: container?.name || '',
    location_id: container?.location_id || '',
    shelf: container?.shelf || '',
    bin: container?.bin || '',
    description: container?.description || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    await onSave({ ...form, location_id: form.location_id || null });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">{container ? 'Edit Container' : 'New Container'}</div>
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Blue Bin #3" />
        </div>
        <div className="form-group">
          <label className="form-label">Location</label>
          <select className="form-select" value={form.location_id} onChange={e => set('location_id', e.target.value)}>
            <option value="">— None —</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Shelf</label>
            <input className="form-input" value={form.shelf} onChange={e => set('shelf', e.target.value)} placeholder="A, 1…" />
          </div>
          <div className="form-group">
            <label className="form-label">Bin</label>
            <input className="form-input" value={form.bin} onChange={e => set('bin', e.target.value)} placeholder="01…" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-textarea" value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={!form.name.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function ContainersPage() {
  const [containers, setContainers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [modal, setModal] = useState(null); // null | 'new' | container obj

  const load = async () => {
    const [c, l] = await Promise.all([getContainers(), getLocations()]);
    setContainers(c);
    setLocations(l);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (data) => {
    if (modal?.id) { await updateContainer(modal.id, data); toast.success('Updated!'); }
    else { await createContainer(data); toast.success('Created!'); }
    setModal(null);
    load();
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    await deleteContainer(c.id);
    toast.success('Deleted');
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">BINS & BOXES</div>
          <div className="page-subtitle">{containers.length} containers</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setModal('new')}>+ Add</button>
      </div>

      {containers.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">▣</div>
          <div className="empty-text">No containers yet</div>
        </div>
      ) : (
        <div className="item-list">
          {containers.map(c => (
            <div key={c.id} className="card" style={{ margin: '0 16px', marginBottom: 10 }}>
              <div className="card-header">
                <div>
                  <div className="card-title">{c.name}</div>
                  <div className="card-meta">
                    {[c.location_name, c.shelf && `Shelf ${c.shelf}`, c.bin && `Bin ${c.bin}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className="badge badge-green">{c.item_count} items</span>
              </div>
              {c.description && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>{c.description}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c)}>Delete</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal(c)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ContainerModal
          container={modal === 'new' ? null : modal}
          locations={locations}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
