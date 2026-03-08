import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getContainer, getItems, getContainers, getLocations,
  addContainerImage, removeContainerImage, emptyContainer,
  updateContainer, deleteContainer, createContainer,
} from '../utils/api';
import QRModal from '../components/QRModal';
import Portal from '../components/Portal';

/* ── Inline ContainerModal (same as ContainersPage) ── */
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
          <div className="modal-title">{container ? 'Edit Bin' : 'New Bin'}</div>
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

/* ── Empty Bin Modal ── */
function EmptyBinModal({ container, allContainers, onConfirm, onClose }) {
  const [action, setAction] = useState('unassign');
  const [moveTo, setMoveTo] = useState('');
  const [newBinMode, setNewBinMode] = useState(false);
  const [newBinName, setNewBinName] = useState('');
  const itemCount = parseInt(container.item_count) || 0;
  const photoCount = (container.images || []).length;
  const otherContainers = allContainers.filter(c => c.id !== container.id);

  const grouped = {};
  otherContainers.forEach(c => {
    const key = c.location_name || 'No Location';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

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

  return (
    <Portal>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-handle" />
          <div className="modal-title">Empty "{container.name}"</div>

          <div style={{
            background: 'rgba(239,168,68,0.1)',
            border: '1px solid rgba(239,168,68,0.25)',
            borderRadius: 'var(--radius)',
            padding: '12px 14px',
            marginBottom: 20,
            fontSize: 13,
            color: 'var(--text)',
            lineHeight: 1.5,
          }}>
            {itemCount > 0 && <div>This bin contains <strong>{itemCount} item{itemCount !== 1 ? 's' : ''}</strong>.</div>}
            {photoCount > 0 && <div><strong>{photoCount} photo{photoCount !== 1 ? 's' : ''}</strong> will be cleared.</div>}
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text2)' }}>The bin itself will be kept.</div>
          </div>

          {itemCount > 0 && (
            <>
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', marginBottom: 8,
                background: action === 'unassign' ? 'var(--surface2)' : 'transparent',
                borderRadius: 'var(--radius)',
                border: `1px solid ${action === 'unassign' ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer'
              }}>
                <input type="radio" name="empty-action" value="unassign" checked={action === 'unassign'} onChange={() => setAction('unassign')} style={{ marginTop: 2 }} />
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
                <input type="radio" name="empty-action" value="move" checked={action === 'move'} onChange={() => setAction('move')} style={{ marginTop: 2 }} />
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
            </>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-danger" style={{ flex: 2 }} onClick={handleConfirm} disabled={moveDisabled}>Empty Bin</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* ── Main Component ── */
export default function BinDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [container, setContainer] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);

  // Modals
  const [editModal, setEditModal] = useState(false);
  const [emptyModal, setEmptyModal] = useState(false);
  const [qrModal, setQrModal] = useState(null);

  // Data for modals
  const [locations, setLocations] = useState([]);
  const [allContainers, setAllContainers] = useState([]);

  const load = async () => {
    try {
      const [c, itemsData] = await Promise.all([
        getContainer(id),
        getItems({ container_id: id }),
      ]);
      setContainer(c);
      setItems(itemsData);
    } catch (e) {
      toast.error('Bin not found');
      navigate('/containers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // Load locations + all containers when modals open
  const loadModalData = async () => {
    const [l, c] = await Promise.all([getLocations(), getContainers()]);
    setLocations(l);
    setAllContainers(c);
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await addContainerImage(id, file);
      await load();
      toast.success('Photo added');
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (imageUrl) => {
    try {
      await removeContainerImage(id, imageUrl);
      setViewerImage(null);
      await load();
      toast.success('Photo removed');
    } catch (e) {
      toast.error('Failed to remove photo');
    }
  };

  const handleEditSave = async (data) => {
    await updateContainer(id, data);
    toast.success('Updated!');
    setEditModal(false);
    load();
  };

  const handleEmpty = async (moveTo) => {
    try {
      let moveToId = moveTo;
      if (moveTo && typeof moveTo === 'object') {
        const newBin = await createContainer(moveTo);
        moveToId = newBin.id;
      }
      await emptyContainer(id, moveToId);
      toast.success('Bin emptied');
      setEmptyModal(false);
      load();
    } catch (e) {
      toast.error('Failed to empty bin');
    }
  };

  const handleDelete = async () => {
    const itemCount = parseInt(container.item_count) || 0;
    const message = itemCount > 0
      ? `Delete "${container.name}"?\n\n${itemCount} item(s) will be unassigned.`
      : `Delete "${container.name}"?`;
    if (!window.confirm(message)) return;
    try {
      await deleteContainer(id);
      toast.success('Deleted');
      navigate('/containers');
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  if (loading) return <div className="page"><div className="loading pulsing">Loading…</div></div>;
  if (!container) return null;

  const images = container.images || [];
  const itemCount = parseInt(container.item_count) || 0;
  const hasContent = itemCount > 0 || images.length > 0;
  const subtitle = [container.location_name, container.shelf && `Shelf ${container.shelf}`].filter(Boolean).join(' · ') || 'No location';

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/containers" style={{ color: 'var(--text3)', fontSize: 18, textDecoration: 'none', lineHeight: 1, padding: 4 }}>←</Link>
          <div>
            <div className="page-title">{container.name}</div>
            <div className="page-subtitle">{subtitle}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { loadModalData(); setEditModal(true); }}>Edit</button>
      </div>

      {/* Description */}
      {container.description && (
        <div style={{ padding: '0 16px 16px', fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 }}>
          {container.description}
        </div>
      )}

      {/* Summary stats */}
      <div style={{ padding: '0 16px 20px', display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{images.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Photos</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{itemCount}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Items</div>
        </div>
      </div>

      {/* Photo grid */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Photos ({images.length})
        </div>
      </div>
      <div className="photo-grid">
        {images.map((url, i) => (
          <div key={i} className="photo-thumb" onClick={() => setViewerImage(url)}>
            <img src={url} alt="" />
          </div>
        ))}
        <div className={`photo-add${uploading ? ' uploading' : ''}`} onClick={() => !uploading && fileInputRef.current?.click()}>
          {uploading ? '…' : '+'}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoCapture}
        style={{ display: 'none' }}
      />

      {/* Items on this bin */}
      <div style={{ padding: '16px 16px 24px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Items ({itemCount})
        </div>
        {items.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No items in this bin
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="item-card">
              <div className="item-thumb">
                {item.image_url
                  ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                  : '📦'}
              </div>
              <div className="item-info">
                <div className="item-name">{item.name}</div>
                <div className="item-loc">
                  {item.location_name || 'No location'}
                  {item.shelf ? ` · Shelf ${item.shelf}` : ''}
                </div>
              </div>
              <div className="item-qty">×{item.quantity}</div>
            </div>
          ))
        )}
      </div>

      {/* Action buttons */}
      <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hasContent && (
          <button className="btn btn-ghost" style={{ width: '100%', color: 'var(--warn, #f59e0b)' }}
            onClick={() => { loadModalData(); setEmptyModal(true); }}>
            Empty Bin
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }}
            onClick={() => setQrModal({ data: `stockr://container/${container.id}`, title: container.name })}>
            QR Code
          </button>
          <button className="btn btn-ghost" style={{ flex: 1, color: 'var(--danger)' }} onClick={handleDelete}>
            Delete Bin
          </button>
        </div>
      </div>

      {/* Photo viewer */}
      {viewerImage && (
        <div className="photo-viewer" onClick={() => setViewerImage(null)}>
          <button className="photo-viewer-close" onClick={() => setViewerImage(null)}>✕</button>
          <img src={viewerImage} alt="" onClick={e => e.stopPropagation()} />
          <div className="photo-viewer-actions">
            <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleDeletePhoto(viewerImage); }}>
              Delete Photo
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal && (
        <ContainerModal
          container={container}
          locations={locations}
          onSave={handleEditSave}
          onClose={() => setEditModal(false)}
        />
      )}

      {/* Empty bin modal */}
      {emptyModal && (
        <EmptyBinModal
          container={container}
          allContainers={allContainers}
          onConfirm={handleEmpty}
          onClose={() => setEmptyModal(false)}
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
