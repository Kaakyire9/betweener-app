const base = require('../../jest.config.js');

module.exports = {
  ...base,
  rootDir: '../..',
  roots: ['<rootDir>/audit/session-loss-2026-10-08'],
  testMatch: ['**/*.interaction.test.ts'],
};
