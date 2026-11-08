# RODO connection audit — CLI test report (updated)

**Audit target requested:** `rodo-spec@2.6.0` (npm)  
**Git checkout on this branch:** `rodo-spec` monorepo **2.3.0** (`packages/cli/package.json`)  
**Run:** `pnpm build && pnpm --filter rodo-spec test`  
**Last run:** 2026-11-08

## Canonical source evidence (read-only)

| Artifact | Evidence |
|----------|----------|
| **npm `rodo-spec@2.6.0`** | `registry.npmjs.org`, published **2026-11-04T12:16:11Z** |
| **Integrity (pinned in tests)** | `sha512-bZA+bU2wrYMq+wCYNMXl33315pAKINU69gfS8EyrRN0Ojyvehp6mp7H3rQjOH8r+5hb7w/Eex4y1mf/adf3WsA==` |
| **shasum** | `c7c862160c195b1d5c52d3a10d64e70a0431d1a5` |
| **npm `repository` field** | `git+https://github.com/alishafiee1/rodo-spec.git` → `packages/cli` |
| **Tarball CLI version** | `dist/index.js` embeds `version: "2.6.0"` |
| **GitHub `alishafiee1/rodo-spec` @ `main`** | **2.3.0**; tags: `v2.1.0`, `release/2.3.0` only — **no `v2.6.0` tag/branch** |
| **`alishafiee1/rodo-spec-v2`** | **404** — not a public repo |
| **Safeguards in npm tarball only** | `ALREADY_BOUND`, `BOARD_ALREADY_USED`, `--rebind`, `BOARD_CHANGED` present in `dist/index.js` (lines ~13688, 14036, 14060, 14929 in unpacked tarball) |
| **Safeguards in git `main` source** | **Absent** (`rg` on `packages/cli/src`) |

**Resolution:** For the requested **2.6.0** audit, the **published npm tarball** is the authoritative consumer artifact. The **GitHub monorepo on `main` is stale** relative to npm (metadata links to this repo but source is not pushed for 2.4–2.6). Restoring parity requires publishing-source commit(s) not present in this branch.

## Test layers

| Layer | File(s) | What it exercises |
|-------|---------|-------------------|
| **Source in-process (2.3.0)** | `connection-audit.test.ts`, existing suites | Workspace `src/` via Vitest + `fetch` mock |
| **Source safety split** | `connection-safety-source.test.ts` | Characterization vs `it.fails` desired safety |
| **npm black-box (2.6.0)** | `npm-2.6.0-blackbox.test.ts`, `helpers/npm-cli-260.ts` | Pinned tarball, `RODO_HOME` temp, **local TCP mock** (no global fetch stub), `spawn` subprocess |
| **Subprocess smoke (built workspace dist 2.3.0)** | `connection-audit-cli.test.ts` | `init --method-only` only |

Commands:

```bash
pnpm build && pnpm --filter rodo-spec test
# only npm black-box:
pnpm --filter rodo-spec exec vitest run test/npm-2.6.0-blackbox.test.ts
```

## Failure matrix: binding / safety scenarios

| # | Scenario | Source **2.3.0** characterization | Source desired safety | npm **2.6.0** black-box |
|---|----------|-----------------------------------|----------------------|-------------------------|
| 5 | Rebind without `--rebind` | **PASS (unsafe):** overwrites `boardId` | **`it.fails` KNOWN_BUG** | **PASS:** exit 2 `ALREADY_BOUND`, `boardId` unchanged |
| 6 | `--rebind` + base isolation | **PASS:** flag missing in `index.ts` | N/A (capability missing) | **PASS:** `--rebind` moves board, `.rodo/base` cleared |
| 7 | Two folders, one board | **PASS (unsafe):** double bind allowed | **`it.fails` KNOWN_BUG** | **PASS:** exit 2 `BOARD_ALREADY_USED` |
| 11 | Manual `boardId` edit | **PASS:** no `BOARD_CHANGED` | **`it.fails` KNOWN_BUG** | **PASS:** `sync --check` prints `BOARD_CHANGED` |
| login | Subprocess `--connect` | In-process S01–S04 | — | **PASS:** subprocess, token not printed |

Do **not** treat source characterization rows as safety assurance.

## Full 28-scenario matrix (abbreviated)

**Legend:** `SRC` = source 2.3.0 in-process mock; `NPM` = npm 2.6.0 black-box where applicable; others SRC-only mock.

| # | SRC in-process | NPM 2.6.0 | Notes |
|---|----------------|-----------|-------|
| 1 | PASS | PASS (login) | |
| 2 | PASS | — | |
| 3 | PASS | — | |
| 4 | PASS | — | |
| 5 | CHAR unsafe | PASS safety | See failure matrix |
| 6 | NOT_COVERED | PASS safety | `--rebind` |
| 7 | CHAR unsafe | PASS safety | |
| 8 | PASS | — | |
| 9 | PASS | — | |
| 10 | PASS | — | |
| 11 | CHAR | PASS safety | |
| 12–28 | PASS (SRC) | — | Sync/auth/offline; not re-run on tarball except where noted |

Detailed SRC results: same as prior audit file sections (S12–S28 unchanged in `connection-audit.test.ts`).

## Test counts (expected)

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| All `packages/cli` tests | ~213 | **0** (suite green) | 0 |
| Of which `it.fails` KNOWN_BUG | 3 **expected failures** counted as pass by Vitest | — | — |

`it.fails` tests prove source **does not** meet npm 2.6.0 safety bar while keeping CI green.

## Remaining real E2E / manual (not mocked)

- Live **connect code** issuance/expiry on user’s deployment (`rodo.roditeam.ir` / test accounts) — browser
- Device-code OAuth, `boards:create` checkbox, viewer role on shared board — browser
- Server-side `opId` dedup under real 5xx — **RODO server** repo
- Cross-repo duplicate bind if **server** does not enforce — two real repos
- npm **2.6.0** vs **git source** reconciliation — restore missing commits to `alishafiee1/rodo-spec`

## Minimal fixtures for live coordinator

- Isolated `HOME` / `RODO_HOME`
- Test accounts on user’s live deployment (not labeled staging here)
- Disposable boards + connect codes from web UI
- One full git clone + optional shallow clone of same remote

## Cross-repo

- Server contract tests: https://github.com/alishafiee1/RODO (separate agent)
