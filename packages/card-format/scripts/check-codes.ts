// fails when a code in codes.ts has no failing fixture folder (R2); runs as part of `pnpm test`
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODES } from '../src/codes';

const root = fileURLToPath(new URL('../test/fixtures/codes/', import.meta.url));
const dirOf = (code: string) => join(root, code);
const missing = Object.keys(CODES).filter((c) => !existsSync(dirOf(c)) || readdirSync(dirOf(c)).filter((f) => f.endsWith('.rodo.md')).length === 0);

if (missing.length) {
  console.error(`check-codes: no fixture for ${missing.length} code(s):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-codes: all ${Object.keys(CODES).length} codes have a fixture`);
