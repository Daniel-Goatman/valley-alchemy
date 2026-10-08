import { defineConfig } from 'vite';

// The local game server (npm run server) handles combining and generated art.
const target = `http://127.0.0.1:${process.env.VALLEY_SERVER_PORT ?? 8787}`;

export default defineConfig({
  server: {
    proxy: {
      '/api': target,
      '/gen-cards': target,
    },
  },
});
