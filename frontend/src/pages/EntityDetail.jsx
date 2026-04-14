import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getEntity, updateEntity, deleteEntity,
  uploadEntityPhoto, deleteEntityPhoto, starEntityPhoto,
  addEntityNote, updateEntityNote, deleteEntityNote,
  TYPE_ICONS, TYPE_LABELS, CHILD_TYPES,
} from '../utils/api';
import EntityCard from '../components/EntityCard';
import FABBar from '../components/FABBar';
import Portal from '../components/Portal';

export default function EntityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [entity, setEntity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(sp.get('tab') || 'overview');
  const [noteInput, setNoteInput] = useState('');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const e = await getEntity(id);
      setEntity(e);
    } catch (err) {
      toast.error('Failed to load entity');
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (sp.get('note') === 'new') {
      setTab('notes');
      setSp({ tab: 'notes' });
    }
  }, [sp, setSp]);

  if (loading || !entity) return <div className="loading pulsing">Loading…</div>;

  const childOptions = CHILD_TYPES[entity.type] || [];
  const children = (entity.children || []).filter(c => c.is_active !== false);

  const onUploadPhoto = async (file) => {
    try {
      await uploadEntityPhoto(id, file);
      toast.success('Photo added');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    }
  };

  const onStarPhoto = async (photoId) => {
    await starEntityPhoto(id, photoId);
    toast.success('Cover updated');
    load();
  };

  const onDeletePhoto = async (photoId) => {
    if (!window.confirm('Delete this photo?')) return;
    await deleteEntityPhoto(id, photoId);
    load();
  };

  const onAddNote = async () => {
    if (!noteInput.trim()) return;
    await addEntityNote(id, noteInput.trim());
    setNoteInput('');
    load();
  };

  const onSaveEdit = async () => {
    if (!editingNoteText.trim()) return;
    await updateEntityNote(id, editingNoteId, editingNoteText.trim());
    setEditingNoteId(null);
    load();
  };

  const onDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return;
    await deleteEntityNote(id, noteId);
    load();
  };

  const onRename = async () => {
    const name = prompt('New name:', entity.name);
    if (name && name.trim() && name !== entity.name) {
      await updateEntity(id, { name: name.trim() });
      load();
    }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete ${entity.name}? (soft delete — can restore)`)) return;
    await deleteEntity(id);
    toast.success('Deleted');
    navigate('/');
  };

  return (
    <div className="page entity-detail">
      <div className="page-header">
        <button onClick={() => navigate(-1)} className="back-btn">←</button>
        <div>
          <div className="page-title">
            <span>{TYPE_ICONS[entity.type]}</span> {entity.name}
          </div>
          <div className="page-subtitle">{TYPE_LABELS[entity.type]}</div>
        </div>
      </div>

      {entity.path && entity.path.length > 1 && (
        <div className="breadcrumb">
          {entity.path.slice(0, -1).map(p => (
            <span key={p.id} className="crumb" onClick={() => navigate(`/entities/${p.id}`)}>
              {p.name} ›
            </span>
          ))}
        </div>
      )}

      <div className="tabs">
        {['overview', 'photos', 'notes', 'children'].map(t => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => { setTab(t); setSp({ tab: t }); }}
          >
            {t === 'photos' ? `📷 ${entity.photo_count || 0}` :
             t === 'notes' ? `📝 ${entity.note_count || 0}` :
             t === 'children' ? `📦 ${children.length}` :
             'Overview'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <section className="detail-section">
          {entity.rep_photo_url && (
            <img src={entity.rep_photo_url} alt={entity.name} className="hero-img" />
          )}
          {entity.description && <p className="description">{entity.description}</p>}
          <div className="info-grid">
            <div><strong>Type:</strong> {TYPE_LABELS[entity.type]}</div>
            <div><strong>Photos:</strong> {entity.photo_count || 0}</div>
            <div><strong>Notes:</strong> {entity.note_count || 0}</div>
            {entity.barcode && <div><strong>Barcode:</strong> {entity.barcode}</div>}
            {entity.qr_slug && <div><strong>QR:</strong> {entity.qr_slug}</div>}
          </div>
        </section>
      )}

      {tab === 'photos' && (
        <section className="detail-section">
          <PhotoGallery
            photos={entity.photos || []}
            repPhotoId={entity.rep_photo_id}
            onUpload={onUploadPhoto}
            onStar={onStarPhoto}
            onDelete={onDeletePhoto}
          />
        </section>
      )}

      {tab === 'notes' && (
        <section className="detail-section">
          <div className="note-input-row">
            <textarea
              className="note-input"
              placeholder="Add a note…"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              rows={3}
            />
            <button className="btn btn-primary" disabled={!noteInput.trim()} onClick={onAddNote}>
              Add
            </button>
          </div>
          <div className="notes-list">
            {(entity.notes || []).map(n => (
              <div key={n.id} className="note-card">
                <div className="note-meta">
                  {new Date(n.created_at).toLocaleString()}
                  {n.updated_at && <span> · edited</span>}
                </div>
                {editingNoteId === n.id ? (
                  <>
                    <textarea
                      className="note-input"
                      value={editingNoteText}
                      onChange={e => setEditingNoteText(e.target.value)}
                      rows={3}
                    />
                    <div className="form-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => setEditingNoteId(null)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={onSaveEdit}>Save</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="note-body">{n.content}</p>
                    <div className="note-actions">
                      <button className="link-btn" onClick={() => { setEditingNoteId(n.id); setEditingNoteText(n.content); }}>Edit</button>
                      <button className="link-btn" onClick={() => onDeleteNote(n.id)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {(entity.notes || []).length === 0 && <div className="empty-hint">No notes yet</div>}
          </div>
        </section>
      )}

      {tab === 'children' && (
        <section className="detail-section">
          <div className="card-grid">
            {children.map(c => <EntityCard key={c.id} entity={c} />)}
          </div>
          {children.length === 0 && <div className="empty-hint">No children. Tap ➕ to add.</div>}
        </section>
      )}

      <FABBar
        onNote={() => { setTab('notes'); setSp({ tab: 'notes' }); }}
        onPhotos={() => { setTab('photos'); setSp({ tab: 'photos' }); }}
        onMore={() => {
          // Simple prompt menu for now; can evolve into proper sheet
          const action = window.prompt(
            'Menu:\n1. Rename\n2. Delete\n3. View QR\nEnter 1, 2, or 3:'
          );
          if (action === '1') onRename();
          else if (action === '2') onDelete();
          else if (action === '3') navigate(`/qr/${id}`);
        }}
      />
    </div>
  );
}

function PhotoGallery({ photos, repPhotoId, onUpload, onStar, onDelete }) {
  return (
    <div className="photo-gallery">
      <div className="photo-grid">
        {photos.map(p => (
          <div key={p.id} className={`photo-tile ${p.id === repPhotoId ? 'photo-rep' : ''}`}>
            <img src={p.url} alt="" />
            <button className="star-btn" onClick={() => onStar(p.id)} title="Set as cover">
              {p.id === repPhotoId ? '⭐' : '☆'}
            </button>
            <button className="del-btn" onClick={() => onDelete(p.id)} title="Delete">🗑</button>
          </div>
        ))}
        {photos.length < 10 && (
          <label className="photo-add">
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])}
            />
            <span>+ Add</span>
          </label>
        )}
      </div>
      <div className="photo-counter">{photos.length} / 10 photos</div>
    </div>
  );
}
