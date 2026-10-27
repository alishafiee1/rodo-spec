// purpose --- CJS bundle next to the ESM output so the NestJS backend (CommonJS) can require it ---
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/cjs/index.cjs',
  external: ['yaml', '@rodo/protocol'],
});
