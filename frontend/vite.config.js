import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/storage': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
