# Stockr — Inventory Tracker

Scan shelves and containers with your iPhone camera using AI image recognition to track inventory by location, shelf, bin, and container.

## Tech Stack
- **Frontend**: React (mobile-first, iPhone optimized)
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **AI**: Claude Vision API for image recognition

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL running locally

### Setup

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Configure backend
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and ANTHROPIC_API_KEY

# Run backend (port 3001)
npm run dev

# In another terminal, run frontend (port 3000)
cd frontend && npm start
```

## Deploy to Railway

### 1. Create Railway Project
1. Go to [railway.app](https://railway.app) and log in
2. Click **New Project** → **Deploy from GitHub repo**
3. Connect your GitHub account and select this repo

### 2. Add PostgreSQL
1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**
2. Railway automatically sets `DATABASE_URL` in your environment

### 3. Set Environment Variables
In your Railway service settings → **Variables**, add:
```
ANTHROPIC_API_KEY=your_key_here
NODE_ENV=production
```

### 4. Deploy
Railway will automatically build and deploy on every push to main.

Your app will be available at `https://your-project.up.railway.app`

## Features
- 📷 **AI Camera Scan** — point iPhone camera at any item, AI identifies it
- 📦 **Hierarchy** — Location → Container/Bin → Shelf → Item
- 🔍 **Search** — full-text search across all items
- ✏️ **Manual Entry** — add items without camera
- 📊 **Dashboard** — overview stats and recent items
