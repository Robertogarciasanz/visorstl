import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Rutas absolutas: la web vive en la raiz de cenital.org y el visor esta en /visor/
    base: '/',
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          // Portada: redirige a /bici/
          main: path.resolve(__dirname, 'index.html'),
          // Otras piezas y visor de STL
          visor: path.resolve(__dirname, 'visor/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
