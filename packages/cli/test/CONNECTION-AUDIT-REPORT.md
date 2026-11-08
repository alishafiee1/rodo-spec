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
| **`alishafiee1/rodo-spec-v2`** | **Private** — user-verified via authenticated SCM (`package.json`: `rodo-spec-monorepo` **2.7.0**, pnpm 9.15.9). **Not readable in this cloud run** (see access blocker below). An unauthenticated GitHub API `404` is **not** proof the repo is absent. |
| **Safeguards in npm tarball only** | `ALREADY_BOUND`, `BOARD_ALREADY_USED`, `--rebind`, `BOARD_CHANGED` present in `dist/index.js` (lines ~13688, 14036, 14060, 14929 in unpacked tarball) |
| **Safeguards in git `main` source** | **Absent** (`rg` on `packages/cli/src`) |

**Resolution (layered):**

1. **npm `rodo-spec@2.6.0` tarball** — authoritative for what `npm install` runs today (black-box suite).
2. **`alishafiee1/rodo-spec` `main` @ 2.3.0** — stale vs npm and vs private **v2 @ 2.7.0** (current development monorepo per user).
3. **`alishafiee1/rodo-spec-v2`** — likely canonical **source** for releases after 2.3.0; migrate connection-audit tests there when a cloud agent is launched **on that repo** with SCM access.

### Cloud agent access blocker (this run)

| Check | Result |
|-------|--------|
| Cursor Cloud `environment.repos` | Only `github.com/alishafiee1/rodo-spec` |
| Dynamic MCP catalog | No `cursor-github` / `get_file_contents` namespace |
| `gh` CLI principal | `cursor` (service); `gh repo view alishafiee1/rodo-spec-v2` → GraphQL **Could not resolve** / REST **404** (insufficient scope to private repo) |
| Action | **Cannot clone, checkout, or open PR on `rodo-spec-v2` from this VM.** Coordinator: launch cloud agent with `rodo-spec-v2` in environment repos (or user token with repo scope). |

**PR [#2](https://github.com/alishafiee1/rodo-spec/pull/2)** stays on `rodo-spec` only; a separate PR on v2 is **not opened** here.

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

## Test counts (meaningful, not double-counted)

Command: `pnpm build && pnpm --filter rodo-spec test`

| Count | Meaning |
|-------|---------|
| **213** | Vitest **engine** results: every `it()` resolved green (including Vitest `it.fails` semantics). |
| **3 `it.fails`** | **Desired safety** on source **2.3.0** — tests that *should* pass when source matches npm 2.6.0; they **fail logically** but Vitest marks the example **passed** because failure was expected. Proof: source lacks `ALREADY_BOUND` / `BOARD_ALREADY_USED` / `BOARD_CHANGED`. |
| **~26** | In-process mocked scenarios in `connection-audit.test.ts` (not a separate npm run). |
| **6** | npm **2.6.0** black-box (`npm-2.6.0-blackbox.test.ts`) — all **PASS** on safeguards + subprocess login. |
| **4** | Source **characterization** (unsafe behavior documented, not safety PASS). |
| **1** | Subprocess `init --method-only` on **workspace built dist 2.3.0** only. |

**213 passing does not mean source is safe** — npm tarball black-box + `it.fails` carry that signal. npm **2.6.0** audit remains valid independent of v2 access.

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
