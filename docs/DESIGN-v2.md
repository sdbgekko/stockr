# ShelfSnap v2 — Design Document

**Status:** Active design. Supersedes v1 (locations + containers + items tables).
**Author:** Sherman Brown + Gemma.
**Date:** 2026-04-14.

---

## 1. Vision

A personal inventory tracker that scales from **6 items in a drawer** to **100+ items across 8 locations / 4 areas / 30 shelves / 40 bins** without UI friction.

Core premises:

- **Everything is an Entity.** Locations, Areas, Racks, Shelves, Bins, and Items share one polymorphic table, one photos table, one notes table. New entity types are a one-line CHECK-constraint change.
- **Every entity is a card.** The UI is built out of uniform cards at every hierarchy level. Cards show a representative photo (user-starred) or a type-specific icon fallback.
- **Search-first, drill-as-needed.** Search bar is always at the top. Deeper navigation (location → area → rack → shelf → bin → item) appears only when the inventory warrants it.
- **Photos, QR, and AI vision are first-class.** Not bolted on. Every entity can have up to 10 photos with one starred as its cover. Every entity gets a printable QR label. Any photo can be auto-analyzed by a local vision model to suggest items.

---

## 2. Data Model

### 2.1 Tables

```sql
-- One table for every entity type
CREATE TABLE entities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             varchar(20) NOT NULL CHECK (type IN
                     ('location','area','rack','shelf','bin','item')),
  parent_id        uuid REFERENCES entities(id) ON DELETE CASCADE,
  name             varchar(200) NOT NULL,
  description      text,
  -- type-specific fields
  metadata         jsonb DEFAULT '{}'::jsonb,
  barcode          varchar(100),                 -- UPC/EAN/custom; mostly items + bins
  qr_slug          varchar(32) UNIQUE,           -- short URL-safe slug for printed QR
  rep_photo_id     uuid,                         -- FK filled after entity_photos row
  sort_order       int DEFAULT 0,
  is_active        boolean DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz
);
CREATE INDEX idx_entities_parent  ON entities(parent_id);
CREATE INDEX idx_entities_type    ON entities(type);
CREATE INDEX idx_entities_barcode ON entities(barcode)         WHERE barcode IS NOT NULL;
CREATE INDEX idx_entities_qr      ON entities(qr_slug)         WHERE qr_slug IS NOT NULL;
CREATE INDEX idx_entities_active  ON entities(is_active, type);

-- 0-10 photos per entity
CREATE TABLE entity_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  url           text NOT NULL,
  ai_labels     text[] DEFAULT '{}',
  sort_order    int DEFAULT 0,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_entity_photos_entity ON entity_photos(entity_id);

-- Notes: activity-log pattern (mirrors SCG)
CREATE TABLE entity_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  content       text NOT NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);
CREATE INDEX idx_entity_notes_entity ON entity_notes(entity_id);

-- UPC lookup cache so repeated scans are instant
CREATE TABLE upc_cache (
  barcode       varchar(100) PRIMARY KEY,
  source        varchar(30),                 -- 'openfoodfacts', 'upcitemdb', 'manual'
  name          text,
  description   text,
  image_url     text,
  raw           jsonb,                       -- full vendor response
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

-- FK circular reference for rep_photo
ALTER TABLE entities ADD CONSTRAINT fk_entities_rep_photo
  FOREIGN KEY (rep_photo_id) REFERENCES entity_photos(id) ON DELETE SET NULL;

-- Enforce 10-photo cap via trigger
CREATE OR REPLACE FUNCTION cap_entity_photos() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM entity_photos WHERE entity_id = NEW.entity_id) > 10 THEN
    RAISE EXCEPTION 'Entity already has 10 photos (max)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER enforce_photo_cap AFTER INSERT ON entity_photos
  FOR EACH ROW EXECUTE FUNCTION cap_entity_photos();
```

### 2.2 Entity types & conventional parents

| type       | typical parent type       | notes                                                                  |
|------------|---------------------------|------------------------------------------------------------------------|
| `location` | null (top-level)          | "Kitchen", "Garage", "Shed"                                            |
| `area`     | `location`                | "North Wall", "Pantry corner" — optional; skip if location is simple   |
| `rack`     | `area` or `location`      | A physical rack with 1+ shelves                                        |
| `shelf`    | `rack` or `location`      | Standalone wall shelves can parent directly to a location              |
| `bin`      | `shelf`, `rack`, or `location` | A container that holds items                                      |
| `item`     | `bin`, `shelf`, or any    | The thing you actually own                                             |

Parent relationship is flexible — users organize however they want. The UI handles any tree depth.

### 2.3 `metadata` JSONB conventions per type

- `location`: `{address, coordinates}`
- `area`, `rack`, `shelf`: `{dimensions}`
- `bin`: `{capacity, color}`
- `item`: `{quantity, unit, purchased_at, expires_at, cost}`

Stored as JSONB so we can iterate without migrations.

---

## 3. UX — Progressive Disclosure Drill Browser

### 3.1 The single pattern

Every browsing screen has the same shape:

```
┌──────────────────────────────────────┐
│  ← PAGE TITLE · N found              │
├──────────────────────────────────────┤
│  🔍 Search...                        │
│  [Active filter chips, removable]    │
├──────────────────────────────────────┤
│  GROUPING CARDS (current drill level)│
│  (Location → Area → Rack → Shelf → Bin)
├──────────────────────────────────────┤
│  ITEM CARDS (leaves, scoped to filter)│
└──────────────────────────────────────┘
```

### 3.2 Drill mechanics

- Tap a **Location card** → filter chip `[Kitchen ×]`, grouping row transforms into the child level (Area or Rack cards, whichever exists for Kitchen)
- Tap again → next chip, next child level
- Tap the `×` on any chip → pop back up one level
- **Search** stays sticky across drill levels — narrows within current scope
- If an entity has no children of the next type, the drill pans straight through (Location → Shelf if no areas/racks)

### 3.3 When cards appear

- **1 of a type:** skip that card row (e.g., 1 location → no location cards, jump straight to its contents)
- **>1 of a type:** show cards in a horizontal-scroll row above the item list
- **No items at leaf:** show an empty-state card with "+ Add first item"

### 3.4 Card anatomy

```
┌────────────────────┐
│  ⭐ (star / edit)   │  ← if photos exist, star = change rep
│                    │
│  [REP PHOTO        │  ← or type icon fallback
│   or ICON FALLBACK]│
│                    │
│  Kitchen           │  ← entity name
│  📦 32 items       │  ← type-specific count summary
│  🗄 4 shelves      │
└────────────────────┘
```

### 3.5 Fallback icons (no photo)

- 🏠 location
- 🔲 area
- 📐 rack
- 🗄 shelf
- 📦 bin
- 📸 item

---

## 4. Photos & Starring

- Upload up to 10 per entity (cap enforced by DB trigger)
- Tap any photo in gallery → star icon overlay to mark as `rep_photo_id`
- Starred photo shows on the entity's card
- AI vision runs on each uploaded photo, stores labels in `entity_photos.ai_labels`

---

## 5. Notes (activity log, SCG-style)

- Each entity has an "Activity" section on its detail page
- "+ Add Note" button opens inline textarea
- Each note entry shows: timestamp · author · content · Edit/Delete
- Edited notes display `· edited` marker
- No forced structure — free text

---

## 6. Scanning — three modes

### 6.1 UPC barcode scan (for items)

Flow:
1. User scans a UPC using iPhone camera (existing `QRScannerModal` uses `BarcodeDetector` API)
2. Backend checks `upc_cache` table — if hit, prefill item
3. If miss, query external APIs in order:
   - Open Food Facts (free, grocery)
   - UPCItemDB (free tier, general)
4. Cache result (or a stub `name=null, source='miss'` to avoid re-lookup within 7 days)
5. User confirms / edits → item created with `barcode` field set

Endpoints:
```
POST /api/upc/lookup  body: { barcode }  →  { name, description, image_url, source }
```

### 6.2 QR codes for entities

- Every entity gets a `qr_slug` (short random, e.g. `sh-X7k9pQ`) at creation
- `GET /api/entities/:id/qr?format=png` → PNG of QR that encodes `https://shelfsnap.app/go/<slug>`
- `GET /go/:slug` → redirects to entity detail in the app
- `QrLabelsPage.jsx` = printable sheet, 24 per page, QR + entity name + type icon
- Scanning any ShelfSnap QR from the app opens that entity

### 6.3 AI photo vision (suggest items from a photo)

Flow:
1. User takes/uploads a photo from ScanPage
2. Backend sends to **Ollama `llama3.2-vision:11b` on JMM** (already installed at :11434) with prompt: "List distinct inventory items visible in this photo. For each: name, confidence 0-1, suggested quantity, bounding box if possible."
3. Parses response into structured list
4. Returns checklist to frontend:
   ```
   [✓] Screwdriver (95%) qty 1
   [✓] Hammer (89%) qty 1
   [ ] Pliers (72%) qty 1
   ```
5. User unchecks false positives, confirms location/shelf/bin (inherits from current scope), taps "Add all"
6. Items created in a single batch API call

Escalation: user taps "Improve with Claude" → CCLI vision via `ccli-opus` wrapper (Opus has best vision). Costs Opus quota but used sparingly.

Endpoints:
```
POST /api/vision/analyze  body: { image_url }  →  { items: [{name, confidence, qty}] }
POST /api/entities/batch  body: { items: [...], parent_id }
```

---

## 7. API Surface

```
# Entity CRUD (type-agnostic)
GET    /api/entities?type=&parent_id=&search=        list
GET    /api/entities/tree?root_id=                    recursive tree
GET    /api/entities/:id                              detail (incl. photos, notes, children count)
POST   /api/entities                                  create
PATCH  /api/entities/:id                              update
DELETE /api/entities/:id                              soft delete (is_active=false)

# Photos
GET    /api/entities/:id/photos
POST   /api/entities/:id/photos                       multipart upload (caps at 10)
DELETE /api/entities/:id/photos/:photoId
PATCH  /api/entities/:id/rep-photo  body: { photoId } star a photo

# Notes
GET    /api/entities/:id/notes
POST   /api/entities/:id/notes                        { content }
PATCH  /api/entities/:id/notes/:noteId                { content }
DELETE /api/entities/:id/notes/:noteId

# Scanning
POST   /api/upc/lookup                                { barcode }
POST   /api/vision/analyze                            { image_url }

# QR
GET    /api/entities/:id/qr                           PNG (size, format query params)
GET    /go/:slug                                      301 → app entity detail
```

---

## 8. Tech Stack

- **Frontend:** React 18 + Vite, React Router, react-hot-toast, `BarcodeDetector` API (iOS Safari 17+)
- **Backend:** Node.js + Express, `pg` for Postgres, `multer` for uploads, `qrcode` npm for QR generation
- **Database:** PostgreSQL (Railway managed)
- **Storage:** Railway volumes for photo uploads (URL pattern `/uploads/<uuid>.jpg`)
- **AI:**
  - Default vision: Ollama `llama3.2-vision:11b` on JMM (http://192.168.1.170:11434)
  - Premium vision: CCLI (`ccli-opus`) for hard cases
  - UPC lookup: Open Food Facts + UPCItemDB
- **Deploy:** Railway auto-deploy from `sdbgekko/shelfsnap` `main` branch

---

## 9. Build Phases

- **Phase 1 — Schema reset + Entity API** (this session): Drop old tables (no real data), create entities/entity_photos/entity_notes/upc_cache, CRUD endpoints, photo upload + star.
- **Phase 2 — EntityCard + DrillBrowser UI**: One card component for all entity types, drill navigation with chips, search integrated.
- **Phase 3 — Notes UI** (SCG-pattern copy): Activity log with inline add/edit/delete.
- **Phase 4 — Scanning**:
  - 4a. UPC lookup (Open Food Facts + UPCItemDB, cached)
  - 4b. QR generation + printable label page
  - 4c. AI vision (Ollama llama3.2-vision) with fallback to CCLI
- **Phase 5 — Polish**: Bulk actions (move many items at once), export (CSV), mobile camera optimizations.

---

## 9a. Bottom FAB (5 slots, context-aware)

```
Position:   1          2         3         4          5
           🏠         📝        ➕        📷         ☰
          Home       Note      Scan     Photos     More
```

| Position | Icon | State 1 — Browse | State 2 — Entity Detail |
|----------|------|------------------|--------------------------|
| 1        | 🏠 Home  | Active — jump to top-level dashboard | Active |
| 2        | 📝 Note  | Hidden/disabled | Active — add note to current entity |
| 3        | ➕ Scan  | Active — camera auto-detects QR/UPC/pic | Active — same, but new items auto-parent to current entity |
| 4        | 📷 Photos| Hidden/disabled | Active — gallery (view/add/delete, star rep) |
| 5        | ☰ More   | Active — Export / Settings | Active — QR Label / Rename / Export / Delete |

State transitions via React `FABContext` (same pattern SCG uses).

### Unified Scan flow (position 3)

One camera opens regardless of what's being scanned:

```
Scan live frame
  ├─ QR detected with ShelfSnap slug
  │     → Navigate to that entity
  ├─ UPC/EAN detected
  │     → Lookup upc_cache → Open Food Facts → UPCItemDB
  │     → Prefill item form, auto-parent to current entity (if in detail mode)
  └─ User taps shutter / no code for N seconds
        → Capture as photo
        → Send to Ollama llama3.2-vision → item suggestion checklist
        → User confirms selections → batch create items
```

No mode picker — the camera figures it out.

---

## 10. Out of Scope (for v2)

- Multi-user / auth — single-user local for now
- Mobile native app — stays a PWA
- Barcode printing (we print QR, not UPC; user scans manufacturer UPC labels already on items)
- Live inventory sync across devices — assume one active user at a time

---

## 11. Open Questions

1. **Soft delete vs hard delete?** Currently `is_active`. Should we add a "Trash" view to restore?
2. **Who can invoke CCLI vision?** Is it per-photo opt-in, or automatic fallback when Ollama confidence is low?
3. **QR slug length** — 6 chars = ~55 billion combinations, collision risk at scale is low. OK to start there.
4. **Item "quantity" is in `metadata.quantity` now.** Reconsider if we ever want per-item tracking at SKU level (individually numbered inventory).
