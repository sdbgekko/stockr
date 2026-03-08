import { useRef, useEffect, useCallback } from 'react';
import Portal from './Portal';

export default function QRScannerModal({ onDetected, onClose, title }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanningRef = useRef(false);
  const animFrameRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const scanFrame = useCallback(() => {
    if (!scanningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) {
      scanningRef.current = false;
      stopCamera();
      onDetected(code.data);
      return;
    }
    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [onDetected, stopCamera]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        if (!mounted) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        scanningRef.current = true;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
          scanFrame();
        }
      } catch {
        // Camera denied — just close
        if (mounted) onClose();
      }
    })();
    return () => {
      mounted = false;
      stopCamera();
    };
  }, []); // intentionally run only on mount

  return (
    <Portal>
      <div className="qr-scanner-modal">
        <div className="qr-scanner-header">
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#fff', letterSpacing: '0.05em' }}>
            {title || 'Scan QR Code'}
          </div>
          <button className="btn-icon" style={{ color: '#fff' }} onClick={() => { stopCamera(); onClose(); }}>✕</button>
        </div>
        <div className="qr-scanner-body">
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <video ref={videoRef} className="scan-video" autoPlay playsInline muted />
          <div className="scan-overlay">
            <div style={{ position: 'relative' }}>
              <div className="scan-frame" />
              <div className="scan-corner tl" />
              <div className="scan-corner tr" />
              <div className="scan-corner bl" />
              <div className="scan-corner br" />
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 12, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            Point at a QR code
          </div>
        </div>
        <div style={{ padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: 'rgba(0,0,0,0.8)' }}>
          <button className="btn btn-ghost btn-full" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} onClick={() => { stopCamera(); onClose(); }}>
            Cancel
          </button>
        </div>
      </div>
    </Portal>
  );
}
