import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { developmentAPI } from './scripts/dev-api';

export default defineConfig({
  plugins: [react(), developmentAPI()],
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
});
