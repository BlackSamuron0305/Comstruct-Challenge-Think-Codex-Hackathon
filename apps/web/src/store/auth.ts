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

export const useAuthStore = create<AuthState>()(
  persist<AuthState>(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      login: async (email, password) => {
        const r = await axios.post('/auth/login', { email, password });
        set({
          user: r.data.user,
          accessToken: r.data.access_token,
          refreshToken: r.data.refresh_token,
        });
      },

      logout: () => set({ user: null, accessToken: null, refreshToken: null }),

      tryRefresh: async () => {
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
