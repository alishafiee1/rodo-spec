import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', env: { NO_COLOR: '1', FORCE_COLOR: '0' }, include: ['test/*.test.ts'], setupFiles: ['test/setup/isolate-home.ts'], testTimeout: 30000 } });
