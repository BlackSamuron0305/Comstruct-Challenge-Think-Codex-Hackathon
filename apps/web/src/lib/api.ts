import axios, { type AxiosInstance } from 'axios';
import { useAuthStore } from '../store/auth';

export const api: AxiosInstance = axios.create({
  baseURL: '/',
  timeout: 30_000,
});

api.interceptors.request.use((cfg) => {
  const t = useAuthStore.getState().accessToken;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      const ok = await useAuthStore.getState().tryRefresh();
      if (ok && err.config) {
        return api.request(err.config);
      }
      useAuthStore.getState().logout();
    }
    throw err;
  },
);
