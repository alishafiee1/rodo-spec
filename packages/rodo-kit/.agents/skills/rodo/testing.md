> یادداشت فارسی: تست اختیاری است ولی پیشنهاد می‌شود، به‌خصوص برای قابلیت‌ها. این فایل قواعد نوشتن تست e2e (مرورگری) و چک‌لیست قبل از دیپلوی است.

# Testing and deploy playbook

Tests are optional in the RODO method, but recommended, especially for features. Nothing blocks work when there are none. Read this when you write or fix end-to-end (browser/API) tests, step definitions or CI test jobs, or prepare a deploy. It adds to your role's playbook.

## Cycle scenarios (playwright-bdd)

- Scenarios live in `rodo/<project>/cycles/NNN-slug/acceptance.feature`, tagged `@cycle-NNN`; each scenario (or its `Rule:`) is tagged with the spec rule IDs it proves (`@R1`). Try to give every `**Rn**` rule in spec.md at least one scenario.
- Step definitions live in the `stepsDirs` folders of `project.json` and must really drive the app and really assert.
- Run one card's tests with `rodo test`: it runs the card's `test.command` (or `testCommand` from `project.json`, replacing `{NNN}`) and records the failure signature. v2 supports the `web` (Playwright + optional playwright-bdd) and `api` (Jest/HTTP) adapters; other adapters work as plain commands with no special parsing. Tick `تست پذیرش پاس شد` only after a real pass. Note: `bddgen` needs `--tags @cycle-NNN` because it fails for the whole project if any cycle still lacks step definitions.
- Cancelled cycles: add the tag `@cancelled` and exclude it in the Playwright config (`tags: 'not @cancelled'`).
- **Never weaken, delete or skip a scenario or test to make code pass.**

## E2E test conventions

1. **Set up through the API, test through the UI.** Create users, workspaces and records with small API helpers; use the browser only for the flow under test. Faster and less flaky.
2. **Isolated, unique data.** Every test creates its own data with a unique name built from a run prefix (`E2E_PREFIX`, default a timestamp). Never depend on data from another test or on test order.
3. **No fixed sleeps.** No `waitForTimeout`/`sleep`. Wait for the result itself (web-first assertions, `expect(...).toPass()` for retries). Raise a timeout only for a known slow step and say why.
4. **Stable selectors.** Prefer `data-testid` and roles. If you add a test id to app code, keep it in the same commit as the test.
5. **Cover failure and permission paths**, not only happy paths: validation errors, 401 for anonymous, 403/404 for strangers and lower roles, removed members, expired sessions, two users at once (realtime / conflict) where the feature promises it.
6. **Flake check before you call it done:** run the suite twice in parallel (`--repeat-each=2 --workers=4`). A test that fails once is a bug in the test or the app; find which. Never "fix" it with a retry or a sleep alone.
7. **`fixme` only with a reason.** Allowed only in the project's own regression suite (never in a cycle's `acceptance.feature`), only when the expected behaviour is a product decision nobody has made. Write the open question in a comment next to it and list it in your report.
8. **Typecheck the tests.** Give the e2e folder its own `tsconfig.json` and run it in CI, especially when the app build ignores type errors.

## Running against a real (shared) server

- One switch, e.g. `E2E_BASE_URL=https://...`: same suite, no local web servers, `workers=1` (shared rate limits), no retries.
- **Throwaway data only:** unique prefix, never touch existing data, no deploys or restarts from tests.
- Record every user/workspace the run creates in a git-ignored file and delete what the API allows in a global teardown. Report what could not be deleted.
- If the server is known to crash on some route (e.g. an image optimizer on an old CPU), block that route in remote mode instead of crashing a shared server.

## CI

- Run the e2e suite in CI with a real database service (e.g. Postgres container), migrations applied, backend + frontend started by the test runner.
- Upload the HTML report / traces as an artifact when it fails.
- A good CI runs lint, typecheck (incl. tests), unit tests, API tests and e2e. If CI is red, say so in the card's Progress notes before you call the card done.

## Deploy checklist (things that bit us)

- **Old CPUs and native modules.** Prebuilt native packages (sharp/libvips, some crypto, ML runtimes) need newer CPU instructions (SSE4.2/AVX). On older CPUs the process dies with **exit code 132 (SIGILL)**, which looks like a random crash loop. Check the target: `grep -o -w 'sse4_2\|avx2' /proc/cpuinfo | sort -u`. Make such features opt-in, or strip the module from the image. Reproduce locally with `qemu-x86_64 -cpu phenom node ...`.
- **Reverse proxy.** Behind Nginx/another proxy, configure the app to trust the proxy (`trust proxy`), or every per-IP rate limit becomes one global limit.
- **Session tokens.** Rotating refresh tokens need a single-flight refresh on the client and a short reuse grace window on the server, or parallel tabs log users out.
- **Migrations** run once per deploy, before the new code serves traffic; a deploy that adds a column needs the migration in the same release.
- After deploy: health endpoint, then the e2e suite in remote mode.
