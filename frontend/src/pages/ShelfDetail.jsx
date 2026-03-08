import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getLocation, getItems, getContainers } from '../utils/api';
import QRModal from '../components/QRModal';

export default function ShelfDetail() {
  const { id, shelf } = useParams();
  const shelfName = decodeURIComponent(shelf);
  const [location, setLocation] = useState(null);
  const [items, setItems] = useState([]);
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qrModal, setQrModal] = useState(null);

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

      {/* Summary stats */}
      <div style={{ padding: '0 16px 20px', display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{bins.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Bins</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{items.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>Items</div>
        </div>
      </div>

      {/* Bins on this shelf */}
      {bins.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Bins ({bins.length})
          </div>
          {bins.map(c => (
            <div key={c.id} className="card" style={{ margin: '0 0 10px', padding: 14 }}>
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
            <div key={item.id} className="item-card">
              <div className="item-thumb">
                {item.image_url
                  ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                  : '📦'}
              </div>
              <div className="item-info">
                <div className="item-name">{item.name}</div>
                <div className="item-loc">
                  {[
                    item.bin || item.container_name,
                  ].filter(Boolean).join(' › ') || 'No bin'}
                </div>
              </div>
              <div className="item-qty">×{item.quantity}</div>
            </div>
          ))
        )}
      </div>

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
