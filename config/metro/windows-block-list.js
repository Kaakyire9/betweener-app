'use strict';

const path = require('node:path');

// These trees are local tooling output or duplicate dependencies. They are
// never part of the mobile bundle, but Metro's Windows fallback watcher would
// otherwise allocate a native watch handle for every directory beneath them.
const WINDOWS_METRO_EXCLUDED_PATHS = Object.freeze([
  '.agents',
  '.expo',
  '.expo-home',
  '.npm-cache',
  '.npm-cache-rncomp',
  '.tmp',
  '.vercel',
  '%cd%',
  'betweener',
  'dist',
  'tmp',
  path.join('apps', 'studio', 'dist'),
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createPathPattern = (projectRoot, relativePath) => {
  const segments = path.resolve(projectRoot, relativePath)
    .split(/[\\/]+/)
    .map(escapeRegExp);
  return new RegExp(`^${segments.join('[\\\\/]')}(?:[\\\\/].*)?$`);
};

const createWindowsMetroBlockList = (projectRoot) =>
  WINDOWS_METRO_EXCLUDED_PATHS.map((relativePath) =>
    createPathPattern(projectRoot, relativePath));

const mergeMetroBlockList = (existing, additions) => {
  const current = Array.isArray(existing) ? existing : existing ? [existing] : [];
  return [...current, ...additions];
};

module.exports = {
  WINDOWS_METRO_EXCLUDED_PATHS,
  createPathPattern,
  createWindowsMetroBlockList,
  mergeMetroBlockList,
};
