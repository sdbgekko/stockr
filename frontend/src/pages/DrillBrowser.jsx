import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { listEntities, createEntity, CHILD_TYPES, TYPE_LABELS } from '../utils/api';
import EntityCard from '../components/EntityCard';
import FABBar from '../components/FABBar';
import Portal from '../components/Portal';

/**
 * Root drill browser — progressive-disclosure inventory navigation.
 *
 * URL state:
 *   /?path=<uuid>,<uuid>,... — breadcrumb of ancestor entity ids
 * Or:
 *   / (no path) = top level (show locations)
 *
 * Always renders:
 *   search bar (top)
 *   filter chips (current path as removable crumbs)
 *   grouping cards (next-level children: locations → areas → racks → …)
 *   item cards (any leaf items under current scope)
 *   FAB (bottom)
 */
export default function DrillBrowser() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const pathParam = sp.get('path') || '';
  const pathIds = pathParam ? pathParam.split(',').filter(Boolean) : [];
  const currentId = pathIds[pathIds.length - 1] || null;

  const [search, setSearch] = useState('');
  const [currentEntity, setCurrentEntity] = useState(null); // details of deepest crumb
  const [children, setChildren] = useState([]);
  const [items, setItems] = useState([]);
  const [crumbs, setCrumbs] = useState([]); // [{id, name, type}]
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load children (non-item) at current level
      const kids = await listEntities({
        parent_id: currentId || 'null',
        search: search || undefined,
      });
      // Separate items (leaves) from grouping entities (everything else)
      const grouping = kids.filter(e => e.type !== 'item');
      const leafItems = kids.filter(e => e.type === 'item');

      // Also pull items nested deeper within current scope when search is active
      // (so you can find an item buried in a bin without drilling)
      let searchItems = [];
      if (search && currentId) {
        const all = await listEntities({ type: 'item', search });
        // Filter to descendants of currentId (requires client-side tree walk or server support — simple for now)
        searchItems = all.filter(it => !leafItems.find(l => l.id === it.id));
      }

      setChildren(grouping);
      setItems([...leafItems, ...searchItems]);

      // Breadcrumb path
      if (currentId) {
        // getEntity returns path on detail endpoint
        const { getEntity } = await import('../utils/api');
        const e = await getEntity(currentId);
        setCurrentEntity(e);
        setCrumbs(e.path || []);
      } else {
        setCurrentEntity(null);
        setCrumbs([]);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [currentId, search]);

  useEffect(() => { load(); }, [load]);

  const drillInto = (entity) => {
    const next = [...pathIds, entity.id];
    setSp({ path: next.join(',') });
  };

  const popCrumb = (idx) => {
    const next = pathIds.slice(0, idx);
    if (next.length) setSp({ path: next.join(',') });
    else setSp({});
  };

  const handleAdd = async ({ type, name }) => {
    try {
      await createEntity({ type, name, parent_id: currentId });
      toast.success(`${TYPE_LABELS[type]} added`);
      setShowAdd(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Create failed');
    }
  };

  const parentType = currentEntity?.type || null;
  const childOptions = CHILD_TYPES[parentType || 'null'] || [];
  const titleName = currentEntity?.name || 'Inventory';

  return (
    <div className="page drill-browser">
      <div className="page-header">
        <div className="page-title">{titleName}</div>
        <div className="page-subtitle">
          {children.length} {children.length === 1 ? 'group' : 'groups'} · {items.length} items
        </div>
      </div>

      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search all entities…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {crumbs.length > 0 && (
        <div className="chip-row">
          <span className="chip chip-home" onClick={() => setSp({})}>All</span>
          {crumbs.map((c, idx) => (
            <span key={c.id} className="chip" onClick={() => popCrumb(idx + 1)}>
              {c.name}
              <span className="chip-x" onClick={(e) => { e.stopPropagation(); popCrumb(idx); }}>×</span>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="loading pulsing">Loading…</div>
      ) : (
        <>
          {children.length > 0 && (
            <section className="card-grid">
              {children.map(e => (
                <EntityCard key={e.id} entity={e} onClick={drillInto} />
              ))}
            </section>
          )}

          {items.length > 0 && (
            <section className="card-grid">
              <h3 className="section-title">Items</h3>
              {items.map(e => (
                <EntityCard key={e.id} entity={e} />
              ))}
            </section>
          )}

          {children.length === 0 && items.length === 0 && (
            <div className="empty">
              <div className="empty-icon">📦</div>
              <div className="empty-text">
                {search ? 'Nothing matches' : 'Nothing here yet — tap ➕ to add'}
              </div>
            </div>
          )}
        </>
      )}

      <FABBar
        onNote={currentEntity ? () => navigate(`/entities/${currentEntity.id}?note=new`) : null}
        onPhotos={currentEntity ? () => navigate(`/entities/${currentEntity.id}?tab=photos`) : null}
        onMore={() => setShowAdd(true)}
      />

      {showAdd && childOptions.length > 0 && (
        <AddEntityModal types={childOptions} onAdd={handleAdd} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}

function AddEntityModal({ types, onAdd, onClose }) {
  const [type, setType] = useState(types[0]);
  const [name, setName] = useState('');

  return (
    <Portal>
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-title">Add new</div>
          <div className="form-group">
            <label>Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="input">
              {types.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Name</label>
            <input
              autoFocus
              className="input"
              placeholder="e.g., Kitchen"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && name.trim() && onAdd({ type, name: name.trim() })}
            />
          </div>
          <div className="form-actions">
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!name.trim()}
              onClick={() => onAdd({ type, name: name.trim() })}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
