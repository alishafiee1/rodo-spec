# RODO connection audit — CLI test report

**Repo:** `packages/cli` (`rodo-spec@2.3.0` in this branch; draft plan referenced npm `2.6.0`)  
**Run date:** 2026-11-08  
**Mode:** Mocked HTTP integration + subprocess on built `dist/index.js` — **not** production / roditeam E2E  
**Command:** `pnpm build && pnpm --filter rodo-spec test`  
**Result:** **204 passed**, **1 skipped**, **0 failed** (30 mocked scenarios + 1 subprocess `init` + 1 skipped subprocess `login`)

## Scenario matrix (28 + env precedence)

| # | Scenario | Test file / case | Result | Notes |
|---|----------|------------------|--------|-------|
| 1 | Web one-time connect | `connection-audit.test.ts` › S01 | **PASS** | Mock `POST /v1/devices/connect`; token not in stdout; `project.json` has `boardId` |
| 2 | Reuse connect code | `connection-audit.test.ts` › S02 | **PASS** | Second call exit **4** |
| 3 | Expired connect code | `connection-audit.test.ts` › S03 | **PASS** | `EXPIRED_TOKEN`; no binding churn |
| 4 | Wrong server | `connection-audit.test.ts` › S04 | **PASS** | Code for mock; login to `BUILTIN_SERVER` fails; no creds on builtin host |
| 5 | Bind board B without rebind | `connection-audit.test.ts` › S05 | **CONTRACT_GAP** | No `ALREADY_BOUND` in **2.3.0**; re-bind overwrites `boardId` (npm 2.6.0 plan expected reject) |
| 6 | `--rebind` | `connection-audit.test.ts` › S06 | **NOT_COVERED** | Flag absent from `src/index.ts` commander |
| 7 | Two folders, one board | `connection-audit.test.ts` › S07 | **CONTRACT_GAP** | No `BOARD_ALREADY_USED` client guard; both projects can bind same board |
| 8 | Two projects, two boards | `connection-audit.test.ts` › S08 | **PASS** | Independent `project.json` `boardId` values |
| 9 | `cwd` project resolution | `connection-audit.test.ts` › S09 | **PASS** | Subfolder status scopes to `front`; `--project` lists both |
| 10 | Logout vs unbind | `connection-audit.test.ts` › S10 | **PASS** | `logout` drops token; `boardId` remains until manual re-init |
| 11 | Manual `boardId` edit | `connection-audit.test.ts` › S11 | **PASS** | No `BOARD_CHANGED` code; sync uses edited id (plan 2.6.0 differed) |
| 12 | Two collaborators | `connection-audit.test.ts` › S12 | **PASS** | Git clone + pull mock |
| 13 | Concurrent same field | `connection-audit.test.ts` › S13 | **PASS** | `CONFLICT_RESOLVED` + local copy path |
| 14 | Concurrent different fields | `connection-audit.test.ts` › S14 | **PASS** | Push applies in mock |
| 15 | Local delete + server edit | `connection-audit.test.ts` › S15 | **PASS** | Restore + `CONFLICT_RESOLVED` |
| 16 | Archive confirm | `connection-audit.test.ts` › S16 | **PASS** | `ARCHIVE_CONFIRM_REQUIRED` (>10 deletes) |
| 17 | Archived board | `connection-audit.test.ts` › S17 | **PASS** | Mock archived meta (best-effort; no hard stop in CLI) |
| 18 | Idempotent sync | `connection-audit.test.ts` › S18 | **PASS** | `pulled 0 · pushed 0` |
| 19 | Interrupted push / opId | `connection-audit.test.ts` › S19 | **PASS** | 503 retry; deterministic `opId` not duplicated in mock |
| 20 | Offline sync | `connection-audit.test.ts` › S20 (+ `sync-offline.test.ts`) | **PASS** | Validated offline |
| 21 | Copy tree, new repo | `connection-audit.test.ts` › S21 | **PASS** | Exit **6** `REPOSITORY_MISMATCH` |
| 22 | Foreign card / board id | `connection-audit.test.ts` › S22 | **PASS** | `BOARD_MISMATCH` (schema v1 `boardId` field) |
| 23 | Revoked token | `connection-audit.test.ts` › S23 | **PASS** | Exit **4** `DEVICE_REVOKED` |
| 24 | `--rotate` | `connection-audit.test.ts` › S24 | **PASS** | Old token 401 after rotate |
| 25 | Read-only device | `connection-audit.test.ts` › S25 | **PASS** | `FORBIDDEN` on push |
| 26 | Token redaction | `connection-audit.test.ts` › S26 (+ `doctor-local`, `token-store`) | **PASS** | No bearer material in doctor/login output |
| 27 | Secret in card | `connection-audit.test.ts` › S27 (+ `validate.test.ts`) | **PASS** | `SECRET_SUSPECTED` without value |
| 28 | Shallow clone | `connection-audit.test.ts` › S28 | **PASS** | `REPO_SHALLOW` on sync; `repoFingerprint` null on bind |
| — | `RODO_TOKEN` precedence | `connection-audit.test.ts` › RODO_TOKEN env precedence (+ `token-store.test.ts`) | **PASS** | Env wins; not persisted |

### Subprocess contract (not browser)

| Case | File | Result |
|------|------|--------|
| `rodo login --connect` | `connection-audit-cli.test.ts` | **BLOCKED** | Subprocess hangs under Vitest worker; **in-process** `loginConnect` in S01–S04 |
| `rodo init --method-only` | `connection-audit-cli.test.ts` | **PASS** |

## Documented contract gaps vs draft plan (npm 2.6.0 static review)

| Gap | Evidence in this tree | Suggested owner |
|-----|-------------------------|-----------------|
| `ALREADY_BOUND` / `--rebind` | Absent in `packages/cli/src` | CLI + server bind API |
| `BOARD_ALREADY_USED` (in-repo duplicate bind) | Absent; S07 allows double bind | CLI bind step + server |
| `BOARD_CHANGED` after manual `project.json` edit | Absent; S11 | CLI sync guard |
| `unbind` command | Only `logout` | Product / CLI |
| Default server still `https://rodo.n3xus.ir` | `src/commands/server.ts` | Config / docs |
| Server-side `opId` dedup | Mock enforces; not proven against production | RODO server repo |

These are **classified**, not fixed in this PR (tests/audit only).

## Remaining live / browser validation (coordinator)

- Real one-time connect code issuance and expiry on `rodo.roditeam.ir`
- Device-code OAuth page, `boards:create` checkbox, viewer role on a shared board
- Multi-repo duplicate bind if server does not reject
- Browser archive flow and archived-board hard errors
- End-to-end collaborator test with two real accounts
- npm **2.6.0** published tarball vs this **2.3.0** source (rebind / ALREADY_BOUND may exist only in newer release)

## Minimal live fixtures (when coordinator runs E2E)

- Isolated `HOME` / `RODO_HOME`
- Three disposable boards on a **non-production** server
- Two disposable device logins (`sample1`/`sample2` class accounts per policy)
- One git repo + one shallow clone of the same remote
- No real API keys in cards; fake connect codes only from server UI

## Cross-repo notes

- Push `opId` idempotency and connect-code single-use must be asserted in [RODO server](https://github.com/alishafiee1/RODO) (handled by other agent).
- Protocol types in `@rodo/protocol` list `CONNECT_CODE_INVALID` / `DEVICE_*` codes used by mocks; server must emit matching JSON bodies.
