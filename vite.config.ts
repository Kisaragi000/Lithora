import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Keep Tauri's Rust build output visible in the terminal.
    clearScreen: false,
    server: {
      // The desktop shell (src-tauri/tauri.conf.json) loads the dev server from this exact port.
      port: 3000,
      strictPort: true,
      // Set DISABLE_HMR=true to turn off hot reload and file watching.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {ignored: ['**/src-tauri/**']},
    },
  };
});
