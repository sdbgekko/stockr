import { useState, useRef, useEffect, useCallback } from 'react';

const ACTION_WIDTH = 72;

export default function SwipeableCard({ children, actions = [], isOpen, onSwipeOpen }) {
  const [translateX, setTranslateX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const touchRef = useRef({ startX: 0, startY: 0, decided: false, swiping: false });
  const contentRef = useRef(null);
  const maxReveal = actions.length * ACTION_WIDTH;

  // Sync with controlled open state
  useEffect(() => {
    if (!isOpen && translateX !== 0) {
      setAnimating(true);
      setTranslateX(0);
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, decided: false, swiping: false };
    setAnimating(false);
  }, []);

  const handleTouchMove = useCallback((e) => {
    const t = touchRef.current;
    const touch = e.touches[0];
    const dx = touch.clientX - t.startX;
    const dy = touch.clientY - t.startY;

    if (!t.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      t.decided = true;
      t.swiping = Math.abs(dx) > Math.abs(dy);
      if (!t.swiping) return;
    }

    if (!t.swiping) return;

    e.preventDefault();
    const base = isOpen ? -maxReveal : 0;
    const raw = base + dx;
    setTranslateX(Math.max(-maxReveal, Math.min(0, raw)));
  }, [isOpen, maxReveal]);

  const handleTouchEnd = useCallback(() => {
    const t = touchRef.current;
    if (!t.swiping) return;

    setAnimating(true);
    if (Math.abs(translateX) > maxReveal * 0.4) {
      setTranslateX(-maxReveal);
      onSwipeOpen?.();
    } else {
      setTranslateX(0);
    }
  }, [translateX, maxReveal, onSwipeOpen]);

  // Attach native touchmove with passive: false for preventDefault
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = (e) => {
      if (touchRef.current.swiping) e.preventDefault();
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  return (
    <div className="swipeable-wrapper">
      <div className="swipeable-actions">
        {actions.map((action, i) => (
          <button
            key={i}
            className="swipeable-action"
            style={{ background: action.color || 'var(--danger)' }}
            onClick={action.onClick}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
      <div
        ref={contentRef}
        className="swipeable-content"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: animating ? 'transform 0.3s ease' : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
