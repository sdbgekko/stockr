import { useNavigate } from 'react-router-dom';

/**
 * Bottom FAB bar — 5 slots, context-aware.
 *
 *   🏠 (Home)  📝 (Note)  ➕ (Scan)  📷 (Photos)  ☰ (More)
 *
 * Props:
 *   onNote    — handler to add a note to the current entity (null if N/A)
 *   onPhotos  — handler to open photo gallery (null if N/A)
 *   onMore    — handler to show the More menu (optional)
 */
export default function FABBar({ onNote, onPhotos, onMore }) {
  const navigate = useNavigate();
  return (
    <nav className="fab-bar">
      <button className="fab-slot" onClick={() => navigate('/')} title="Home">
        <span className="fab-icon">🏠</span>
      </button>
      <button
        className={`fab-slot ${!onNote ? 'fab-disabled' : ''}`}
        disabled={!onNote}
        onClick={onNote || undefined}
        title="Add note"
      >
        <span className="fab-icon">📝</span>
      </button>
      <button className="fab-slot fab-center" onClick={() => navigate('/scan')} title="Scan / Add">
        <span className="fab-icon fab-plus">➕</span>
      </button>
      <button
        className={`fab-slot ${!onPhotos ? 'fab-disabled' : ''}`}
        disabled={!onPhotos}
        onClick={onPhotos || undefined}
        title="Photos"
      >
        <span className="fab-icon">📷</span>
      </button>
      <button className="fab-slot" onClick={onMore || undefined} title="More">
        <span className="fab-icon">☰</span>
      </button>
    </nav>
  );
}
