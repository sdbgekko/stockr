import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
});

// ── Entities (the only primary object) ─────────────────────────────────────
// Supported types: location, area, rack, shelf, bin, item
export const listEntities = (params = {}) =>
  API.get('/entities', { params }).then(r => r.data);

export const getEntity = (id) =>
  API.get(`/entities/${id}`).then(r => r.data);

export const createEntity = (data) =>
  API.post('/entities', data).then(r => r.data);

export const updateEntity = (id, data) =>
  API.patch(`/entities/${id}`, data).then(r => r.data);

export const deleteEntity = (id) =>
  API.delete(`/entities/${id}`).then(r => r.data);

// ── Photos ─────────────────────────────────────────────────────────────────
export const listEntityPhotos = (id) =>
  API.get(`/entities/${id}/photos`).then(r => r.data);

export const uploadEntityPhoto = (id, file) => {
  const fd = new FormData();
  fd.append('file', file);
  return API.post(`/entities/${id}/photos`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const deleteEntityPhoto = (entityId, photoId) =>
  API.delete(`/entities/${entityId}/photos/${photoId}`).then(r => r.data);

export const starEntityPhoto = (entityId, photoId) =>
  API.patch(`/entities/${entityId}/rep-photo`, { photo_id: photoId }).then(r => r.data);

// ── Notes ──────────────────────────────────────────────────────────────────
export const listEntityNotes = (id) =>
  API.get(`/entities/${id}/notes`).then(r => r.data);

export const addEntityNote = (id, content) =>
  API.post(`/entities/${id}/notes`, { content }).then(r => r.data);

export const updateEntityNote = (entityId, noteId, content) =>
  API.patch(`/entities/${entityId}/notes/${noteId}`, { content }).then(r => r.data);

export const deleteEntityNote = (entityId, noteId) =>
  API.delete(`/entities/${entityId}/notes/${noteId}`).then(r => r.data);

// ── Scanning & lookups ─────────────────────────────────────────────────────
export const lookupUpc = (barcode) =>
  API.post('/upc/lookup', { barcode }).then(r => r.data);

export const analyzeVision = (imageUrl) =>
  API.post('/vision/analyze', { image_url: imageUrl }).then(r => r.data);

// ── Helpers ────────────────────────────────────────────────────────────────
export const ENTITY_TYPES = ['location', 'area', 'rack', 'shelf', 'bin', 'item'];

export const TYPE_ICONS = {
  location: '🏠',
  area: '🔲',
  rack: '📐',
  shelf: '🗄',
  bin: '📦',
  item: '📸',
};

export const TYPE_LABELS = {
  location: 'Location',
  area: 'Area',
  rack: 'Rack',
  shelf: 'Shelf',
  bin: 'Bin',
  item: 'Item',
};

// Valid child types for a given parent type (drives "+ add" picker)
export const CHILD_TYPES = {
  null: ['location'],
  location: ['area', 'rack', 'shelf', 'bin', 'item'],
  area: ['rack', 'shelf', 'bin', 'item'],
  rack: ['shelf', 'bin', 'item'],
  shelf: ['bin', 'item'],
  bin: ['item'],
  item: [],
};
