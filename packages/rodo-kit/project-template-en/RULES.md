# The RODO method: guide for people (kit 2.3.0)

> This file is for you, not for the AI. The AI reads the same rules from `.agents/skills/rodo/`.

## Quick start (2 minutes)

1. Ask your AI assistant for a feature in plain words. It reads `AGENTS.md`, plans **one card** and writes `simple.md` (what you get) and `spec.md` (the technical rules).
2. Read `simple.md`. If something is wrong, say so; the AI fixes the card before coding.
3. The AI codes the card step by step and ticks the checklist. You can follow it with `rodo status` and `rodo resume`.
4. When the card is done, the AI updates `MAP.md` (what is finished) and `MEMORY.md` (the decisions).
5. Small fixes that do not change described behaviour get one line in `CHANGELOG.md` instead of a card.
6. Optional: connect a board with `rodo init` to see and edit the cards on the web; `rodo sync` keeps both sides in step.

Useful commands: `rodo new "<title>"` (a new cycle folder with its files), `rodo validate`, `rodo status`, `rodo resume`, `rodo test`, `rodo doctor`.

## 1. The method at a glance

RODO is a **way of working**, not a gate. No tool blocks a commit or stops work. The AI follows it because it keeps the project understandable for you, your teammates and the next AI session.

| Layer | Like | Files | When it is read |
|---|---|---|---|
| **Map** | "Where are we?" | `rodo/<project>/MAP.md`, `MEMORY.md` | always, first |
| **Rules** | "How do we work?" | `.agents/skills/rodo/` | once per session |
| **Case file** | "Details of this piece of work" | `rodo/<project>/cycles/NNN-slug/` | only when needed |

The AI always: reads the map first; keeps the docs true (when code changes something a doc describes, the doc changes in the same work); makes a card for every new feature, change or improvement.

## 2. Folders and files

```
AGENTS.md                      pointer to the skill
.agents/skills/rodo/           the AI skill (owned by the kit; rodo init updates it)
rodo/
├── kit.json                   installed kit version
└── <project>/
    ├── project.json           board binding and settings (no secrets)
    ├── MAP.md                 what the project is, where we are, done, cancelled, next
    ├── MEMORY.md              important decisions, one line each with "because"
    ├── CHANGELOG.md           small changes without a card, one line each
    ├── RULES.md               this file
    ├── project/               brief, architecture, glossary, project-overview, how-it-works (always current)
    └── cycles/NNN-slug/       one folder per card: card.rodo.md, simple.md, spec.md, design.md, acceptance.feature
```

## 3. Statuses (exactly five)

`todo` planned · `in_progress` being worked on · `blocked` cannot go on (needs `blockerType` and a plain `statusReason`) · `cancelled` you decided not to do it (needs `statusReason`; the card stays) · `done` finished.

## 4. When is a card needed?

For every new feature, change or improvement, and for every change to behaviour that a card, spec or scenario describes. Not for a typo, style, refactor or a fix that does not change described behaviour: those get one `CHANGELOG.md` line.

## 5. Your part

- Answer the AI's questions (it asks only what matters, at most 5 at a time).
- When a card asks for a decision (`## Decision:`), answer it on the web; the AI never answers for you.
- Approval steps (`[approval]`) are ticked only by a person, on the web.
- If the AI says it is stuck (the same failure twice), choose: clarify, try a stronger model, or cancel.

## 6. Cards and Git

- Without a board, card files (`*.rodo.md`) are committed to Git like any other file.
- With a board, card files live on the board and arrive through `rodo sync`; `rodo init` adds them to `.gitignore`.
- `rodo sync` never loses your text: when the board wins a conflict, your file is saved in `rodo/<project>/.rodo/conflicts/`.

## 7. The two plain project docs

- `project-overview.md` is the plan for a client: what the project is, its parts, and a tick beside the finished ones.
- `how-it-works.md` is for you: what the project is built from, how each part works and what it makes easier.
- If a new feature or major change does not fit them, the AI updates them before work starts and a new part goes in unticked. When the card closes, the text is made true and the part is ticked.
- They never grow past one or two pages; `rodo validate` warns if they do.

## 8. Never

- No secrets (passwords, keys, tokens) in any file under `rodo/`, in cards or in commit messages.
- The AI never deletes files without your OK, never creates boards, and never answers decisions or ticks approvals.
