import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET || 'http://api-gateway:8001', changeOrigin: true },
      '/auth': { target: process.env.API_PROXY_TARGET || 'http://api-gateway:8001', changeOrigin: true },
      '/ws': { target: process.env.WS_PROXY_TARGET || 'ws://api-gateway:8001', ws: true, changeOrigin: true },
    },
  },
});
