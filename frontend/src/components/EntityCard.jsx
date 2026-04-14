import { Link } from 'react-router-dom';
import { TYPE_ICONS, TYPE_LABELS } from '../utils/api';

/**
 * Universal entity card. One component renders Location / Area / Rack /
 * Shelf / Bin / Item cards.
 *
 * Shows:
 *  - Representative photo (rep_photo_url) if set, else type-icon fallback
 *  - Name + type label
 *  - Child-count summary (e.g., "4 shelves · 32 items")
 *
 * Click = navigate to entity detail page.
 */
export default function EntityCard({ entity, onClick }) {
  const {
    id,
    type,
    name,
    rep_photo_url,
    child_counts = {},
    photo_count = 0,
    note_count = 0,
  } = entity;

  const counts = [];
  for (const [t, n] of Object.entries(child_counts)) {
    counts.push(`${n} ${n === 1 ? TYPE_LABELS[t].toLowerCase() : TYPE_LABELS[t].toLowerCase() + 's'}`);
  }
  const summary = counts.slice(0, 2).join(' · ') || TYPE_LABELS[type];

  const body = (
    <>
      <div className="ec-media">
        {rep_photo_url ? (
          <img src={rep_photo_url} alt={name} />
        ) : (
          <span className="ec-icon" role="img" aria-label={type}>{TYPE_ICONS[type]}</span>
        )}
        {photo_count > 1 && <span className="ec-photo-badge">📷 {photo_count}</span>}
      </div>
      <div className="ec-body">
        <div className="ec-name">{name}</div>
        <div className="ec-summary">{summary}</div>
        {note_count > 0 && <div className="ec-notes">📝 {note_count}</div>}
      </div>
    </>
  );

  if (onClick) {
    return <div className="entity-card" onClick={() => onClick(entity)} role="button" tabIndex={0}>{body}</div>;
  }
  return <Link to={`/entities/${id}`} className="entity-card">{body}</Link>;
}
