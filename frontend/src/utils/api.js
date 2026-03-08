import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
});

export const getStats = () => API.get('/stats').then(r => r.data);
export const getLocations = () => API.get('/locations').then(r => r.data);
export const createLocation = (data) => API.post('/locations', data).then(r => r.data);
export const updateLocation = (id, data) => API.put(`/locations/${id}`, data).then(r => r.data);
export const deleteLocation = (id) => API.delete(`/locations/${id}`).then(r => r.data);
export const getLocation = (id) => API.get(`/locations/${id}`).then(r => r.data);
export const addShelf = (locationId, name) => API.post(`/locations/${locationId}/shelves`, { name }).then(r => r.data);
export const deleteShelf = (locationId, name) =>
  API.delete(`/locations/${locationId}/shelves/${encodeURIComponent(name)}`).then(r => r.data);
export const addShelfImage = (locationId, shelfName, file) => {
  const fd = new FormData();
  fd.append('image', file);
  return API.post(`/locations/${locationId}/shelves/${encodeURIComponent(shelfName)}/images`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);
};
export const removeShelfImage = (locationId, shelfName, image_url) =>
  API.delete(`/locations/${locationId}/shelves/${encodeURIComponent(shelfName)}/images`, { data: { image_url } }).then(r => r.data);

export const getContainers = (params) => API.get('/containers', { params }).then(r => r.data);
export const getContainer = (id) => API.get(`/containers/${id}`).then(r => r.data);
export const createContainer = (data) => API.post('/containers', data).then(r => r.data);
export const updateContainer = (id, data) => API.put(`/containers/${id}`, data).then(r => r.data);
export const deleteContainer = (id, moveTo) =>
  API.delete(`/containers/${id}`, { params: moveTo ? { move_to: moveTo } : {} }).then(r => r.data);
export const addContainerImage = (id, file) => {
  const fd = new FormData();
  fd.append('image', file);
  return API.post(`/containers/${id}/images`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);
};
export const removeContainerImage = (id, image_url) =>
  API.delete(`/containers/${id}/images`, { data: { image_url } }).then(r => r.data);
export const emptyContainer = (id, moveToId) =>
  API.post(`/containers/${id}/empty`, moveToId ? { move_to: moveToId } : {}).then(r => r.data);

export const getItems = (params) => API.get('/items', { params }).then(r => r.data);
export const getItem = (id) => API.get(`/items/${id}`).then(r => r.data);
export const createItem = (data) => API.post('/items', data).then(r => r.data);
export const updateItem = (id, data) => API.put(`/items/${id}`, data).then(r => r.data);
export const deleteItem = (id) => API.delete(`/items/${id}`).then(r => r.data);

export const analyzeImage = (file) => {
  const fd = new FormData();
  fd.append('image', file);
  return API.post('/analyze-image', fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);
};

export const uploadImage = (file) => {
  const fd = new FormData();
  fd.append('image', file);
  return API.post('/upload-image', fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data);
};
