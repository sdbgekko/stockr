import { useState, useRef } from 'react';
import { uploadImage } from '../utils/api';
import Portal from './Portal';

export default function LocationModal({ location, onSave, onClose }) {
  const [form, setForm] = useState({
    name: location?.name || '',
    type: location?.type || 'room',
    description: location?.description || '',
  });
  const [imageUrl, setImageUrl] = useState(location?.image_url || null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

  const handleSave = () => {
    if (!form.name.trim()) return;
    // Pass through existing shelves + shelf_images so edit doesn't wipe them
    onSave({
      ...form,
      image_url: imageUrl || null,
      shelves: location?.shelves || '',
      shelf_images: location?.shelf_images || {},
    });
  };

  return (
    <Portal>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-handle" />
          <div className="modal-title">{location ? 'Edit Location' : 'New Location'}</div>

          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />

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

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={!form.name.trim()}>Save</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
