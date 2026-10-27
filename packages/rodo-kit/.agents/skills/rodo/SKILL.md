---
name: rodo
description: RODO project method. Use whenever the repo has a rodo/ folder or *.rodo.md cards, or the user asks to plan a feature, code a card, fix a bug, onboard a project or make a small change. Tells you how to start and close a session (rodo sync, rodo resume), what to read, when a card is needed, and which playbook to follow.
---

> یادداشت فارسی: این مهارت برای AI است. نسخهٔ انسانی همین قواعد در `rodo/<project>/RULES.md` است. RODO فقط «روش کار» است: هیچ ابزاری جلوی commit، تست یا کار را نمی‌گیرد.

# RODO method (kit 2.2.0)

RODO is a way of working, not a gate. Nothing blocks a commit, a test or a status. You follow it because it keeps the project understandable for the user, for teammates and for the next AI session.

## Projects in this repo

Every folder `rodo/<project>/` with a `project.json` is one RODO project, bound to one board. Work in the project the user names; if there is only one, use it; if unsure, ask. Paths below are relative to `rodo/<project>/`.

## Session start (every session, every change)

1. If this folder is a git repository, look only (`git status -sb`, or how many commits `HEAD` is behind `@{upstream}`). Do **not** run `git pull`, `git fetch`, `git merge` or `git rebase`. Card files (`*.rodo.md`) arrive through `rodo sync`. MAP, MEMORY, `spec.md` and `simple.md` arrive through Git. If the branch is behind its remote, or you cannot tell, tell the user once and ask them to update the repo when they are ready. Then keep going with the files already on disk.
2. Run `rodo sync` (all projects) or `rodo sync --project <slug>`. It pulls board changes into the card files. If it says OFFLINE or exits 4 (login needed), continue working and tell the user once.
3. Run `rodo resume` (or `rodo resume <card>`) and read its output. Use `rodo resume --full` only for planning or deep debugging.
4. If the tool is not installed, read `MAP.md`, `MEMORY.md` and the active card yourself.
5. Read ONLY the files listed under the card's `## Refs` and the code they point to. Do not read the whole repository.
6. If the card has an unticked `[approval]` step: stop, tell the user it waits for their approval on the web, and do nothing else on that card.
7. If the card has an answered `## Decision:` (a `- Answer:` line): apply the answer, then set `status: in_progress` and remove `statusReason` and `blockerType` if the card was blocked only for that decision.

## Session close (every session, before you stop)

1. Update `## Progress notes`: `- Updated:`, `- Done:`, `- Remaining:` (free text). The reason for `blocked` / `cancelled` goes in the `statusReason` key, not in the notes.
2. Report what you changed, in plain words.
3. If the card has a test command, run `rodo test` (recommended, not required). Report the result honestly.
4. Record new decisions (spec.md `## Decisions`; MEMORY.md when the card closes).
5. Update any doc your change made wrong (same commit).
6. Check scope (below).
7. Run `rodo sync`. If it reports errors for a card you touched, fix them and run it again (at most twice), then tell the user what is left.
8. If `rodo sync` reports `ARCHIVE_CONFIRM_REQUIRED` (more than 10 card files deleted): **stop and ask the user**. List the cards, and say why they are gone. Never add `--confirm-archive` yourself, never restore or delete files to make the warning go away, and never skip it silently. Only run `rodo sync --confirm-archive` after the user explicitly says yes in this session.

## What you always do

1. **A card for every new feature, change or improvement** (planner.md). A small change that does not change described behaviour gets one CHANGELOG line instead (small-change.md).
2. **A raw request** from the user that is not planned yet becomes a `todo` card with `## Goal` and `## Why` in its description (template `templates/request.rodo.md`; no separate request document).
3. **Keep the docs true.** Code and current documentation are one system: when code changes something a current document describes, the document changes in the same piece of work. Historical cycle documents are preserved as they were (see "Documents: current, active, historical").
4. **Never delete files** without the user's OK.
5. **No secrets** (passwords, API keys, tokens, private keys, connection strings) in any file under `rodo/`, in cards, in Progress notes, in commit messages or in your replies. Refer to them by name ("the payment API key") only.

## Fields you must never write

`id`, `tempId`, `boardId`, `updatedAt`, `locked`, any `<!-- rodo:… -->` comment, the first-line `<!-- RODO_ERROR … -->`, and `- Answer:` lines under a decision. `rodo sync` writes them. If a file starts with `RODO_ERROR`, fix the cause; sync removes the line.

## Statuses (exactly five)

| Status | Meaning | Who sets it |
|---|---|---|
| `todo` | planned, not started (also: a raw request) | planner |
| `in_progress` | being worked on | coder, when work starts |
| `blocked` | cannot go on. Needs `blockerType` and a plain reason in `statusReason:` | you, by yourself; tell the user |
| `cancelled` | the user decided not to do it; the card stays, with `statusReason: <reason>` | only with the user's OK |
| `done` | finished; if tests were run, they passed (tests stay optional, D6) | coder |

`blockerType`: `decision` (the user must choose) · `requirement` (the goal is unclear) · `technical` (you cannot solve it) · `test` (a test cannot run or keeps failing) · `environment` (tool, server, dependency) · `external` (waiting for someone/something outside) · `permission` (an access key or right is missing).

## Stuck rule (failure signature)

`rodo test` prints a failure signature (12 hex characters) and writes `- Last failure: <sig> ×<n>`. When the **same signature** appears twice (`×2`, or `RODO_STUCK`), stop: set `status: blocked`, `blockerType: test` (or `technical`), write the problem in plain words in `statusReason:`, and ask the user: clarify, try a stronger model, or cancel. Different failures do not count: fix them and go on. Without `rodo test`, apply the same rule yourself: same error message at the same place twice = stuck. This is also the limit of the FIX → VERIFY loop.

## Needs a decision

This is for choices that come up **during work**; questions before planning are Clarification (see "Ask only what matters"). When only the user can choose (behaviour, wording, priority, trade-off), do not guess. Add to the card, after `## Refs`:

    ## Decision: <one short question in the simple language>

    - A: <option>
    - B: <option>

(2–6 options, keys A–F.) Set `status: blocked`, `blockerType: decision`, `statusReason: waiting for your decision: <question>`, run `rodo sync`, and tell the user to answer on the web. Never write the `- Answer:` line yourself.

## Scope

A card may have `scope: {allowed: [...], forbidden: [...]}`. Stay inside `allowed`; never touch `forbidden`. When you find work outside the scope (or a new requirement): do not do it silently. Write `- Out of scope: <item> → new card` in Progress notes, tell the user, and (planner) create a new `todo` card for it. A small change of the same feature: update the card and its docs and tell the user.

## Pick your role, then open one playbook

| Situation | Playbook |
|---|---|
| New feature, change, improvement; a request; a stuck card the user sent back | `planner.md` |
| You were given a card to implement or continue | `coder.md` |
| The repo has code but no `rodo/<project>/` yet | `onboarding.md` |
| Typo, style, refactor or a fix that does not change described behaviour | `small-change.md` |
| You write or fix tests (optional, recommended) | `testing.md` |

## Workflow levels

Every request gets one level. The yes/no classification questions are in `planner.md` ("Classify"). Documents are recommendations; nothing is forced.

- **QUICK** — the small-change rule (`small-change.md`): no card, one `CHANGELOG.md` line, a one-line docs glance.
- **STANDARD** — a card, `spec.md` and a short `simple.md`; `acceptance.feature` optional.
- **MAJOR** — like STANDARD plus `design.md` and `acceptance.feature`; an independent review is recommended.

    UNDERSTAND -> DOC IMPACT -> CLASSIFY (provisional)
        QUICK:              change + 1 CHANGELOG line + one-line docs glance -> DONE
        STANDARD / MAJOR:   CLARIFY (only important, <= 5)
                            -> RECLASSIFY if scope changed
                            -> DOCS/PLAN (spec; simple; design if MAJOR)
                            -> TASKS -> BUILD
                            -> VERIFY (fitting checks + doc consistency)
                            -> REVIEW (optional; recommended for MAJOR)
                            -> FIX <-> VERIFY ... same failure twice -> BLOCKED
                            -> DONE

## Ask only what matters

**Ask only when** the answer changes expected behaviour, when there are several reasonable options, when a wrong choice would be costly to undo, or when there is no safe default. Otherwise choose a low-risk, reversible default, write it in `spec.md` `## Decisions` as `<decision> (default, not asked). Because <reason>.`, and go on. The goal is less rework, not more conversation.

**Clarification** happens **before planning**, in the conversation, about *what* to build. The card is `todo` (or does not exist yet). Answers go into `spec.md` `## Decisions`. The status does not change.

**Needs Decision** happens **during work** (`in_progress`), when only the user can choose and you cannot go on. Use a `## Decision:` section on the card, set `status: blocked` and `blockerType: decision`, and the user answers on the web ("Needs a decision" below, unchanged).

Do not turn ordinary clarification questions into `## Decision:` sections, and do not stop mid-work for trivial choices (use the ask rule).

## Documents: current, active, historical

**Code and current documentation are one system.** When code changes something a current document describes, the document changes in the same piece of work. Historical cycle documents are preserved as they were, unless they are explicitly marked current.

| Kind | Files | Rule |
|---|---|---|
| **CURRENT** (canonical) | `rodo/<project>/project/*`, `MAP.md`, `MEMORY.md` | Must describe the code as it is now. Update them in the same work. `MEMORY.md` is append-only: add a new line that says which line it replaces; never rewrite old lines. |
| **ACTIVE CYCLE** | the docs of the card you are working on (`simple.md`, `spec.md`, `design.md`, `acceptance.feature`) | Must match the code when the card is done. |
| **HISTORICAL** | docs of `done` and `cancelled` cycles | Never rewritten. A later card refers to them; a new decision goes into the new card and `MEMORY.md`. |

Before planning, list the current docs this change will make wrong in `spec.md` `## Documentation Impact` (planner.md). In VERIFY, check that each of them was updated (coder.md "Verify and fix").

## Verify and review

Run the checks that fit this change with the project's own tools; RODO runs nothing itself. Always include documentation consistency. Write `- Verified: <check> ✓/✗, …` in Progress notes. FIX → VERIFY until it passes or the stuck rule applies. An independent review is optional (recommended for MAJOR) and never replaces tests. The menu and the details are in `coder.md` "Verify and fix".

## Project layout

    AGENTS.md                         pointer to this skill
    .agents/skills/rodo/              this skill (kit-owned; updated by rodo init)
    rodo/
      kit.json                        installed kit version
      <project>/
        project.json                  board binding and settings (no secrets)
        MAP.md  MEMORY.md  RULES.md  CHANGELOG.md
        project/{brief,architecture,glossary}.md
        cycles/NNN-slug/
          card.rodo.md                the card (synced with the board, not in git)
          simple.md                   plain explanation (shown read-only on the web)
          spec.md                     technical rules **R1**, **R2** …
          design.md                   design for MAJOR changes (optional)
          acceptance.feature          scenarios tagged @R1 … (optional)
        inbox/                        cards created on the web (not in git)

Card format details: the comments in `templates/card.rodo.md` and `rodo validate`. Templates come in two languages: `templates/` (Persian) and `templates/en/` (English); use the one that matches `language.simple` in `project.json`. `rodo new "<title>"` creates `cycles/NNN-slug/` with the card, `simple.md` and `spec.md` from them.

## Tools

| Command | Use |
|---|---|
| `rodo sync` | start and end of every session |
| `rodo resume [card] [--full]` | context for a new session |
| `rodo status` | board vs local, side by side |
| `rodo test [card]` | run the card's test command, record the failure signature |
| `rodo new "<title>"` | create the next cycle folder with `card.rodo.md`, `simple.md`, `spec.md` (`--major` adds `design.md` and `acceptance.feature`) |
| `rodo validate` | check card files (never blocks; `--strict` exits 1 on errors, for CI) |
| `rodo doctor` | find setup problems |
| `rodo init` | install/update the kit, bind a board. **Never create a board yourself**: if a board is needed, ask the user to run `rodo init` in their terminal. |

Optional, if available in the project: Graphify (code map, for Documentation Impact and finding affected code) and Context7 (current library docs). Never install them yourself; RODO works without them.
