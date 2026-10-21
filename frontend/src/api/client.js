const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data.data;
}

export const api = {
  getDashboardSummary: () => apiRequest('/dashboard/summary'),
  getGeminiModels: () => apiRequest('/dashboard/ai-models'),
  getPresenterProfile: () => apiRequest('/dashboard/presenter'),

  getTrends: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.category && params.category !== 'all') qs.set('category', params.category);
    if (params.verification_status && params.verification_status !== 'all') {
      qs.set('verification_status', params.verification_status);
    }
    if (params.search) qs.set('search', params.search);
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest(`/trends${queryStr}`);
  },

  discoverLiveTrends: (payload = {}) =>
    apiRequest('/trends/discover', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getRecommendedTrend: () => apiRequest('/trends/recommended'),

  generateVideoFromTrend: (topicId, payload = {}) =>
    apiRequest(`/trends/${topicId}/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createCustomTopic: (payload = {}) =>
    apiRequest('/trends/custom', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteTrend: (topicId) =>
    apiRequest(`/trends/${topicId}`, {
      method: 'DELETE',
    }),

  getVideos: (status = 'all') => {
    const qs = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    return apiRequest(`/videos${qs}`);
  },

  getVideoById: (id) => apiRequest(`/videos/${id}`),

  updateVideoScript: (id, payload) =>
    apiRequest(`/videos/${id}/script`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  regenerateVideoScript: (id, payload = {}) =>
    apiRequest(`/videos/${id}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  renderVideo: (id, sceneNumber = null, payload = {}) =>
    apiRequest(sceneNumber ? `/videos/${id}/scenes/${sceneNumber}/render` : `/videos/${id}/render`, {
      method: 'POST',
      body: JSON.stringify(sceneNumber ? { sceneNumber, ...payload } : payload),
    }),

  approveVideo: (id, reviewerNotes = '') =>
    apiRequest(`/videos/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reviewerNotes }),
    }),

  rejectVideo: (id, reviewerNotes = '') =>
    apiRequest(`/videos/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reviewerNotes }),
    }),

  publishVideo: (id, payload = {}) =>
    apiRequest(`/videos/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteVideo: (id) =>
    apiRequest(`/videos/${id}`, {
      method: 'DELETE',
    }),

  getAnalytics: () => apiRequest('/analytics'),
};
