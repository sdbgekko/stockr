import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
});

export const getStats = () => API.get('/stats').then(r => r.data);
export const getLocations = () => API.get('/locations').then(r => r.data);
export const createLocation = (data) => API.post('/locations', data).then(r => r.data);
export const updateLocation = (id, data) => API.put(`/locations/${id}`, data).then(r => r.data);
export const deleteLocation = (id) => API.delete(`/locations/${id}`).then(r => r.data);

export const getContainers = (params) => API.get('/containers', { params }).then(r => r.data);
export const createContainer = (data) => API.post('/containers', data).then(r => r.data);
export const updateContainer = (id, data) => API.put(`/containers/${id}`, data).then(r => r.data);
export const deleteContainer = (id, moveTo) =>
  API.delete(`/containers/${id}`, { params: moveTo ? { move_to: moveTo } : {} }).then(r => r.data);

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
