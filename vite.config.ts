import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  // Use relative asset paths for production builds to avoid absolute system paths;
  // for dev server, keep root base for proper routing.
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  publicDir: 'public',
}));
