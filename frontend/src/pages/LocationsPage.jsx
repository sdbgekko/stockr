import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getLocations, createLocation, updateLocation, deleteLocation } from '../utils/api';
import QRModal from '../components/QRModal';
import SwipeableCard from '../components/SwipeableCard';
import LocationModal from '../components/LocationModal';

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
  const navigate = useNavigate();

  const load = () => {
    getLocations().then(setLocations).catch(console.error);
  };
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

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--text3)', fontSize: 18, textDecoration: 'none', lineHeight: 1, padding: 4 }}>←</Link>
          <div>
            <div className="page-title">LOCATIONS</div>
            <div className="page-subtitle">{locations.length} places</div>
          </div>
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
            const shelfCount = l.shelves ? l.shelves.split(',').map(s => s.trim()).filter(Boolean).length : 0;
            const bins = parseInt(l.total_bins) || 0;
            const items = parseInt(l.total_items) || 0;
            const summary = [
              `${shelfCount} ${shelfCount === 1 ? 'shelf' : 'shelves'}`,
              `${bins} ${bins === 1 ? 'bin' : 'bins'}`,
              `${items} ${items === 1 ? 'item' : 'items'}`,
            ].join(' · ');
            return (
              <SwipeableCard
                key={l.id}
                actions={[{ label: 'Delete', color: 'var(--danger)', icon: <TrashIcon />, onClick: () => handleDelete(l) }]}
                isOpen={openSwipeId === l.id}
                onSwipeOpen={() => setOpenSwipeId(l.id)}
              >
                <div className="card" style={{ margin: 0, cursor: 'pointer' }} onClick={() => { setOpenSwipeId(null); navigate(`/locations/${l.id}`); }}>
                  <div className="card-header">
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {l.image_url ? (
                        <img src={l.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                      ) : (
                        <span style={{ fontSize: 24 }}>{TYPE_ICONS[l.type] || '\ud83d\udccd'}</span>
                      )}
                      <div>
                        <div className="card-title">{l.name}</div>
                        <div className="card-meta">{summary}</div>
                      </div>
                    </div>
                    <button
                      className="btn-icon"
                      title="Location QR"
                      onClick={(e) => { e.stopPropagation(); setQrModal({ data: `stockr://location/${l.id}`, title: l.name }); }}
                    >⬡</button>
                  </div>
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
