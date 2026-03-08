import { useState, useEffect, useRef } from 'react';
import { getLocations, getContainers, uploadImage } from '../utils/api';

export default function ItemForm({ initial = {}, capturedImage, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    description: initial.description || '',
    quantity: initial.quantity_hint || initial.quantity || 1,
    unit: initial.unit || 'each',
    location_id: initial.location_id || '',
    container_id: initial.container_id || '',
    shelf: initial.shelf || '',
    bin: initial.bin || '',
    barcode: initial.barcode || '',
    tags: (initial.labels || initial.tags || []).join(', '),
  });
  const [locations, setLocations] = useState([]);
  const [containers, setContainers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(capturedImage || initial.image_url || null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    getLocations().then(setLocations).catch(console.error);
  }, []);

  useEffect(() => {
    if (form.location_id) {
      getContainers({ location_id: form.location_id }).then(setContainers).catch(console.error);
    } else {
      getContainers().then(setContainers).catch(console.error);
    }
  }, [form.location_id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImage(file);
      setImageUrl(result.image_url);
    } catch (err) {
      // Fall back to local preview if upload fails
      setImageUrl(URL.createObjectURL(file));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      await onSave({
        ...form,
        quantity: parseInt(form.quantity) || 1,
        location_id: form.location_id || null,
        container_id: form.container_id || null,
        image_url: imageUrl || null,
        ai_labels: initial.labels || [],
        tags,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
      {imageUrl ? (
        <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
          <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }} />
          <button
            className="btn btn-ghost btn-sm"
            style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Change Photo'}
          </button>
        </div>
      ) : (
        <button
          className="btn btn-ghost btn-full"
          style={{ marginBottom: 16, padding: '20px 0', border: '1px dashed var(--border)' }}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : '📷 Add Photo'}
        </button>
      )}

      <div className="form-group">
        <label className="form-label">Item Name *</label>
        <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Box of Screws" />
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional details…" rows={2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Quantity</label>
          <input className="form-input" type="number" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Unit</label>
          <select className="form-select" value={form.unit} onChange={e => set('unit', e.target.value)}>
            {['each', 'box', 'bag', 'pair', 'set', 'roll', 'ft', 'lb', 'oz', 'L', 'gal'].map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Location</label>
        <select className="form-select" value={form.location_id} onChange={e => set('location_id', e.target.value)}>
          <option value="">— No location —</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Container / Bin</label>
        <select className="form-select" value={form.container_id} onChange={e => {
          const cid = e.target.value;
          set('container_id', cid);
          const selected = containers.find(c => String(c.id) === cid);
          if (selected) {
            set('shelf', selected.shelf || '');
            set('bin', selected.bin || '');
          }
        }}>
          <option value="">— No container —</option>
          {containers.map(c => <option key={c.id} value={c.id}>{c.name}{c.shelf ? ` · Shelf ${c.shelf}` : ''}{c.bin ? ` · Bin ${c.bin}` : ''}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Shelf</label>
          <input className="form-input" value={form.shelf} onChange={e => set('shelf', e.target.value)} placeholder={form.container_id ? '' : 'A, B, 1, 2…'} disabled={!!form.container_id} style={form.container_id ? { opacity: 0.6 } : {}} />
        </div>
        <div className="form-group">
          <label className="form-label">Bin</label>
          <input className="form-input" value={form.bin} onChange={e => set('bin', e.target.value)} placeholder={form.container_id ? '' : '01, 02…'} disabled={!!form.container_id} style={form.container_id ? { opacity: 0.6 } : {}} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Barcode / SKU</label>
        <input className="form-input" value={form.barcode} onChange={e => set('barcode', e.target.value)} placeholder="Optional" />
      </div>

      <div className="form-group">
        <label className="form-label">Tags (comma separated)</label>
        <input className="form-input" value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="tools, hardware, misc…" />
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()} style={{ flex: 2 }}>
          {saving ? 'Saving…' : '✓ Save Item'}
        </button>
      </div>
    </div>
  );
}
