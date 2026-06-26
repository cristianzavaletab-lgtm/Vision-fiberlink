import axios from 'axios';
import { getBestServerUrl, getCurrentServerUrl } from './serverResolver';

// Define the base API instance with an empty baseURL initially
export const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add Authorization Bearer token and dynamic baseURL
api.interceptors.request.use(
  async (config) => {
    // Resolve the server URL dynamically
    const serverUrl = await getBestServerUrl();
    config.baseURL = `${serverUrl}/api`;

    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);



// Interceptor to handle expired tokens and auto-refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 Unauthorized and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          // Attempt to refresh
          const serverUrl = getCurrentServerUrl();
          const res = await axios.post(`${serverUrl}/api/auth/refresh`, { refreshToken });
          const newAccessToken = res.data.accessToken;

          localStorage.setItem('accessToken', newAccessToken);
          
          // Apply new token to the original request and retry
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch {
          // Refresh failed, logout
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/';
        }
      } else {
        // No refresh token available, logout
        localStorage.removeItem('accessToken');
        window.location.href = '/';
      }
    }

    return Promise.reject(error);
  }
);
