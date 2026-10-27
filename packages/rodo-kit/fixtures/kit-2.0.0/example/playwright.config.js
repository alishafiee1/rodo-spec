import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// Scenarios live next to the docs (rodo/cycles/**/acceptance.feature); steps live in e2e/steps.
const testDir = defineBddConfig({
  features: 'rodo/cycles/*/acceptance.feature',
  steps: 'e2e/steps/**/*.js',
  tags: 'not @cancelled', // cancelled cycles keep their scenarios for history but never run
});

export default defineConfig({
  testDir,
  use: { baseURL: 'http://localhost:3000', locale: 'fa-IR' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true },
});
