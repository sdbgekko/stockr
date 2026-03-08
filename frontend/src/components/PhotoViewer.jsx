import { useState, useRef, useCallback, useEffect } from 'react';

export default function PhotoViewer({ images, startIndex, onClose, onDelete }) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const touchStartX = useRef(null);

  // Keep index in bounds if images array changes (e.g. after delete)
  useEffect(() => {
    if (currentIndex >= images.length) {
      if (images.length === 0) onClose();
      else setCurrentIndex(images.length - 1);
    }
  }, [images.length, currentIndex, onClose]);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex(i => Math.min(images.length - 1, i + 1));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goPrev, goNext, onClose]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 50) return; // threshold
    if (delta < 0) goNext();
    else goPrev();
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(images[currentIndex]);
  };

  if (images.length === 0) return null;

  return (
    <div className="photo-viewer"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button className="photo-viewer-close" onClick={onClose}>✕</button>

      {/* Previous arrow */}
      {currentIndex > 0 && (
        <button className="photo-viewer-nav photo-viewer-prev"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}>
          ‹
        </button>
      )}

      <img src={images[currentIndex]} alt="" onClick={e => e.stopPropagation()} />

      {/* Next arrow */}
      {currentIndex < images.length - 1 && (
        <button className="photo-viewer-nav photo-viewer-next"
          onClick={(e) => { e.stopPropagation(); goNext(); }}>
          ›
        </button>
      )}

      {/* Counter + actions */}
      <div className="photo-viewer-actions">
        {images.length > 1 && (
          <span style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--mono)', fontSize: 12 }}>
            {currentIndex + 1} / {images.length}
          </span>
        )}
        <button className="btn btn-danger btn-sm" onClick={handleDelete}>
          Delete Photo
        </button>
      </div>
    </div>
  );
}
