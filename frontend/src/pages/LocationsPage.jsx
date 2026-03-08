import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getLocations, createLocation, updateLocation, deleteLocation, uploadImage } from '../utils/api';
import QRModal from '../components/QRModal';
import SwipeableCard from '../components/SwipeableCard';

function LocationModal({ location, onSave, onClose }) {
  const [form, setForm] = useState({
    name: location?.name || '',
    type: location?.type || 'room',
    description: location?.description || '',
    shelves: location?.shelves || '',
  });
  const [imageUrl, setImageUrl] = useState(location?.image_url || null);
  const [shelfImages, setShelfImages] = useState(location?.shelf_images || {});
  const [uploading, setUploading] = useState(false);
  const [uploadingShelf, setUploadingShelf] = useState(null);
  const fileRef = useRef(null);
  const shelfFileRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const parseShelves = (s) => s ? s.split(',').map(x => x.trim()).filter(Boolean) : [];
  const shelves = parseShelves(form.shelves);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImage(file);
      setImageUrl(result.image_url);
    } catch (err) {
      setImageUrl(URL.createObjectURL(file));
    } finally {
      setUploading(false);
    }
  };

  const handleShelfPhoto = async (e) => {
    const file = e.target.files[0];
    const shelf = uploadingShelf;
    if (!file || !shelf) return;
    try {
      const result = await uploadImage(file);
      setShelfImages(prev => ({ ...prev, [shelf]: result.image_url }));
    } catch (err) {
      setShelfImages(prev => ({ ...prev, [shelf]: URL.createObjectURL(file) }));
    } finally {
      setUploadingShelf(null);
    }
  };

  const triggerShelfUpload = (shelfName) => {
    setUploadingShelf(shelfName);
    setTimeout(() => shelfFileRef.current?.click(), 50);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({ ...form, image_url: imageUrl || null, shelf_images: shelfImages });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">{location ? 'Edit Location' : 'New Location'}</div>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
        <input ref={shelfFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleShelfPhoto} />

        {imageUrl ? (
          <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
            <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }} />
            <button
              className="btn btn-ghost btn-sm"
              style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? 'Uploading\u2026' : 'Change Photo'}
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost btn-full"
            style={{ marginBottom: 16, padding: '20px 0', border: '1px dashed var(--border)' }}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading\u2026' : '\ud83d\udcf7 Add Photo'}
          </button>
        )}

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

        {shelves.length > 0 && (
          <div className="form-group">
            <label className="form-label">Shelf Photos</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shelves.map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  {shelfImages[s] ? (
                    <img
                      src={shelfImages[s]}
                      alt={`Shelf ${s}`}
                      style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
                      onClick={() => triggerShelfUpload(s)}
                    />
                  ) : (
                    <button
                      className="btn-icon"
                      style={{ width: 40, height: 40, fontSize: 14, flexShrink: 0 }}
                      onClick={() => triggerShelfUpload(s)}
                    >
                      {uploadingShelf === s ? '\u2026' : '\ud83d\udcf7'}
                    </button>
                  )}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text2)' }}>Shelf {s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={!form.name.trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}

const TYPE_ICONS = { warehouse: '\ud83c\udfed', room: '\ud83d\udeaa', area: '\ud83d\udccd' };

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z"/>
  </svg>
);

export default function LocationsPage() {
  const [locations, setLocations] = useState([]);
  const [modal, setModal] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [openSwipeId, setOpenSwipeId] = useState(null);

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
            const shelfImages = l.shelf_images || {};
            return (
              <SwipeableCard
                key={l.id}
                actions={[{ label: 'Delete', color: 'var(--danger)', icon: <TrashIcon />, onClick: () => handleDelete(l) }]}
                isOpen={openSwipeId === l.id}
                onSwipeOpen={() => setOpenSwipeId(l.id)}
              >
                <div className="card" style={{ margin: 0, cursor: 'pointer' }} onClick={() => { setOpenSwipeId(null); setModal(l); }}>
                  <div className="card-header">
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {l.image_url ? (
                        <img src={l.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                      ) : (
                        <span style={{ fontSize: 24 }}>{TYPE_ICONS[l.type] || '\ud83d\udccd'}</span>
                      )}
                      <div>
                        <div className="card-title">{l.name}</div>
                        <div className="card-meta">{l.type}</div>
                      </div>
                    </div>
                    <button
                      className="btn-icon"
                      title="Location QR"
                      onClick={(e) => { e.stopPropagation(); setQrModal({ data: `stockr://location/${l.id}`, title: l.name }); }}
                    >⬡</button>
                  </div>
                  {l.description && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>{l.description}</div>}
                  {shelves.length > 0 && (
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Shelves</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {shelves.map(s => (
                          <button
                            key={s}
                            className="badge badge-purple"
                            style={{ cursor: 'pointer', border: 'none', background: 'rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={(e) => { e.stopPropagation(); setQrModal({ data: `stockr://location/${l.id}/shelf/${s}`, title: `${l.name} — Shelf ${s}` }); }}
                          >
                            {shelfImages[s] && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />}
                            {s} ⬡
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SwipeableCard>
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
