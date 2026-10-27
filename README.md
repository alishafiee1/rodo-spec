# rodo-spec

[![npm version](https://img.shields.io/npm/v/rodo-spec.svg)](https://www.npmjs.com/package/rodo-spec)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)

> **RODO is a way of working, not a gate.**
> It structures autonomous engineering cycles into predictable, reviewable, and human-aligned iterations through plain Markdown specifications and deterministic CLI automation.

---

## Overview

Modern software development often struggles to bridge high-level intentions with concrete agentic or human execution. `rodo-spec` introduces a disciplined protocol and developer toolkit (`rodo`) that captures intent, architecture, constraints, memory, and validation criteria directly in version-controlled Markdown artifacts.

Whether you run purely offline in **method-only mode** or connect with a shared RODO Kanban server, the framework guarantees that agents and developers always operate with full context, clear guardrails, and deterministic testing criteria.

---

## Project Layout Tree

When initialized within a repository, RODO organizes agent capabilities, project knowledge, and cycle specifications into a clean, predictable hierarchy:

```text
.
├── .agents/
│   └── skills/
│       └── rodo/                 # Agent operational skills & execution prompts
├── rodo/
│   ├── kit.json                  # RODO workspace configuration & metadata
│   ├── AGENTS.md                 # Agent personas, capabilities, and constraints
│   └── <project>/
│       ├── MAP.md                # System topology, module map, and dependencies
│       ├── MEMORY.md             # Long-term cross-cycle knowledge & lessons learned
│       ├── RULES.md              # Invariant project rules and architectural constraints
│       ├── CHANGELOG.md          # Chronological log of accepted cycle outcomes
│       └── cycles/
│           └── NNN-slug/         # Discrete feature/task cycle (e.g., 001-auth-flow)
│               ├── card.rodo.md  # Standard RODO cycle card metadata & state
│               ├── simple.md     # High-level overview & developer summary
│               └── spec.md       # Detailed technical spec, acceptance criteria & tests
```

---

## Installation

### Prerequisites

- **Node.js**: `>= 20.0.0`
- **npm**, **pnpm**, or **yarn**

### Global Install via npm

```bash
npm install -g rodo-spec
```

### Install from Source / GitHub

```bash
git clone https://github.com/n3xus-ir/rodo-spec.git
cd rodo-spec
npm install
npm run build
npm link
```

---

## Quick Start (Offline / Method-Only Mode)

You can use RODO as a 100% offline methodology without signing up or connecting to any remote server.

### 1. Initialize your project
```bash
rodo init --method-only --project myapp --lang en
```

### 2. Scaffold your first cycle card
```bash
rodo new "My first feature"
```
This generates a new cycle directory under `rodo/myapp/cycles/001-my-first-feature/` containing `card.rodo.md`, `simple.md`, and `spec.md`.

### 3. Validate your specifications
Check that your specifications meet the schema, invariants, and constraints:
```bash
rodo validate --strict
```

### 4. Resume or inspect current progress
```bash
rodo resume
```

### 5. Run tests associated with the active card
```bash
rodo test
```

### 6. Review cycle and workspace health
```bash
rodo status
rodo doctor
```

---

## Commands Table

The CLI executable is `rodo`. Below is the complete reference of core commands:

| Command | Arguments / Flags | Description |
| :--- | :--- | :--- |
| `rodo init` | `[--method-only] [--project <name>] [--lang <en\|fa>] [--create-board] [--server <url>]` | Initializes RODO structure, configs, and agent templates in the current repository. |
| `rodo new` | `"<title>" [--slug <slug>] [--project <name>]` | Creates a new cycle card directory with standard RODO specification templates. |
| `rodo resume` | `[card]` | Resumes context on an active or specified cycle card for agent or human execution. |
| `rodo validate` | `[--strict] [--project <name>]` | Validates Markdown files, schemas, links, and invariants across project cycles. |
| `rodo test` | `[card]` | Executes the verification steps and tests declared in the card's `spec.md`. |
| `rodo status` | `[--local] [--project <name>]` | Displays the current cycle state, progression, and work-in-progress diagnostics. |
| `rodo sync` | `[--server <url>] [--force]` | Synchronizes local cards and states with the remote RODO board. |
| `rodo doctor` | _None_ | Diagnoses environment issues, missing dependencies, and directory configuration health. |
| `rodo login` | `[--server <url>]` | Authenticates CLI credentials with a remote RODO Kanban board server. |
| `rodo logout` | _None_ | Clears stored session tokens and remote authentication state. |
| `rodo version` | _None_ | Displays the current version of the CLI and core protocols. |

---

## Method-Only vs. Board Sync

RODO supports two operational modes:

### 1. Method-Only Mode (`--method-only`)
- Operates entirely offline.
- No network traffic, accounts, or API keys required.
- Ideal for personal open-source projects, air-gapped environments, or local-first agent workflows.
- Git remains the single source of truth.

### 2. Board Sync Mode
- Synchronizes your local Markdown cards and state transitions with a collaborative RODO visual board.
- Enabled by specifying a board server during `init` or running `rodo sync`.
- **Default Server**: `https://rodo.n3xus.ir`
- **Configuring the Server**:
  - Pass the flag explicitly: `--server https://rodo.n3xus.ir`
  - Or set the environment variable:
    ```bash
    export RODO_SERVER="https://rodo.n3xus.ir"
    ```

---

## Monorepo Packages

This repository is maintained as a monorepo consisting of modular, reusable packages:

- **[`packages/protocol`](packages/protocol)**: Core data models, state transition machines, invariant validators, and protocol constants.
- **[`packages/card-format`](packages/card-format)**: Markdown AST parsers, frontmatter serialisers, and schema definitions for `card.rodo.md`, `simple.md`, and `spec.md`.
- **[`packages/rodo-kit`](packages/rodo-kit)**: High-level workspace utilities, template engines, scaffolders, and file-system helpers.
- **[`packages/cli`](packages/cli)**: The end-user command-line binary (`rodo`) implementing the commands and interface.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## راهنمای سریع (فارسی)

رودو (**RODO**) یک متدولوژی و جعبه‌ابزار استاندارد برای توسعه نرم‌افزار با همکاری برنامه‌نویسان و هوش مصنوعی است. رودو یک دروازه سخت‌گیرانه نیست، بلکه روشی ساختاریافته است تا تمام مراحل ایده، مشخصات فنی، معماری و آزمون‌ها در قالب فایل‌های ساده و شفاف Markdown ثبت، اعتبارسنجی و اجرا شوند.

### ۱. نصب

برای استفاده از ابزار خط فرمان `rodo`، نسخه ۲۰ یا بالاتر Node.js را نصب کرده و دستور زیر را اجرا کنید:

```bash
npm i -g rodo-spec
```

### ۲. شروع سریع بدون سرور (حالت محلی / Method-Only)

اگر می‌خواهید بدون نیاز به سرور و به صورت کاملاً آفلاین روی مخزن محلی خود کار کنید:

```bash
# راه‌اندازی ساختار رودو به زبان فارسی
rodo init --method-only --project myapp --lang fa
```

### ۳. شروع سریع همراه با سرور و تخته RODO

اگر تمایل دارید کارت‌ها و چرخه‌های کاری با سرور متمرکز هماهنگ شوند:

```bash
# ورود به حساب کاربری
rodo login

# راه‌اندازی پروژه و ساخت تخته کاری
rodo init --project myapp --create-board

# همگام‌سازی وضعیت‌ها با سرور
rodo sync
```

> **نکته:** آدرس پیش‌فرض سرور `https://rodo.n3xus.ir` است که می‌توانید آن را از طریق متغیر محیطی `RODO_SERVER` یا آرگومان `--server` تغییر دهید.

### ۴. ساخت کارت چرخه جدید و اعتبارسنجی

برای تعریف یک تسک یا قابلیت جدید:

```bash
# ساخت کارت جدید با اسلاگ اختصاصی
rodo new "پیاده‌سازی احراز هویت" --slug auth-feature

# بررسی صحت فایل‌ها و عدم وجود خطای ساختاری
rodo validate --strict

# اجرای آزمون‌ها و بررسی سلامت محیط
rodo test
rodo doctor
```
