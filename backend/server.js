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
  console.log('✅ Database initialized');
}

// ─── Locations ────────────────────────────────────────────────────────────────
app.get('/api/locations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY name');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/locations', async (req, res) => {
  const { name, type, description, shelves } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO locations (name, type, description, shelves) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, type, description, shelves || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/locations/:id', async (req, res) => {
  const { name, type, description, shelves } = req.body;
  try {
    const result = await pool.query(
      'UPDATE locations SET name=$1, type=$2, description=$3, shelves=$4 WHERE id=$5 RETURNING *',
      [name, type, description, shelves || '', req.params.id]
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

// ─── Containers ───────────────────────────────────────────────────────────────
app.get('/api/containers', async (req, res) => {
  const { location_id } = req.query;
  try {
    let query = `
      SELECT c.*, l.name as location_name,
        COUNT(i.id) as item_count
      FROM containers c
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN items i ON i.container_id = c.id
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
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/containers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM containers WHERE id=$1', [req.params.id]);
    res.json({ success: true });
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

app.post('/api/items', async (req, res) => {
  const { name, description, quantity, unit, container_id, location_id, shelf, bin, image_url, ai_labels, barcode, tags } = req.body;
  try {
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
  const { name, description, quantity, unit, container_id, location_id, shelf, bin, image_url, ai_labels, barcode, tags } = req.body;
  try {
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
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: 'Analyze this image for inventory purposes. Respond with JSON only: { "name": "best item name", "description": "brief description", "labels": ["tag1","tag2","tag3"], "quantity_hint": 1 }. If multiple items, describe the primary/most prominent one.' }
            ]
          }]
        })
      })
    ]);

    const data = await aiResponse.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (imageUrl) parsed.image_url = imageUrl;
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: 'AI analysis failed: ' + e.message });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [items, containers, locations] = await Promise.all([
      pool.query('SELECT COUNT(*) as count, SUM(quantity) as total FROM items'),
      pool.query('SELECT COUNT(*) as count FROM containers'),
      pool.query('SELECT COUNT(*) as count FROM locations'),
    ]);
    res.json({
      items: parseInt(items.rows[0].count),
      totalQuantity: parseInt(items.rows[0].total) || 0,
      containers: parseInt(containers.rows[0].count),
      locations: parseInt(locations.rows[0].count),
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
