import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { analyzeImage, getLocations, getContainers, createItem } from '../utils/api';
import ItemForm from '../components/ItemForm';

export default function ScanPage() {
  const navigate = useNavigate();
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

  // Multi-item checklist state
  const [checkedItems, setCheckedItems] = useState({});
  const [locationForm, setLocationForm] = useState({ location_id: '', shelf: '', bin: '', container_id: '' });
  const [locations, setLocations] = useState([]);
  const [containers, setContainers] = useState([]);
  const [newShelfMode, setNewShelfMode] = useState(false);
  const [newBinMode, setNewBinMode] = useState(false);
  const [addingItems, setAddingItems] = useState(false);

  const setLoc = (k, v) => setLocationForm(f => ({ ...f, [k]: v }));

  // Fetch locations on mount
  useEffect(() => {
    getLocations().then(setLocations).catch(console.error);
  }, []);

  // Fetch containers when location changes
  useEffect(() => {
    if (locationForm.location_id) {
      getContainers({ location_id: locationForm.location_id }).then(setContainers).catch(console.error);
    } else {
      setContainers([]);
    }
  }, [locationForm.location_id]);

  // Derive shelves from selected location
  const selectedLocation = locations.find(l => String(l.id) === String(locationForm.location_id));
  const locationShelves = selectedLocation?.shelves
    ? selectedLocation.shelves.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const availableShelves = locationForm.shelf && !locationShelves.includes(locationForm.shelf)
    ? [...locationShelves, locationForm.shelf]
    : locationShelves;

  // Derive bins: if a shelf is selected show bins on that shelf, otherwise show all bins at the location
  const binsOnShelf = locationForm.shelf
    ? containers.filter(c => c.shelf === locationForm.shelf)
    : containers;

  // Sync container_id when shelf/bin changes
  useEffect(() => {
    if (!locationForm.bin) {
      if (locationForm.container_id) setLocationForm(f => ({ ...f, container_id: '' }));
      return;
    }
    const match = containers.find(c =>
      (c.name === locationForm.bin || c.bin === locationForm.bin)
    );
    setLocationForm(f => ({ ...f, container_id: match ? String(match.id) : '' }));
  }, [locationForm.shelf, locationForm.bin, containers]);

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
    stopCamera();
    const parsed = parseQR(data);
    if (parsed) {
      // Auto-navigate to the detail page
      let path;
      if (parsed.type === 'location' && parsed.shelf) {
        path = `/locations/${parsed.id}/shelves/${encodeURIComponent(parsed.shelf)}`;
      } else if (parsed.type === 'location') {
        path = `/locations/${parsed.id}`;
      } else {
        path = `/containers/${parsed.id}`;
      }
      toast.success('QR Code detected!');
      navigate(path);
    } else {
      // Unknown QR — show result text
      setQrResult(data);
      setMode('idle');
      toast.success('QR Code detected!');
    }
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
      // Initialize all items as checked
      const initial = {};
      (result.items || []).forEach((_, i) => { initial[i] = true; });
      setCheckedItems(initial);
    } catch (e) {
      toast.error('AI analysis failed. Fill in manually.');
      setAiResult({ items: [] });
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
    reset();
  };

  const reset = () => {
    setMode('idle');
    setAiResult(null);
    setCapturedImage(null);
    setQrResult(null);
    setCheckedItems({});
    setLocationForm({ location_id: '', shelf: '', bin: '', container_id: '' });
    setNewShelfMode(false);
    setNewBinMode(false);
    stopCamera();
  };

  const handleAddSelected = async () => {
    const items = aiResult?.items || [];
    const selected = items.filter((_, i) => checkedItems[i]);
    if (selected.length === 0) return;

    setAddingItems(true);
    try {
      let successCount = 0;
      for (const item of selected) {
        const tags = item.labels || [];
        await createItem({
          name: item.name,
          description: item.description || '',
          quantity: item.quantity || item.quantity_hint || 1,
          unit: 'each',
          location_id: locationForm.location_id || null,
          container_id: locationForm.container_id || null,
          shelf: locationForm.shelf || '',
          bin: locationForm.bin || '',
          image_url: capturedImage || null,
          ai_labels: tags,
          tags,
        });
        successCount++;
      }
      toast.success(`${successCount} item${successCount > 1 ? 's' : ''} added!`);
      reset();
    } catch (e) {
      toast.error('Some items failed to save.');
    } finally {
      setAddingItems(false);
    }
  };

  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

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
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>Scan a QR code or photograph items</div>
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
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>External or unknown QR code</div>
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
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>Identifying items from image…</div>
            </div>
          ) : aiResult && (
            <>
              {/* Item checklist */}
              <div className="ai-preview">
                <div className="ai-label">AI Detected — {aiResult.items?.length || 0} item{(aiResult.items?.length || 0) !== 1 ? 's' : ''}</div>
                {(aiResult.items || []).map((item, i) => (
                  <label key={i} className="scan-check-item">
                    <input
                      type="checkbox"
                      className="scan-checkbox"
                      checked={!!checkedItems[i]}
                      onChange={() => setCheckedItems(prev => ({ ...prev, [i]: !prev[i] }))}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                      {item.description && <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>{item.description}</div>}
                      <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {item.labels?.map(l => <span key={l} className="badge badge-green">{l}</span>)}
                        {(item.quantity || item.quantity_hint || 1) > 1 && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>
                            Qty: {item.quantity || item.quantity_hint}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Shared location form */}
              <div style={{ padding: '0 16px 24px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 16, marginBottom: 12 }}>
                  Where to put them
                </div>

                <div className="form-group">
                  <label className="form-label">Location</label>
                  <select className="form-select" value={locationForm.location_id} onChange={e => {
                    setLoc('location_id', e.target.value);
                    setLoc('shelf', ''); setLoc('bin', ''); setLoc('container_id', '');
                    setNewShelfMode(false); setNewBinMode(false);
                  }}>
                    <option value="">— No location —</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Shelf</label>
                    {availableShelves.length > 0 && !newShelfMode ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select className="form-select" style={{ flex: 1 }} value={locationForm.shelf} onChange={e => {
                          setLoc('shelf', e.target.value); setLoc('bin', ''); setLoc('container_id', '');
                          setNewBinMode(false);
                        }}>
                          <option value="">— None —</option>
                          {availableShelves.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button type="button" className="btn-icon" style={{ flexShrink: 0 }} onClick={() => {
                          setNewShelfMode(true);
                          setLoc('shelf', ''); setLoc('bin', ''); setLoc('container_id', '');
                          setNewBinMode(false);
                        }}>+</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="form-input" style={{ flex: 1 }} value={locationForm.shelf} onChange={e => {
                          setLoc('shelf', e.target.value); setLoc('bin', ''); setLoc('container_id', '');
                          setNewBinMode(false);
                        }} placeholder="New shelf name" autoFocus={newShelfMode} />
                        {availableShelves.length > 0 && (
                          <button type="button" className="btn-icon" style={{ flexShrink: 0 }} onClick={() => {
                            setNewShelfMode(false); setLoc('shelf', ''); setLoc('bin', ''); setLoc('container_id', '');
                          }}>✕</button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Bin</label>
                    {binsOnShelf.length > 0 && !newBinMode ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select className="form-select" style={{ flex: 1 }} value={locationForm.bin} onChange={e => setLoc('bin', e.target.value)}>
                          <option value="">— None —</option>
                          {binsOnShelf.map(c => <option key={c.id} value={c.bin || c.name}>{c.name}</option>)}
                        </select>
                        <button type="button" className="btn-icon" style={{ flexShrink: 0 }} onClick={() => {
                          setNewBinMode(true); setLoc('bin', ''); setLoc('container_id', '');
                        }}>+</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="form-input" style={{ flex: 1 }} value={locationForm.bin} onChange={e => setLoc('bin', e.target.value)} placeholder={locationForm.shelf ? 'New bin name' : ''} autoFocus={newBinMode} />
                        {binsOnShelf.length > 0 && (
                          <button type="button" className="btn-icon" style={{ flexShrink: 0 }} onClick={() => {
                            setNewBinMode(false); setLoc('bin', ''); setLoc('container_id', '');
                          }}>✕</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 8 }}
                  disabled={addingItems || checkedCount === 0}
                  onClick={handleAddSelected}
                >
                  {addingItems ? 'Adding…' : `Add ${checkedCount} Selected Item${checkedCount !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
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
