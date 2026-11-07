import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backendOrigin = process.env.VITE_BACKEND_ORIGIN || 'http://localhost:5000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendOrigin,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
