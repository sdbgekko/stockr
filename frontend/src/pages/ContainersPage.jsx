import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getContainers, createContainer, updateContainer, deleteContainer, getLocations } from '../utils/api';
import QRModal from '../components/QRModal';
import Portal from '../components/Portal';

function ContainerModal({ container, locations, onSave, onClose }) {
  const [form, setForm] = useState({
    name: container?.name || '',
    location_id: container?.location_id || '',
    shelf: container?.shelf || '',
    description: container?.description || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedLocation = locations.find(l => String(l.id) === String(form.location_id));
  const locationShelves = selectedLocation?.shelves
    ? selectedLocation.shelves.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  // Always include the container's current shelf so it shows as selected
  const availableShelves = form.shelf && !locationShelves.includes(form.shelf)
    ? [...locationShelves, form.shelf]
    : locationShelves;

  const handleSave = async () => {
    if (!form.name.trim()) return;
    await onSave({ ...form, location_id: form.location_id || null });
  };

  return (
    <Portal>
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
          <select className="form-select" value={form.location_id} onChange={e => { set('location_id', e.target.value); set('shelf', ''); }}>
            <option value="">— None —</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Shelf</label>
          {availableShelves.length > 0 ? (
            <select className="form-select" value={form.shelf} onChange={e => set('shelf', e.target.value)}>
              <option value="">— None —</option>
              {availableShelves.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input className="form-input" value={form.shelf} onChange={e => set('shelf', e.target.value)} placeholder={form.location_id ? 'No shelves defined' : 'Select location first'} disabled={!!form.location_id && availableShelves.length === 0} />
          )}
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
    </Portal>
  );
}

function DeleteContainerModal({ container, allContainers, onConfirm, onClose }) {
  const [action, setAction] = useState('unassign');
  const [moveTo, setMoveTo] = useState('');
  const [newBinMode, setNewBinMode] = useState(false);
  const [newBinName, setNewBinName] = useState('');
  const itemCount = parseInt(container.item_count) || 0;
  const otherContainers = allContainers.filter(c => c.id !== container.id);

  const grouped = {};
  otherContainers.forEach(c => {
    const key = c.location_name || 'No Location';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  // If no other containers exist, always use new-bin text input
  const isNewBin = newBinMode || otherContainers.length === 0;

  const handleConfirm = () => {
    if (action === 'move') {
      if (isNewBin) {
        onConfirm({ name: newBinName.trim(), location_id: container.location_id, shelf: container.shelf || '' });
      } else {
        onConfirm(moveTo);
      }
    } else {
      onConfirm(null);
    }
  };

  const moveDisabled = action === 'move' && (isNewBin ? !newBinName.trim() : !moveTo);

  // Empty bin — simple confirmation
  if (itemCount === 0) {
    return (
      <Portal>
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
          <div className="modal">
            <div className="modal-handle" />
            <div className="modal-title">Delete "{container.name}"</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5 }}>
              This bin is empty. Are you sure you want to delete it?
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className="btn btn-danger" style={{ flex: 2 }} onClick={() => onConfirm(null)}>Delete Bin</button>
            </div>
          </div>
        </div>
      </Portal>
    );
  }

  // Bin with items — full options
  return (
    <Portal>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-handle" />
          <div className="modal-title">Delete "{container.name}"</div>

          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--radius)',
            padding: '12px 14px',
            marginBottom: 20,
            fontSize: 13,
            color: 'var(--text)'
          }}>
            This bin contains <strong>{itemCount} item{itemCount !== 1 ? 's' : ''}</strong>. Choose what to do with them:
          </div>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', marginBottom: 8,
            background: action === 'unassign' ? 'var(--surface2)' : 'transparent',
            borderRadius: 'var(--radius)',
            border: `1px solid ${action === 'unassign' ? 'var(--accent)' : 'var(--border)'}`,
            cursor: 'pointer'
          }}>
            <input type="radio" name="delete-action" value="unassign" checked={action === 'unassign'} onChange={() => setAction('unassign')} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Remove bin assignment</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Items stay in inventory but won't be assigned to any bin</div>
            </div>
          </label>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 14px', marginBottom: 8,
            background: action === 'move' ? 'var(--surface2)' : 'transparent',
            borderRadius: 'var(--radius)',
            border: `1px solid ${action === 'move' ? 'var(--accent)' : 'var(--border)'}`,
            cursor: 'pointer'
          }}>
            <input type="radio" name="delete-action" value="move" checked={action === 'move'} onChange={() => setAction('move')} style={{ marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Move items to another bin</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Transfer all {itemCount} item{itemCount !== 1 ? 's' : ''} to a different bin</div>
            </div>
          </label>

          {action === 'move' && (
            <div className="form-group" style={{ marginTop: 4, marginBottom: 20, paddingLeft: 30 }}>
              {otherContainers.length > 0 && !isNewBin ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="form-select" style={{ flex: 1 }} value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                    <option value="">— Select target bin —</option>
                    {Object.entries(grouped).map(([locName, bins]) => (
                      <optgroup key={locName} label={locName}>
                        {bins.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name}{b.shelf ? ` (Shelf ${b.shelf})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button type="button" className="btn-icon" style={{ flexShrink: 0 }} onClick={() => { setNewBinMode(true); setMoveTo(''); }} title="Create new bin">+</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="form-input" style={{ flex: 1 }} value={newBinName} onChange={e => setNewBinName(e.target.value)} placeholder="Type new bin name" autoFocus />
                  {otherContainers.length > 0 && (
                    <button type="button" className="btn-icon" style={{ flexShrink: 0 }} onClick={() => { setNewBinMode(false); setNewBinName(''); }}>✕</button>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-danger" style={{ flex: 2 }} onClick={handleConfirm} disabled={moveDisabled}>Delete Bin</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default function ContainersPage() {
  const [containers, setContainers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [modal, setModal] = useState(null); // null | 'new' | container obj
  const [qrModal, setQrModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const navigate = useNavigate();

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

  const handleDelete = (c) => {
    setDeleteTarget(c);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--text3)', fontSize: 18, textDecoration: 'none', lineHeight: 1, padding: 4 }}>←</Link>
          <div>
            <div className="page-title">BINS & BOXES</div>
            <div className="page-subtitle">{containers.length} containers</div>
          </div>
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
            <div key={c.id} className="card" style={{ margin: '0 16px', marginBottom: 10, cursor: 'pointer' }} onClick={() => navigate(`/containers/${c.id}`)}>
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setQrModal({ data: `stockr://container/${c.id}`, title: c.name }); }}>QR</button>
                <button className="btn-icon btn-icon-danger" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(c); }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z"/>
                  </svg>
                </button>
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

      {qrModal && (
        <QRModal
          data={qrModal.data}
          title={qrModal.title}
          onClose={() => setQrModal(null)}
        />
      )}

      {deleteTarget && (
        <DeleteContainerModal
          container={deleteTarget}
          allContainers={containers}
          onConfirm={async (moveTo) => {
            let moveToId = moveTo;
            if (moveTo && typeof moveTo === 'object') {
              // Create new bin first, then move items to it
              const newBin = await createContainer(moveTo);
              moveToId = newBin.id;
            }
            await deleteContainer(deleteTarget.id, moveToId);
            toast.success('Deleted');
            setDeleteTarget(null);
            load();
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
