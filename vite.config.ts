import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // FACADE_* are read by the dev server only, they never get into the bundle sent to the browser
  const env = loadEnv(mode, '.', 'FACADE_');
  const facade: ProxyOptions = {
    target: env.FACADE_URL || 'http://localhost:8082',
    changeOrigin: true,
    headers: env.FACADE_TOKEN ? { Authorization: `Bearer ${env.FACADE_TOKEN}` } : undefined,
  };
  return {
    plugins: [react()],
    server: { proxy: { '/ibkr': facade } },
    preview: { proxy: { '/ibkr': facade } },
  };
});
