import { cpSync, rmSync } from 'node:fs';
import { defineConfig } from 'tsup';

// yaml is bundled (it has CJS internals), so the ESM bundle needs a real `require`
const banner = [
  '#!/usr/bin/env node',
  "import { createRequire as __cr } from 'node:module';",
  'const require = __cr(import.meta.url);',
].join('\n');

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  banner: { js: banner },
  noExternal: ['@rodo/card-format', '@rodo/protocol', 'yaml', 'commander', 'picocolors'],
  async onSuccess() {
    rmSync('dist/kit', { recursive: true, force: true });
    cpSync('../rodo-kit', 'dist/kit', { recursive: true, filter: (s) => !/[\\/](scripts|test|fixtures|node_modules)([\\/]|$)|package\.json$/.test(s) });
  },
});
