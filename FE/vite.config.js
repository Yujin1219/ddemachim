import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080';

export function configureApiProxy(proxy) {
  proxy.on('proxyReq', (proxyRequest) => {
    // The backend receives this as a same-origin server request in development.
    proxyRequest.removeHeader('origin');
  });
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        configure: configureApiProxy,
      },
    },
  },
});
