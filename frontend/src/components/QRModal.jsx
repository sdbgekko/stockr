import { useEffect, useRef } from 'react';

export default function QRModal({ data, title, onClose }) {
  const imgRef = useRef(null);

  useEffect(() => {
    if (!window.qrcode) return;
    const qr = window.qrcode(0, 'M');
    qr.addData(data);
    qr.make();
    if (imgRef.current) {
      imgRef.current.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 4 });
      // Make SVG white on white background for visibility
      const svg = imgRef.current.querySelector('svg');
      if (svg) {
        svg.style.borderRadius = '8px';
        svg.style.background = '#ffffff';
      }
    }
  }, [data]);

  const handleDownload = () => {
    if (!imgRef.current) return;
    const svg = imgRef.current.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `${title || 'qr-code'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-handle" />
        <div className="modal-title">{title || 'QR Code'}</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <div ref={imgRef} />
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
