import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backendOrigin = process.env.VITE_BACKEND_ORIGIN || 'http://localhost:5000';
const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const floorplanDir = path.resolve(frontendDir, '../floorplan');

const FLOORPLAN_FILES = {
  'ground-floor.pdf': 'BJI_BUILDING PLAN 01 GF MAIN BLOCK_04022026.pdf',
  'first-floor.pdf': 'BJI_BUILDING PLAN 0000_1ST FLOOR MAIN BLOCK_04022026.pdf',
  'second-third-floor.pdf': 'BJI_MAIN_BLOCK_2ND_&_3RD_FLOOR_BUILDING_PLAN_00000_04022026.pdf',
  'fourth-fifth-floor.pdf': 'BJI_BUILDING_PLAN_0002_4TH_&_5TH_FLOOR_MAIN_BLOCK_04022026.pdf',
  'sixth-seventh-floor.pdf': 'BJI_BUILDING_PLAN_003_6TH_&_7TH_FLOOR_MAIN_BLOCK_04022026.pdf',
};

function floorplanAssetsPlugin() {
  return {
    name: 'sicn-floorplan-assets',
    configureServer(server) {
      server.middlewares.use('/floorplans', (req, res, next) => {
        const assetName = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
        const sourceName = FLOORPLAN_FILES[assetName];
        if (!sourceName) return next();

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'no-store');
        createReadStream(path.join(floorplanDir, sourceName))
          .on('error', next)
          .pipe(res);
      });
    },
    async generateBundle() {
      for (const [assetName, sourceName] of Object.entries(FLOORPLAN_FILES)) {
        const source = await readFile(path.join(floorplanDir, sourceName));
        this.emitFile({
          type: 'asset',
          fileName: `floorplans/${assetName}`,
          source,
        });
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [floorplanAssetsPlugin(), react(), tailwindcss()],
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backendOrigin,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
