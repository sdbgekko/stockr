require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3001;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Middleware
app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/', limiter);

// Multer for image uploads (in-memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Cloudinary config (uses CLOUDINARY_URL env var automatically)
const cloudinaryEnabled = !!process.env.CLOUDINARY_URL;
if (cloudinaryEnabled) console.log('☁️  Cloudinary enabled');

function uploadToCloudinary(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'stockr', resource_type: 'image', transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }] },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    stream.end(buffer);
  });
}

// ─── DB Init ──────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS locations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('warehouse', 'room', 'area')),
      description TEXT,
      shelves TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS containers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      shelf VARCHAR(100),
      bin VARCHAR(100),
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      quantity INTEGER DEFAULT 1,
      unit VARCHAR(50) DEFAULT 'each',
      container_id INTEGER REFERENCES containers(id) ON DELETE SET NULL,
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      shelf VARCHAR(100),
      bin VARCHAR(100),
      image_url TEXT,
      ai_labels JSONB DEFAULT '[]',
      barcode VARCHAR(255),
      tags JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_items_container ON items(container_id);
    CREATE INDEX IF NOT EXISTS idx_items_location ON items(location_id);
    CREATE INDEX IF NOT EXISTS idx_containers_location ON containers(location_id);
  `);
  // Migration: add shelves column if missing
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS shelves TEXT DEFAULT '';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  // Migration: add image_url and shelf_images to locations
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS image_url TEXT;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE locations ADD COLUMN IF NOT EXISTS shelf_images JSONB DEFAULT '{}';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  // Migration: add images JSONB column to containers
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE containers ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  // Migration: convert shelf_images from single URL strings to arrays
  await pool.query(`
    UPDATE locations
    SET shelf_images = (
      SELECT COALESCE(jsonb_object_agg(key,
        CASE
          WHEN jsonb_typeof(value) = 'string' THEN jsonb_build_array(value)
          WHEN jsonb_typeof(value) = 'array' THEN value
          ELSE '[]'::jsonb
        END
      ), '{}'::jsonb)
      FROM jsonb_each(COALESCE(shelf_images, '{}'::jsonb))
    )
    WHERE shelf_images IS NOT NULL
      AND shelf_images != '{}'::jsonb
      AND EXISTS (
        SELECT 1 FROM jsonb_each(shelf_images) WHERE jsonb_typeof(value) = 'string'
      );
  `);
  console.log('✅ Database initialized');
}

// ─── Locations ────────────────────────────────────────────────────────────────
app.get('/api/locations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*,
        COALESCE(ic.item_count, 0) AS total_items,
        COALESCE(cc.bin_count, 0) AS total_bins
      FROM locations l
      LEFT JOIN (
        SELECT location_id, COUNT(*) AS item_count FROM items WHERE location_id IS NOT NULL GROUP BY location_id
      ) ic ON ic.location_id = l.id
      LEFT JOIN (
        SELECT location_id, COUNT(*) AS bin_count FROM containers WHERE location_id IS NOT NULL GROUP BY location_id
      ) cc ON cc.location_id = l.id
      ORDER BY l.name
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/locations/:id', async (req, res) => {
  try {
    const locResult = await pool.query('SELECT * FROM locations WHERE id=$1', [req.params.id]);
    if (!locResult.rows.length) return res.status(404).json({ error: 'Not found' });
    const location = locResult.rows[0];

    const [itemStats, binStats, containersResult] = await Promise.all([
      pool.query(
        `SELECT COALESCE(shelf, '') AS shelf, COUNT(*) AS item_count FROM items WHERE location_id=$1 GROUP BY COALESCE(shelf, '')`,
        [req.params.id]
      ),
      pool.query(
        `SELECT COALESCE(shelf, '') AS shelf, COUNT(*) AS bin_count FROM containers WHERE location_id=$1 GROUP BY COALESCE(shelf, '')`,
        [req.params.id]
      ),
      pool.query(
        `SELECT c.*, COUNT(i.id) as item_count
         FROM containers c
         LEFT JOIN items i ON (i.container_id = c.id OR (i.bin = c.name AND i.location_id = c.location_id))
         WHERE c.location_id = $1
         GROUP BY c.id
         ORDER BY c.shelf, c.name`,
        [req.params.id]
      ),
    ]);

    const shelfStats = {};
    for (const row of itemStats.rows) {
      shelfStats[row.shelf] = { item_count: parseInt(row.item_count), bin_count: 0 };
    }
    for (const row of binStats.rows) {
      if (!shelfStats[row.shelf]) shelfStats[row.shelf] = { item_count: 0, bin_count: 0 };
      shelfStats[row.shelf].bin_count = parseInt(row.bin_count);
    }

    const total_items = itemStats.rows.reduce((sum, r) => sum + parseInt(r.item_count), 0);
    const total_bins = binStats.rows.reduce((sum, r) => sum + parseInt(r.bin_count), 0);

    res.json({
      ...location,
      shelf_stats: shelfStats,
      total_items,
      total_bins,
      containers: containersResult.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/locations', async (req, res) => {
  const { name, type, description, shelves, image_url, shelf_images } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO locations (name, type, description, shelves, image_url, shelf_images) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, type, description, shelves || '', image_url || null, JSON.stringify(shelf_images || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/locations/:id', async (req, res) => {
  const { name, type, description, shelves, image_url, shelf_images } = req.body;
  try {
    const result = await pool.query(
      'UPDATE locations SET name=$1, type=$2, description=$3, shelves=$4, image_url=$5, shelf_images=$6 WHERE id=$7 RETURNING *',
      [name, type, description, shelves || '', image_url || null, JSON.stringify(shelf_images || {}), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/locations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM locations WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Shelf Management ────────────────────────────────────────────────────────
app.post('/api/locations/:id/shelves', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Shelf name required' });
  const trimmed = name.trim();
  if (trimmed.includes(',')) return res.status(400).json({ error: 'Shelf name cannot contain commas' });
  try {
    const loc = await pool.query('SELECT shelves FROM locations WHERE id=$1', [req.params.id]);
    if (!loc.rows.length) return res.status(404).json({ error: 'Location not found' });
    const existing = (loc.rows[0].shelves || '').split(',').map(s => s.trim()).filter(Boolean);
    if (existing.includes(trimmed)) return res.status(409).json({ error: 'Shelf already exists' });
    const updated = [...existing, trimmed].join(', ');
    const result = await pool.query('UPDATE locations SET shelves=$1 WHERE id=$2 RETURNING *', [updated, req.params.id]);
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/locations/:id/shelves/:name', async (req, res) => {
  const shelfName = decodeURIComponent(req.params.name);
  try {
    const loc = await pool.query('SELECT shelves FROM locations WHERE id=$1', [req.params.id]);
    if (!loc.rows.length) return res.status(404).json({ error: 'Location not found' });
    const existing = (loc.rows[0].shelves || '').split(',').map(s => s.trim()).filter(Boolean);
    const filtered = existing.filter(s => s !== shelfName);
    const updated = filtered.join(', ');

    // Clear shelf references from items and containers, remove from shelves string and shelf_images
    await Promise.all([
      pool.query("UPDATE items SET shelf='' WHERE location_id=$1 AND shelf=$2", [req.params.id, shelfName]),
      pool.query("UPDATE containers SET shelf='' WHERE location_id=$1 AND shelf=$2", [req.params.id, shelfName]),
      pool.query('UPDATE locations SET shelves=$1, shelf_images = COALESCE(shelf_images, \'{}\'::jsonb) - $2 WHERE id=$3', [updated, shelfName, req.params.id]),
    ]);

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/locations/:id/shelves/:name/images', upload.single('image'), async (req, res) => {
  const shelfName = decodeURIComponent(req.params.name);
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  if (!cloudinaryEnabled) return res.status(500).json({ error: 'Image storage not configured' });
  try {
    const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    // Append URL to the shelf's image array within shelf_images JSONB
    const result = await pool.query(
      `UPDATE locations
       SET shelf_images = jsonb_set(
         COALESCE(shelf_images, '{}'::jsonb),
         $1::text[],
         COALESCE(shelf_images->$2, '[]'::jsonb) || $3::jsonb
       )
       WHERE id = $4 RETURNING shelf_images`,
      ['{' + shelfName + '}', shelfName, JSON.stringify([url]), req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Location not found' });
    res.json({ image_url: url, images: result.rows[0].shelf_images[shelfName] || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/locations/:id/shelves/:name/images', async (req, res) => {
  const shelfName = decodeURIComponent(req.params.name);
  const { image_url } = req.body;
  if (!image_url) return res.status(400).json({ error: 'image_url required' });
  try {
    // Remove specific URL from the shelf's image array
    const result = await pool.query(
      `UPDATE locations
       SET shelf_images = jsonb_set(
         COALESCE(shelf_images, '{}'::jsonb),
         $1::text[],
         COALESCE(
           (SELECT jsonb_agg(elem)
            FROM jsonb_array_elements(COALESCE(shelf_images->$2, '[]'::jsonb)) AS elem
            WHERE elem #>> '{}' != $3),
           '[]'::jsonb
         )
       )
       WHERE id = $4 RETURNING shelf_images`,
      ['{' + shelfName + '}', shelfName, image_url, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Location not found' });
    res.json({ images: result.rows[0].shelf_images[shelfName] || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Containers ───────────────────────────────────────────────────────────────
app.get('/api/containers', async (req, res) => {
  const { location_id } = req.query;
  try {
    let query = `
      SELECT c.*, l.name as location_name,
        COUNT(i.id) as item_count
      FROM containers c
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN items i ON (i.container_id = c.id OR (i.bin = c.name AND i.location_id = c.location_id))
    `;
    const params = [];
    if (location_id) { query += ' WHERE c.location_id = $1'; params.push(location_id); }
    query += ' GROUP BY c.id, l.name ORDER BY c.name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/containers', async (req, res) => {
  const { name, location_id, shelf, bin, description } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO containers (name, location_id, shelf, bin, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, location_id || null, shelf, bin, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/containers/:id', async (req, res) => {
  const { name, location_id, shelf, bin, description } = req.body;
  try {
    const result = await pool.query(
      'UPDATE containers SET name=$1, location_id=$2, shelf=$3, bin=$4, description=$5 WHERE id=$6 RETURNING *',
      [name, location_id || null, shelf, bin, description, req.params.id]
    );
    // When a bin moves shelf/location, update all its items to match
    await pool.query(
      'UPDATE items SET shelf=$1, location_id=$2 WHERE container_id=$3',
      [shelf || '', location_id || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/containers/:id', async (req, res) => {
  const { move_to } = req.query;
  try {
    if (move_to) {
      // Move items to the target container, syncing shelf/location/bin
      const target = await pool.query('SELECT * FROM containers WHERE id=$1', [move_to]);
      if (!target.rows.length) return res.status(400).json({ error: 'Target container not found' });
      const t = target.rows[0];
      await pool.query(
        'UPDATE items SET container_id=$1, shelf=$2, bin=$3, location_id=$4 WHERE container_id=$5',
        [t.id, t.shelf || '', t.bin || t.name || '', t.location_id, req.params.id]
      );
    } else {
      // Default: clear container reference and bin from items
      await pool.query(
        "UPDATE items SET container_id=NULL, bin='' WHERE container_id=$1",
        [req.params.id]
      );
    }
    await pool.query('DELETE FROM containers WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/containers/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, l.name as location_name,
        COUNT(i.id) as item_count
      FROM containers c
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN items i ON (i.container_id = c.id OR (i.bin = c.name AND i.location_id = c.location_id))
      WHERE c.id = $1
      GROUP BY c.id, l.name
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/containers/:id/images', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  if (!cloudinaryEnabled) return res.status(500).json({ error: 'Image storage not configured' });
  try {
    const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    const result = await pool.query(
      `UPDATE containers SET images = COALESCE(images, '[]'::jsonb) || $1::jsonb WHERE id = $2 RETURNING *`,
      [JSON.stringify([url]), req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Container not found' });
    res.json({ image_url: url, images: result.rows[0].images });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/containers/:id/images', async (req, res) => {
  const { image_url } = req.body;
  if (!image_url) return res.status(400).json({ error: 'image_url required' });
  try {
    const result = await pool.query(
      `UPDATE containers
       SET images = COALESCE(
         (SELECT jsonb_agg(elem) FROM jsonb_array_elements(COALESCE(images, '[]'::jsonb)) AS elem WHERE elem #>> '{}' != $1),
         '[]'::jsonb
       )
       WHERE id = $2 RETURNING *`,
      [image_url, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Container not found' });
    res.json({ images: result.rows[0].images });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/containers/:id/empty', async (req, res) => {
  const { move_to } = req.body;
  try {
    if (move_to) {
      const target = await pool.query('SELECT * FROM containers WHERE id=$1', [move_to]);
      if (!target.rows.length) return res.status(400).json({ error: 'Target container not found' });
      const t = target.rows[0];
      await pool.query(
        'UPDATE items SET container_id=$1, shelf=$2, bin=$3, location_id=$4 WHERE container_id=$5',
        [t.id, t.shelf || '', t.bin || t.name || '', t.location_id, req.params.id]
      );
    } else {
      await pool.query(
        "UPDATE items SET container_id=NULL, bin='' WHERE container_id=$1",
        [req.params.id]
      );
    }
    // Clear images
    const result = await pool.query(
      "UPDATE containers SET images='[]'::jsonb WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Container not found' });
    res.json({ success: true, container: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Items ────────────────────────────────────────────────────────────────────
app.get('/api/items', async (req, res) => {
  const { search, container_id, location_id, shelf, bin } = req.query;
  try {
    let query = `
      SELECT i.*, 
        c.name as container_name, c.shelf as container_shelf, c.bin as container_bin,
        l.name as location_name
      FROM items i
      LEFT JOIN containers c ON i.container_id = c.id
      LEFT JOIN locations l ON i.location_id = l.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (search) {
      query += ` AND (i.name ILIKE $${idx} OR i.description ILIKE $${idx} OR i.barcode = $${idx+1})`;
      params.push(`%${search}%`, search); idx += 2;
    }
    if (container_id) { query += ` AND i.container_id = $${idx++}`; params.push(container_id); }
    if (location_id) { query += ` AND (i.location_id = $${idx} OR c.location_id = $${idx})`; params.push(location_id); idx++; }
    if (shelf) { query += ` AND (i.shelf = $${idx} OR c.shelf = $${idx})`; params.push(shelf); idx++; }
    if (bin) { query += ` AND (i.bin = $${idx} OR c.bin = $${idx})`; params.push(bin); idx++; }
    query += ' ORDER BY i.updated_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, c.name as container_name, l.name as location_name
      FROM items i
      LEFT JOIN containers c ON i.container_id = c.id
      LEFT JOIN locations l ON i.location_id = l.id
      WHERE i.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Auto-add a new shelf to a location if it doesn't exist yet
async function ensureShelfOnLocation(locationId, shelfName) {
  if (!locationId || !shelfName) return;
  const loc = await pool.query('SELECT shelves FROM locations WHERE id=$1', [locationId]);
  if (!loc.rows.length) return;
  const existing = (loc.rows[0].shelves || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!existing.includes(shelfName.trim())) {
    const updated = [...existing, shelfName.trim()].join(', ');
    await pool.query('UPDATE locations SET shelves=$1 WHERE id=$2', [updated, locationId]);
  }
}

// Auto-create a container (bin) if it doesn't exist yet, return its id
async function ensureBinExists(locationId, shelfName, binName) {
  if (!locationId || !binName) return null;
  // Check if a container already exists with this name at this location/shelf
  const existing = await pool.query(
    'SELECT id FROM containers WHERE location_id=$1 AND shelf=$2 AND (name=$3 OR bin=$3)',
    [locationId, shelfName || '', binName]
  );
  if (existing.rows.length) return existing.rows[0].id;
  // Auto-create the container
  const result = await pool.query(
    'INSERT INTO containers (name, location_id, shelf, bin) VALUES ($1, $2, $3, $4) RETURNING id',
    [binName, locationId, shelfName || '', '']
  );
  return result.rows[0].id;
}

app.post('/api/items', async (req, res) => {
  let { name, description, quantity, unit, container_id, location_id, shelf, bin, image_url, ai_labels, barcode, tags } = req.body;
  try {
    if (shelf && location_id) await ensureShelfOnLocation(location_id, shelf);
    if (bin && location_id && !container_id) {
      container_id = await ensureBinExists(location_id, shelf, bin);
    }
    const result = await pool.query(
      `INSERT INTO items (name, description, quantity, unit, container_id, location_id, shelf, bin, image_url, ai_labels, barcode, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name, description, quantity || 1, unit || 'each', container_id || null, location_id || null,
       shelf, bin, image_url, JSON.stringify(ai_labels || []), barcode, JSON.stringify(tags || [])]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/items/:id', async (req, res) => {
  let { name, description, quantity, unit, container_id, location_id, shelf, bin, image_url, ai_labels, barcode, tags } = req.body;
  try {
    if (shelf && location_id) await ensureShelfOnLocation(location_id, shelf);
    if (bin && location_id && !container_id) {
      container_id = await ensureBinExists(location_id, shelf, bin);
    }
    const result = await pool.query(
      `UPDATE items SET name=$1, description=$2, quantity=$3, unit=$4, container_id=$5,
       location_id=$6, shelf=$7, bin=$8, image_url=$9, ai_labels=$10, barcode=$11, tags=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [name, description, quantity, unit, container_id || null, location_id || null,
       shelf, bin, image_url, JSON.stringify(ai_labels || []), barcode, JSON.stringify(tags || []), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Image Upload ────────────────────────────────────────────────────────────
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  if (!cloudinaryEnabled) return res.status(500).json({ error: 'Image storage not configured' });
  try {
    const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
    res.json({ image_url: url });
  } catch (e) {
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

// ─── AI Image Analysis (via Claude) ──────────────────────────────────────────
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI not configured' });

  try {
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    // Upload to Cloudinary and run AI analysis in parallel
    const [imageUrl, aiResponse] = await Promise.all([
      cloudinaryEnabled ? uploadToCloudinary(req.file.buffer, req.file.mimetype) : Promise.resolve(null),
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: 'Analyze this image for inventory purposes. Identify ALL distinct items visible. Respond with JSON only: { "items": [ { "name": "item name", "description": "brief description", "labels": ["tag1","tag2","tag3"], "quantity": 1 }, ... ] }. List each distinct item type separately. If you see multiples of the same item, use the quantity field.' }
            ]
          }]
        })
      })
    ]);

    const data = await aiResponse.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    // Normalize to { items: [...], image_url } regardless of AI response shape
    const items = Array.isArray(parsed) ? parsed : parsed.items || [parsed];
    res.json({ items, image_url: imageUrl || null });
  } catch (e) {
    res.status(500).json({ error: 'AI analysis failed: ' + e.message });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [items, containers, locations, shelves] = await Promise.all([
      pool.query('SELECT COUNT(*) as count, SUM(quantity) as total FROM items'),
      pool.query('SELECT COUNT(*) as count FROM containers'),
      pool.query('SELECT COUNT(*) as count FROM locations'),
      pool.query(`SELECT COALESCE(SUM(array_length(regexp_split_to_array(shelves, ','), 1)), 0) as count FROM locations WHERE shelves IS NOT NULL AND shelves != ''`),
    ]);
    res.json({
      items: parseInt(items.rows[0].count),
      totalQuantity: parseInt(items.rows[0].total) || 0,
      containers: parseInt(containers.rows[0].count),
      locations: parseInt(locations.rows[0].count),
      shelves: parseInt(shelves.rows[0].count) || 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ─── Serve React Frontend (production) ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, 'public');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
