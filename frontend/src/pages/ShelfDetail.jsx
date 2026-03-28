import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getLocation, getItems, getContainers, addShelfImage, removeShelfImage, updateItem, deleteItem } from '../utils/api';
import ItemForm from '../components/ItemForm';
import QRModal from '../components/QRModal';
import PhotoViewer from '../components/PhotoViewer';
import Portal from '../components/Portal';

/* ── Inline ItemDetail (same pattern as ItemsPage) ── */
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
      <Portal>
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
      </Portal>
    );
  }

  return (
    <Portal>
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
              <span className="badge badge-green">{'\u00d7'}{item.quantity} {item.unit}</span>
            </div>
          </div>
          {item.description && <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 12 }}>{item.description}</p>}
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', lineHeight: 2 }}>
            {item.location_name && <div>{'\ud83d\udccd'} {item.location_name}</div>}
            {(item.shelf || item.container_shelf) && <div>{'\ud83d\uddc4'} Shelf: {item.shelf || item.container_shelf}</div>}
            {item.container_name && <div>{'\ud83d\udce6'} Bin: {item.container_name}</div>}
            {item.barcode && <div>{'\ud83d\udd16'} {item.barcode}</div>}
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
    </Portal>
  );
}

export default function ShelfDetail() {
  const { id, shelf } = useParams();
  const navigate = useNavigate();
  const shelfName = decodeURIComponent(shelf);
  const fileInputRef = useRef(null);

  const [location, setLocation] = useState(null);
  const [items, setItems] = useState([]);
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const load = async () => {
    try {
      const [loc, itemsData, containersData] = await Promise.all([
        getLocation(id),
        getItems({ location_id: id, shelf: shelfName }),
        getContainers({ location_id: id }),
      ]);
      setLocation(loc);
      setItems(itemsData);
      setBins(containersData.filter(c => c.shelf === shelfName));
    } catch (e) {
      toast.error('Failed to load shelf');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id, shelf]);

  const images = (location?.shelf_images?.[shelfName]) || [];
  // Handle legacy single-URL format just in case
  const imageList = Array.isArray(images) ? images : (images ? [images] : []);

  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await addShelfImage(id, shelfName, file);
      await load();
      toast.success('Photo added');
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (imageUrl) => {
    try {
      await removeShelfImage(id, shelfName, imageUrl);
      await load();
      toast.success('Photo removed');
    } catch (e) {
      toast.error('Failed to remove photo');
    }
  };

  if (loading) return <div className="page"><div className="loading pulsing">Loading…</div></div>;
  if (!location) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to={`/locations/${id}`} style={{ color: 'var(--text3)', fontSize: 18, textDecoration: 'none', lineHeight: 1, padding: 4 }}>←</Link>
          <div>
            <div className="page-title">Shelf {shelfName}</div>
            <div className="page-subtitle">{location.name}</div>
          </div>
        </div>
        <button className="btn-icon" title="Shelf QR"
          onClick={() => setQrModal({ data: `stockr://location/${id}/shelf/${shelfName}`, title: `${location.name} — Shelf ${shelfName}` })}>
          ⬡
        </button>
      </div>

      {/* Breadcrumb navigation */}
      <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <Link to="/" style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)', textDecoration: 'none' }}>Home</Link>
        <span style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)' }}>/</span>
        <Link to={`/locations/${id}`} style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)', textDecoration: 'none' }}>{location.name}</Link>
        <span style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)' }}>/</span>
        <span style={{ color: 'var(--text2)', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600 }}>Shelf {shelfName}</span>
      </div>

      {/* Summary stats */}
      <div style={{ padding: '0 16px 20px', display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{imageList.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Photos</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{bins.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Bins</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{items.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Items</div>
        </div>
      </div>

      {/* Photo grid */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Photos ({imageList.length})
        </div>
      </div>
      <div className="photo-grid">
        {imageList.map((url, i) => (
          <div key={i} className="photo-thumb" onClick={() => setViewerIndex(i)}>
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

      {/* Bins on this shelf */}
      {bins.length > 0 && (
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Bins ({bins.length})
          </div>
          {bins.map(c => (
            <div key={c.id} className="card" style={{ margin: '0 0 10px', padding: 14, cursor: 'pointer' }}
              onClick={() => navigate(`/containers/${c.id}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    {parseInt(c.item_count) || 0} {parseInt(c.item_count) === 1 ? 'item' : 'items'}
                  </div>
                </div>
                <span className="badge badge-green">{parseInt(c.item_count) || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Items on this shelf */}
      <div style={{ padding: '16px 16px 24px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Items ({items.length})
        </div>
        {items.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No items on this shelf
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="item-card" onClick={() => setSelectedItem(item)}>
              <div className="item-thumb">
                {item.image_url
                  ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                  : '\ud83d\udce6'}
              </div>
              <div className="item-info">
                <div className="item-name">{item.name}</div>
                <div className="item-loc">
                  {[
                    item.bin || item.container_name,
                  ].filter(Boolean).join(' \u203a ') || 'No bin'}
                </div>
              </div>
              <div className="item-qty">{'\u00d7'}{item.quantity}</div>
            </div>
          ))
        )}
      </div>

      {/* Photo viewer */}
      {viewerIndex !== null && (
        <PhotoViewer
          images={imageList}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={handleDeletePhoto}
        />
      )}

      {qrModal && (
        <QRModal
          data={qrModal.data}
          title={qrModal.title}
          onClose={() => setQrModal(null)}
        />
      )}

      {/* Item detail modal */}
      {selectedItem && (
        <ItemDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSaved={() => { setSelectedItem(null); load(); }}
          onDeleted={() => { setSelectedItem(null); load(); }}
        />
      )}
    </div>
  );
}
