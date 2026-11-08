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
  root: 'renderer',
  base: '/',
  plugins: [react()],
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
  },
  define: {
    'import.meta.env.VITE_SOURCE_REVISION': JSON.stringify(sourceRevision()),
    'import.meta.env.VITE_BUILD_IDENTIFIER': JSON.stringify(
      process.env.VITE_BUILD_IDENTIFIER ?? 'local',
    ),
  },
});
