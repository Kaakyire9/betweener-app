import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';

const sourceRevision = () => {
  const configured = String(process.env.VITE_SOURCE_REVISION ?? '').trim().toLowerCase();
  if (/^[0-9a-f]{40}$/.test(configured)) return configured;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().toLowerCase();
  } catch {
    return 'unknown';
  }
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 850,
  },
  server: { port: 4173 },
  preview: { port: 4173 },
  define: {
    'import.meta.env.VITE_SOURCE_REVISION': JSON.stringify(sourceRevision()),
    'import.meta.env.VITE_BUILD_IDENTIFIER': JSON.stringify(
      process.env.VITE_BUILD_IDENTIFIER
        ?? process.env.VERCEL_DEPLOYMENT_ID
        ?? process.env.VERCEL_URL
        ?? 'local',
    ),
  },
});
