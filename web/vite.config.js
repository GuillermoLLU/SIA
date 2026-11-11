import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // rutas relativas: la app Electron carga el build por file://
  build: { target: 'esnext' }, // top-level await (descubrimiento de puertos)
  server: {
    port: 5220,
    strictPort: true, // no derivar a otro puerto si está ocupado: fallar claro
  },
});
