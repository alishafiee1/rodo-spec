import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Tests must never see the developer's real ~/.rodo login, RODO_TOKEN or RODO_SERVER.
process.env.RODO_TEST_HOME ??= mkdtempSync(join(tmpdir(), 'rodo-test-home-'));
process.env.RODO_HOME = process.env.RODO_TEST_HOME;
delete process.env.RODO_TOKEN;
delete process.env.RODO_SERVER;
