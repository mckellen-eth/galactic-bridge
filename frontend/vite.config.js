import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  // Лишаємо АВТОМАТИЧНИЙ код-спліт Vite (важкі модалки гаманця вантажаться ліниво).
  // Тільки піднімаємо ліміт попередження — суто косметика.
  build: { chunkSizeWarningLimit: 2000 },
});
