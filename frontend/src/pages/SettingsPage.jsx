import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getLocations, getLocation, getContainers } from '../utils/api';

export default function SettingsPage() {
  const [theme, setTheme] = useState(localStorage.getItem('stockr-theme') || 'dark');
  const [tree, setTree] = useState([]);
  const [checked, setChecked] = useState({});
  const [loadingTree, setLoadingTree] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Theme toggle
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('stockr-theme', next);
  };

  // Load location/shelf/bin tree
  useEffect(() => {
    (async () => {
      try {
        const [locations, containers] = await Promise.all([getLocations(), getContainers()]);
        const items = [];
        const initialChecked = {};

        for (const loc of locations) {
          const detail = await getLocation(loc.id);
          const locKey = `loc-${loc.id}`;
          items.push({
            key: locKey,
            type: 'location',
            label: loc.name,
            data: `stockr://location/${loc.id}`,
            indent: 0,
          });
          initialChecked[locKey] = true;

          // Shelves
          const shelves = detail.shelves ? detail.shelves.split(',').map(s => s.trim()).filter(Boolean) : [];
          for (const shelf of shelves) {
            const shelfKey = `shelf-${loc.id}-${shelf}`;
            items.push({
              key: shelfKey,
              type: 'shelf',
              label: `${loc.name} / Shelf ${shelf}`,
              data: `stockr://location/${loc.id}/shelf/${shelf}`,
              indent: 1,
            });
            initialChecked[shelfKey] = true;
          }

          // Bins at this location
          const locBins = containers.filter(c => String(c.location_id) === String(loc.id));
          for (const bin of locBins) {
            const binKey = `bin-${bin.id}`;
            items.push({
              key: binKey,
              type: 'bin',
              label: `${loc.name}${bin.shelf ? ` / Shelf ${bin.shelf}` : ''} / ${bin.name}`,
              data: `stockr://container/${bin.id}`,
              indent: 1,
            });
            initialChecked[binKey] = true;
          }
        }

        // Bins without location
        const unassigned = containers.filter(c => !c.location_id);
        for (const bin of unassigned) {
          const binKey = `bin-${bin.id}`;
          items.push({
            key: binKey,
            type: 'bin',
            label: bin.name,
            data: `stockr://container/${bin.id}`,
            indent: 0,
          });
          initialChecked[binKey] = true;
        }

        setTree(items);
        setChecked(initialChecked);
      } catch (e) {
        toast.error('Failed to load inventory tree');
      } finally {
        setLoadingTree(false);
      }
    })();
  }, []);

  const allChecked = tree.length > 0 && tree.every(item => checked[item.key]);
  const noneChecked = tree.length > 0 && tree.every(item => !checked[item.key]);

  const toggleAll = () => {
    const next = {};
    const val = !allChecked;
    tree.forEach(item => { next[item.key] = val; });
    setChecked(next);
  };

  const toggleItem = (key) => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedCount = tree.filter(item => checked[item.key]).length;

  // QR → PNG helper (reuses QRModal pattern)
  const qrToPng = useCallback((data, size = 200) => {
    return new Promise((resolve) => {
      const qr = window.qrcode(0, 'M');
      qr.addData(data);
      qr.make();
      const svgStr = qr.createSvgTag({ cellSize: 6, margin: 4 });
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgStr, 'image/svg+xml');
      const svg = svgDoc.documentElement;
      const svgData = new XMLSerializer().serializeToString(svg);

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    });
  }, []);

  const generatePdf = async () => {
    const selected = tree.filter(item => checked[item.key]);
    if (selected.length === 0) {
      toast.error('Select at least one item');
      return;
    }

    setGenerating(true);
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

      const pageW = 215.9;
      const pageH = 279.4;
      const margin = 12;
      const cols = 3;
      const rows = 4;
      const cellW = (pageW - margin * 2) / cols;
      const cellH = (pageH - margin * 2) / rows;
      const qrSize = Math.min(cellW - 8, cellH - 16) * 0.85;
      const perPage = cols * rows;

      for (let i = 0; i < selected.length; i++) {
        if (i > 0 && i % perPage === 0) doc.addPage();

        const idx = i % perPage;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = margin + col * cellW;
        const y = margin + row * cellH;

        // Draw cell border (light gray)
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(x, y, cellW, cellH);

        // Generate QR
        const pngData = await qrToPng(selected[i].data, 400);
        const qrX = x + (cellW - qrSize) / 2;
        const qrY = y + 4;
        doc.addImage(pngData, 'PNG', qrX, qrY, qrSize, qrSize);

        // Label text below QR
        doc.setFontSize(7);
        doc.setTextColor(60, 60, 60);
        const labelLines = doc.splitTextToSize(selected[i].label, cellW - 6);
        const labelY = qrY + qrSize + 3;
        doc.text(labelLines.slice(0, 2), x + cellW / 2, labelY, { align: 'center' });
      }

      doc.save('stockr-qr-labels.pdf');
      toast.success(`PDF generated with ${selected.length} labels`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ color: 'var(--text3)', fontSize: 18, textDecoration: 'none', lineHeight: 1, padding: 4 }}>←</Link>
          <div>
            <div className="page-title">SETTINGS</div>
            <div className="page-subtitle">Preferences & tools</div>
          </div>
        </div>
      </div>

      {/* Theme Toggle */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Appearance
        </div>
        <div className="card" style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Theme</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              {theme === 'dark' ? 'Dark mode' : 'Light mode'}
            </div>
          </div>
          <button
            onClick={toggleTheme}
            style={{
              width: 52,
              height: 28,
              borderRadius: 14,
              border: 'none',
              background: theme === 'dark' ? 'var(--accent)' : 'var(--border)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 3,
              left: theme === 'dark' ? 27 : 3,
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
      </div>

      {/* QR Code PDF Generator */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Print QR Code Labels
        </div>

        {loadingTree ? (
          <div className="loading pulsing">Loading inventory...</div>
        ) : tree.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No locations or bins to generate labels for
          </div>
        ) : (
          <>
            {/* Select all / none toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
                {allChecked ? 'Deselect All' : 'Select All'}
              </button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                {selectedCount} / {tree.length} selected
              </span>
            </div>

            {/* Checklist */}
            <div className="card" style={{ margin: '0 0 16px', padding: '4px 14px', maxHeight: '45dvh', overflowY: 'auto' }}>
              {tree.map(item => (
                <label
                  key={item.key}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    padding: '10px 0',
                    paddingLeft: item.indent * 20,
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!checked[item.key]}
                    onChange={() => toggleItem(item.key)}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: item.indent === 0 ? 600 : 400, color: 'var(--text)' }}>
                      {item.type === 'location' && '📍 '}
                      {item.type === 'shelf' && '📦 '}
                      {item.type === 'bin' && '▣ '}
                      {item.label}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.data}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Generate button */}
            <button
              className="btn btn-primary btn-full"
              onClick={generatePdf}
              disabled={generating || selectedCount === 0}
              style={{ opacity: generating ? 0.6 : 1 }}
            >
              {generating ? 'Generating...' : `Generate PDF (${selectedCount} labels)`}
            </button>
            <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
              3 columns × 4 rows per page · Letter size
            </div>
          </>
        )}
      </div>

      {/* App Info */}
      <div style={{ padding: '32px 16px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
          Stockr Inventory
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, opacity: 0.5 }}>
          Built with care
        </div>
      </div>
    </div>
  );
}
