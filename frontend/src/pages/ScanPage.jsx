import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { analyzeImage, getLocations, getContainers, createItem } from '../utils/api';
import ItemForm from '../components/ItemForm';

export default function ScanPage() {
  const [mode, setMode] = useState('idle'); // idle | camera | qr | preview | form
  const [stream, setStream] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [qrResult, setQrResult] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const qrVideoRef = useRef(null);
  const qrCanvasRef = useRef(null);
  const fileRef = useRef(null);
  const scanningRef = useRef(false);
  const animFrameRef = useRef(null);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setStream(s);
      setMode('camera');
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = s; }, 100);
    } catch (e) {
      toast.error('Camera access denied. Use file upload instead.');
    }
  };

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    scanningRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, [stream]);

  const startQRScan = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      setStream(s);
      setMode('qr');
      scanningRef.current = true;
      setTimeout(() => {
        if (qrVideoRef.current) {
          qrVideoRef.current.srcObject = s;
          qrVideoRef.current.play();
          scanQRFrame();
        }
      }, 200);
    } catch (e) {
      toast.error('Camera access denied.');
    }
  };

  const scanQRFrame = () => {
    if (!scanningRef.current) return;
    const video = qrVideoRef.current;
    const canvas = qrCanvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanQRFrame);
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
      handleQRDetected(code.data);
      return;
    }
    animFrameRef.current = requestAnimationFrame(scanQRFrame);
  };

  const handleQRDetected = (data) => {
    setQrResult(data);
    stopCamera();
    toast.success('QR Code detected!');
  };

  useEffect(() => {
    return () => {
      scanningRef.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      setCapturedImage(url);
      stopCamera();
      await runAnalysis(file);
    }, 'image/jpeg', 0.9);
  }, [stream, stopCamera]);

  const runAnalysis = async (file) => {
    setAnalyzing(true);
    setMode('preview');
    try {
      const result = await analyzeImage(file);
      // Use Cloudinary URL if returned, keeping blob URL as local preview fallback
      if (result.image_url) setCapturedImage(result.image_url);
      setAiResult(result);
    } catch (e) {
      toast.error('AI analysis failed. Fill in manually.');
      setAiResult({});
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCapturedImage(url);
    runAnalysis(file);
  };

  const handleSave = async (data) => {
    await createItem(data);
    toast.success('Item saved!');
    setMode('idle');
    setAiResult(null);
    setCapturedImage(null);
  };

  const reset = () => {
    setMode('idle');
    setAiResult(null);
    setCapturedImage(null);
    setQrResult(null);
    stopCamera();
  };

  const parseQR = (data) => {
    const m = data.match(/^stockr:\/\/(location|container)\/(\d+)(\/shelf\/(.+))?$/);
    if (m) {
      return { type: m[1], id: m[2], shelf: m[4] || null };
    }
    return null;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">SCAN</div>
        {mode !== 'idle' && <button className="btn-icon" onClick={reset}>✕</button>}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={qrCanvasRef} style={{ display: 'none' }} />

      {mode === 'idle' && !qrResult && (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>◎</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>Scan a QR code or photograph an item</div>
          </div>
          <button className="btn btn-primary btn-full" onClick={startQRScan}>
            ⬡ Scan QR Code
          </button>
          <button className="btn btn-ghost btn-full" onClick={startCamera}>
            📷 Photo + AI Identify
          </button>
          <button className="btn btn-ghost btn-full" onClick={() => fileRef.current?.click()}>
            🖼 Upload Photo
          </button>
          <button className="btn btn-ghost btn-full" onClick={() => { setMode('form'); setAiResult({}); }}>
            ✏️ Manual Entry
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
        </div>
      )}

      {mode === 'idle' && qrResult && (
        <div style={{ padding: 20 }}>
          <div className="ai-preview">
            <div className="ai-label">QR Code Result</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, wordBreak: 'break-all', marginBottom: 12 }}>{qrResult}</div>
            {(() => {
              const parsed = parseQR(qrResult);
              if (parsed) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                      {parsed.type === 'location' ? '📍 Location' : '▣ Container'} #{parsed.id}
                      {parsed.shelf && ` · Shelf ${parsed.shelf}`}
                    </div>
                    <a
                      href={parsed.type === 'location' ? '/locations' : '/containers'}
                      className="btn btn-primary btn-full"
                      style={{ textDecoration: 'none', textAlign: 'center' }}
                    >
                      Go to {parsed.type === 'location' ? 'Locations' : 'Containers'}
                    </a>
                  </div>
                );
              }
              return <div style={{ fontSize: 13, color: 'var(--text2)' }}>External or unknown QR code</div>;
            })()}
          </div>
          <button className="btn btn-ghost btn-full" style={{ marginTop: 12 }} onClick={reset}>Scan Again</button>
        </div>
      )}

      {mode === 'qr' && (
        <div>
          <div className="scan-area">
            <video ref={qrVideoRef} className="scan-video" autoPlay playsInline muted />
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
          <div className="scan-actions" style={{ position: 'fixed', bottom: 'calc(var(--nav-h) + 12px)', left: 0, right: 0, padding: '0 16px', zIndex: 50 }}>
            <button className="btn btn-ghost btn-full" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'camera' && (
        <div>
          <div className="scan-area">
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
          </div>
          <div className="scan-actions" style={{ position: 'fixed', bottom: 'calc(var(--nav-h) + 12px)', left: 0, right: 0, padding: '0 16px', zIndex: 50 }}>
            <button className="btn btn-primary btn-full" style={{ fontSize: 18, padding: '16px' }} onClick={capturePhoto}>
              ◎ Capture
            </button>
            <button className="btn btn-ghost btn-full" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'preview' && (
        <div>
          {capturedImage && (
            <div style={{ margin: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <img src={capturedImage} alt="Captured" style={{ width: '100%', maxHeight: 240, objectFit: 'cover' }} />
            </div>
          )}
          {analyzing ? (
            <div className="ai-preview">
              <div className="ai-label pulsing">AI Analyzing…</div>
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>Identifying item from image…</div>
            </div>
          ) : aiResult && (
            <div className="ai-preview">
              <div className="ai-label">AI Detected</div>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{aiResult.name}</div>
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>{aiResult.description}</div>
              {aiResult.labels?.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {aiResult.labels.map(l => <span key={l} className="badge badge-green">{l}</span>)}
                </div>
              )}
              <button className="btn btn-primary btn-full" style={{ marginTop: 14 }} onClick={() => setMode('form')}>
                Continue →
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'form' && (
        <ItemForm
          initial={aiResult}
          capturedImage={capturedImage}
          onSave={handleSave}
          onCancel={reset}
        />
      )}
    </div>
  );
}
