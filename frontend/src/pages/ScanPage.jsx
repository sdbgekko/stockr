import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { analyzeImage, getLocations, getContainers, createItem } from '../utils/api';
import ItemForm from '../components/ItemForm';

export default function ScanPage() {
  const [mode, setMode] = useState('idle'); // idle | camera | preview | form
  const [stream, setStream] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);

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

  const stopCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    setStream(null);
    setMode('idle');
  };

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
  }, [stream]);

  const runAnalysis = async (file) => {
    setAnalyzing(true);
    setMode('preview');
    try {
      const result = await analyzeImage(file);
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
    await createItem({ ...data, image_url: capturedImage });
    toast.success('Item saved!');
    setMode('idle');
    setAiResult(null);
    setCapturedImage(null);
  };

  const reset = () => { setMode('idle'); setAiResult(null); setCapturedImage(null); stopCamera(); };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">SCAN ITEM</div>
        {mode !== 'idle' && <button className="btn-icon" onClick={reset}>✕</button>}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {mode === 'idle' && (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>◎</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>Point camera at item or shelf</div>
          </div>
          <button className="btn btn-primary btn-full" onClick={startCamera}>
            📷 Open Camera
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
  <button className="btn btn-ghost btn-full" onClick={stopCamera}>Cancel</button>
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
