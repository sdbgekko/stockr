import { useEffect, useRef } from 'react';

export default function QRModal({ data, title, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && window.QRCode) {
      window.QRCode.toCanvas(canvasRef.current, data, {
        width: 256,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
    }
  }, [data]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `${title || 'qr-code'}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">{title || 'QR Code'}</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <canvas ref={canvasRef} style={{ borderRadius: 8 }} />
        </div>
        <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 16, wordBreak: 'break-all' }}>
          {data}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleDownload}>Download</button>
        </div>
      </div>
    </div>
  );
}
