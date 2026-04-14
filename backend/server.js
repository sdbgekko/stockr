// ShelfSnap v2 — polymorphic entity model
// See docs/DESIGN-v2.md
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const cloudinary = require('cloudinary').v2;
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

app.use(cors());
app.use(express.json());
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const cloudinaryEnabled = !!process.env.CLOUDINARY_URL;
if (cloudinaryEnabled) console.log('☁️  Cloudinary enabled');

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'shelfsnap', resource_type: 'image', transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto' }] },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    stream.end(buffer);
  });
}

function qrSlug() {
  // 8 url-safe chars, ~2e14 combos — plenty for personal use
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

// ─── Schema ───────────────────────────────────────────────────────────────────
async function initDB() {
  // Clean reset per DESIGN-v2. No legacy data to migrate.
  await pool.query(`
    DROP TABLE IF EXISTS items CASCADE;
    DROP TABLE IF EXISTS containers CASCADE;
    DROP TABLE IF EXISTS locations CASCADE;

    CREATE TABLE IF NOT EXISTS entities (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type           VARCHAR(20) NOT NULL CHECK (type IN
                      ('location','area','rack','shelf','bin','item')),
      parent_id      UUID REFERENCES entities(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      description    TEXT,
      metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
      barcode        VARCHAR(100),
      qr_slug        VARCHAR(32) UNIQUE,
      rep_photo_id   UUID,
      sort_order     INT NOT NULL DEFAULT 0,
      is_active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_entities_parent  ON entities(parent_id);
    CREATE INDEX IF NOT EXISTS idx_entities_type    ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_entities_barcode ON entities(barcode) WHERE barcode IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_entities_qr      ON entities(qr_slug) WHERE qr_slug IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_entities_active  ON entities(is_active, type);

    CREATE TABLE IF NOT EXISTS entity_photos (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      url           TEXT NOT NULL,
      ai_labels     TEXT[] DEFAULT '{}',
      sort_order    INT NOT NULL DEFAULT 0,
      uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_entity_photos_entity ON entity_photos(entity_id);

    CREATE TABLE IF NOT EXISTS entity_notes (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      content       TEXT NOT NULL,
      created_by    UUID,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_entity_notes_entity ON entity_notes(entity_id);

    CREATE TABLE IF NOT EXISTS upc_cache (
      barcode       VARCHAR(100) PRIMARY KEY,
      source        VARCHAR(30),
      name          TEXT,
      description   TEXT,
      image_url     TEXT,
      raw           JSONB,
      fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // FK for rep_photo (circular, add after both tables exist)
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_entities_rep_photo'
      ) THEN
        ALTER TABLE entities ADD CONSTRAINT fk_entities_rep_photo
          FOREIGN KEY (rep_photo_id) REFERENCES entity_photos(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // 10-photo cap trigger
  await pool.query(`
    CREATE OR REPLACE FUNCTION cap_entity_photos() RETURNS TRIGGER AS $$
    BEGIN
      IF (SELECT COUNT(*) FROM entity_photos WHERE entity_id = NEW.entity_id) > 10 THEN
        RAISE EXCEPTION 'Entity already has 10 photos (max)';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS enforce_photo_cap ON entity_photos;
    CREATE TRIGGER enforce_photo_cap AFTER INSERT ON entity_photos
      FOR EACH ROW EXECUTE FUNCTION cap_entity_photos();
  `);

  console.log('📦 ShelfSnap v2 schema ready');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function hydrateEntity(row) {
  // Attach rep_photo url, photo count, child counts
  const [photosRes, childrenRes, notesRes] = await Promise.all([
    pool.query('SELECT id, url FROM entity_photos WHERE entity_id = $1 ORDER BY sort_order, uploaded_at', [row.id]),
    pool.query(`SELECT type, COUNT(*)::int AS n FROM entities WHERE parent_id = $1 AND is_active GROUP BY type`, [row.id]),
    pool.query('SELECT COUNT(*)::int AS n FROM entity_notes WHERE entity_id = $1', [row.id]),
  ]);
  const photos = photosRes.rows;
  const rep = photos.find(p => p.id === row.rep_photo_id) || photos[0];
  const childCounts = {};
  for (const r of childrenRes.rows) childCounts[r.type] = r.n;
  return {
    ...row,
    photos,
    photo_count: photos.length,
    rep_photo_url: rep ? rep.url : null,
    child_counts: childCounts,
    note_count: notesRes.rows[0].n,
  };
}

// ─── Entity CRUD ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, version: 'v2' }));

app.get('/api/entities', async (req, res) => {
  try {
    const { type, parent_id, search, include_inactive } = req.query;
    const where = [];
    const params = [];
    if (!include_inactive) where.push('is_active = TRUE');
    if (type) { params.push(type); where.push(`type = $${params.length}`); }
    if (parent_id === 'null' || parent_id === '') {
      where.push('parent_id IS NULL');
    } else if (parent_id) {
      params.push(parent_id); where.push(`parent_id = $${params.length}`);
    }
    if (search) { params.push(`%${search}%`); where.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length} OR barcode = $${params.length - 0})`); }
    const sql = `SELECT * FROM entities ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY sort_order, name`;
    const result = await pool.query(sql, params);
    const hydrated = await Promise.all(result.rows.map(hydrateEntity));
    res.json(hydrated);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.get('/api/entities/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM entities WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const entity = await hydrateEntity(rows[0]);
    // Also attach notes and breadcrumb path
    const notes = await pool.query('SELECT * FROM entity_notes WHERE entity_id = $1 ORDER BY created_at DESC', [req.params.id]);
    const path = await pool.query(`
      WITH RECURSIVE crumbs AS (
        SELECT id, parent_id, name, type, 0 AS depth FROM entities WHERE id = $1
        UNION ALL
        SELECT e.id, e.parent_id, e.name, e.type, c.depth + 1 FROM entities e JOIN crumbs c ON e.id = c.parent_id
      )
      SELECT id, name, type FROM crumbs ORDER BY depth DESC
    `, [req.params.id]);
    entity.notes = notes.rows;
    entity.path = path.rows;
    res.json(entity);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/entities', async (req, res) => {
  try {
    const { type, parent_id, name, description, metadata, barcode } = req.body;
    if (!type || !name) return res.status(400).json({ error: 'type and name required' });
    const { rows } = await pool.query(
      `INSERT INTO entities (type, parent_id, name, description, metadata, barcode, qr_slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [type, parent_id || null, name, description || null, metadata || {}, barcode || null, qrSlug()]
    );
    res.status(201).json(await hydrateEntity(rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.patch('/api/entities/:id', async (req, res) => {
  try {
    const allowed = ['name', 'description', 'metadata', 'barcode', 'parent_id', 'sort_order', 'rep_photo_id', 'is_active'];
    const updates = [];
    const params = [];
    for (const k of allowed) {
      if (k in req.body) { params.push(req.body[k]); updates.push(`${k} = $${params.length}`); }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE entities SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(await hydrateEntity(rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/entities/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE entities SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Photos ───────────────────────────────────────────────────────────────────
app.get('/api/entities/:id/photos', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM entity_photos WHERE entity_id = $1 ORDER BY sort_order, uploaded_at', [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/entities/:id/photos', upload.single('file'), async (req, res) => {
  try {
    if (!cloudinaryEnabled) return res.status(503).json({ error: 'Photo upload disabled (CLOUDINARY_URL not set)' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const url = await uploadToCloudinary(req.file.buffer);
    const { rows } = await pool.query(
      'INSERT INTO entity_photos (entity_id, url) VALUES ($1, $2) RETURNING *',
      [req.params.id, url]
    );
    // If this is the first photo, auto-star it
    await pool.query(
      `UPDATE entities SET rep_photo_id = $1 WHERE id = $2 AND rep_photo_id IS NULL`,
      [rows[0].id, req.params.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (/Max/.test(e.message)) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/entities/:id/photos/:photoId', async (req, res) => {
  try {
    await pool.query('DELETE FROM entity_photos WHERE id = $1 AND entity_id = $2', [req.params.photoId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/entities/:id/rep-photo', async (req, res) => {
  try {
    const { photo_id } = req.body;
    await pool.query('UPDATE entities SET rep_photo_id = $1, updated_at = NOW() WHERE id = $2', [photo_id, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Notes ────────────────────────────────────────────────────────────────────
app.get('/api/entities/:id/notes', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM entity_notes WHERE entity_id = $1 ORDER BY created_at DESC', [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/entities/:id/notes', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });
    const { rows } = await pool.query(
      'INSERT INTO entity_notes (entity_id, content) VALUES ($1, $2) RETURNING *',
      [req.params.id, content.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/entities/:id/notes/:noteId', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content required' });
    const { rows } = await pool.query(
      `UPDATE entity_notes SET content = $1, updated_at = NOW()
       WHERE id = $2 AND entity_id = $3 RETURNING *`,
      [content.trim(), req.params.noteId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/entities/:id/notes/:noteId', async (req, res) => {
  try {
    await pool.query('DELETE FROM entity_notes WHERE id = $1 AND entity_id = $2', [req.params.noteId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── QR codes ─────────────────────────────────────────────────────────────────
app.get('/api/entities/:id/qr', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT qr_slug, name, type FROM entities WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const { qr_slug, name, type } = rows[0];
    const url = `${process.env.PUBLIC_URL || 'https://shelfsnap.app'}/go/${qr_slug}`;
    const size = parseInt(req.query.size, 10) || 300;
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="${type}-${name.replace(/[^a-z0-9]/gi, '_')}.png"`);
    QRCode.toFileStream(res, url, { width: size, margin: 1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/go/:slug', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id FROM entities WHERE qr_slug = $1 AND is_active', [req.params.slug]);
    if (!rows[0]) return res.status(404).send('Entity not found');
    const appUrl = process.env.APP_URL || '';
    res.redirect(`${appUrl}/#/entities/${rows[0].id}`);
  } catch (e) { res.status(500).send('Error'); }
});

// ─── UPC lookup ───────────────────────────────────────────────────────────────
async function lookupOpenFoodFacts(barcode) {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    const d = await r.json();
    if (d.status !== 1) return null;
    const p = d.product || {};
    return {
      source: 'openfoodfacts',
      name: p.product_name || p.product_name_en || null,
      description: p.generic_name || p.ingredients_text || null,
      image_url: p.image_url || p.image_front_url || null,
      raw: p,
    };
  } catch { return null; }
}

app.post('/api/upc/lookup', async (req, res) => {
  try {
    const { barcode } = req.body;
    if (!barcode) return res.status(400).json({ error: 'barcode required' });
    // Cache hit?
    const cached = await pool.query('SELECT * FROM upc_cache WHERE barcode = $1', [barcode]);
    if (cached.rows[0] && cached.rows[0].name) return res.json(cached.rows[0]);
    // Try Open Food Facts
    const off = await lookupOpenFoodFacts(barcode);
    if (off && off.name) {
      await pool.query(
        `INSERT INTO upc_cache (barcode, source, name, description, image_url, raw)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (barcode) DO UPDATE SET name=$3, description=$4, image_url=$5, raw=$6, fetched_at=NOW()`,
        [barcode, off.source, off.name, off.description, off.image_url, off.raw]
      );
      return res.json({ barcode, ...off });
    }
    // Miss — store stub so we don't retry for 7 days
    await pool.query(
      `INSERT INTO upc_cache (barcode, source, raw) VALUES ($1, 'miss', '{}'::jsonb)
       ON CONFLICT (barcode) DO NOTHING`,
      [barcode]
    );
    res.json({ barcode, source: 'miss', name: null });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─── Vision analyze (stub — will wire Ollama in Phase 4c) ─────────────────────
app.post('/api/vision/analyze', async (_req, res) => {
  res.json({ items: [], note: 'Ollama vision integration pending — Phase 4c' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, version: 'v2' }));

initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 ShelfSnap v2 API on :${PORT}`));
}).catch(err => { console.error('initDB failed:', err); process.exit(1); });
