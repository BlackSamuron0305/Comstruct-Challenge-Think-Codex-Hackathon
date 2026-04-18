import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  company_id: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  tryRefresh: () => Promise<boolean>;
}

const TEMP_AUTH_BYPASS = true;

const PREVIEW_USER: User = {
  id: 'preview-user',
  email: 'procurement@comstruct.com',
  full_name: 'Procurement Preview',
  role: 'procurement_admin',
  company_id: 'preview-company',
};

export const useAuthStore = create<AuthState>()(
  persist<AuthState>(
    (set, get) => ({
      user: TEMP_AUTH_BYPASS ? PREVIEW_USER : null,
      accessToken: null,
      refreshToken: null,

      login: async (email, password) => {
        if (TEMP_AUTH_BYPASS) {
          set({
            user: { ...PREVIEW_USER, email },
            accessToken: null,
            refreshToken: null,
          });
          return;
        }
        const r = await axios.post('/auth/login', { email, password });
        set({
          user: r.data.user,
          accessToken: r.data.access_token,
          refreshToken: r.data.refresh_token,
        });
      },

      logout: () =>
        set({
          user: TEMP_AUTH_BYPASS ? PREVIEW_USER : null,
          accessToken: null,
          refreshToken: null,
        }),

      tryRefresh: async () => {
        if (TEMP_AUTH_BYPASS) return true;
        const rt = get().refreshToken;
        if (!rt) return false;
        try {
          const r = await axios.post('/auth/refresh', { refresh_token: rt });
          set({ accessToken: r.data.access_token });
          return true;
        } catch {
          return false;
        }
      },
    }),
    { name: 'comstruct-auth' },
  ),
);
