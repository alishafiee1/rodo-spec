---
schemaVersion: 2
title: "{{short title}}"
status: todo
# statusReason: ...   # only when status is blocked or cancelled: the reason in plain words
priority: medium
# workflow: standard   # optional: quick | standard | major; local only, never sent to the board
members: []
scope:
  allowed: []
  forbidden: []
---

{{two to five plain lines: what the user gets. Details are in spec.md.}}

## Progress notes

- Updated: {{YYYY-MM-DD}}
- Done: not started yet
- Remaining: all steps

## Refs

- [Plain explanation](/rodo/{{project}}/cycles/{{NNN-slug}}/simple.md)
- [Technical spec](/rodo/{{project}}/cycles/{{NNN-slug}}/spec.md)
<!-- [Acceptance scenarios](/rodo/{{project}}/cycles/{{NNN-slug}}/acceptance.feature) — uncomment only after that file exists -->

## Checklist: Steps

<!-- - [ ] User approval: simple.md and scenarios [approval] — add only when the user asked for a human approval -->
- [ ] {{step 1: a concrete task + how you know it is done}}
- [ ] {{step 2}}
