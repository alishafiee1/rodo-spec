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
├── AGENTS.md                         # Pointer to the RODO skill for AI assistants
├── .agents/
│   └── skills/
│       └── rodo/                     # Agent operational skills, playbooks & templates
└── rodo/
    ├── kit.json                      # Installed RODO kit version & file checksums
    └── <project>/
        ├── project.json              # Project settings & optional board binding (no secrets)
        ├── MAP.md                    # System topology, current state, done & next cycles
        ├── MEMORY.md                 # Append-only cross-cycle decisions & rationale
        ├── RULES.md                  # Human-readable guide to the RODO method
        ├── CHANGELOG.md              # One-line log for small changes that need no card
        ├── project/
        │   ├── brief.md              # Plain-language project overview
        │   ├── architecture.md       # Stack, components, data model & test setup
        │   └── glossary.md           # Domain terms and definitions
        └── cycles/
            └── NNN-slug/             # Discrete feature/task cycle (e.g., 001-auth-flow)
                ├── card.rodo.md      # Cycle card metadata, checklist, refs & progress notes
                ├── simple.md         # Plain-language summary of what the user gets
                ├── spec.md           # Technical rules (R1, R2...), acceptance & doc impact
                ├── design.md         # Architectural design (for major changes)
                └── acceptance.feature # Optional Gherkin scenarios tagged @R1, @R2...
```

---

## Installation

### Prerequisites

- **Node.js**: `>= 20.0.0`
- **npm**, **pnpm**, or **yarn**

### Global Install via npm (Recommended)

```bash
npm install -g rodo-spec
```

Or run directly with `npx`:

```bash
npx rodo-spec --help
```

### Install from Source / GitHub

```bash
git clone https://github.com/alishafiee1/rodo-spec.git
cd rodo-spec
pnpm install
pnpm run build
npm link --workspace=packages/cli
```

---

## Quick Start (Offline / Method-Only Mode)

You can use RODO as a 100% offline methodology without signing up or connecting to any remote server. In method-only mode, `card.rodo.md` files are tracked directly in Git alongside `simple.md` and `spec.md`.

### 1. Initialize your project
```bash
rodo init --method-only --project myapp --lang en
```

### 2. Scaffold your first cycle card
```bash
rodo new "My first feature"
```
This generates `rodo/myapp/cycles/001-my-first-feature/` containing `card.rodo.md`, `simple.md`, and `spec.md` (add `--major` to also generate `design.md` and `acceptance.feature`, or `--slug <kebab-slug>` when the title is non-Latin).

### 3. Validate your specifications
Check that your cards and cycle documents meet all format rules:
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
rodo status --local
rodo doctor
```

---

## Connecting to a RODO Board (3 Ways)

You can connect an existing method-only project—or initialize a brand-new project—with a RODO Kanban board server (default: `https://rodo.n3xus.ir`) at any time. Connecting binds `rodo/<project>/project.json` to the board and runs the initial sync automatically.

### Way 1: One-Step Connect Code from the Web Board (Fastest)
Open your board on the web (`https://rodo.n3xus.ir`), click **"Connect Device" («اتصال دستگاه»)** to generate a one-time code, and run:
```bash
rodo init --project myapp --connect RODO-XXXX-XXXX
```
This logs in your device, binds `rodo/myapp/` to that exact board, and syncs all cards in a single step—no separate `rodo login` needed.

### Way 2: Log In & Bind to an Existing Board (Interactive List or Board ID)
```bash
# 1. Authenticate your device (via browser device code or --connect <code>)
rodo login

# 2a. Pick a board interactively from your workspaces
rodo init --project myapp

# 2b. Or bind directly by passing the board ID
rodo init --project myapp --board <boardId>
```

### Way 3: Log In & Create a New Board from the Terminal
If your device token was approved with board-creation permission (`boards:create`):
```bash
rodo login
rodo init --project myapp --create-board
```
You will be prompted to select the workspace and project and confirm the new board title.

### Ongoing Synchronization
Once connected, run `rodo sync` at the start and end of every work session:
```bash
rodo sync
```

- **Default Server**: `https://rodo.n3xus.ir`
- **Custom Server**: Pass `--server <url>` or set `export RODO_SERVER="https://rodo.n3xus.ir"`.

---

## Commands Table

The CLI executable is `rodo`. Global flags `--project <slug>`, `--lang <fa|en>`, `--json`, and `--verbose` can be used with any command.

| Command | Arguments / Flags | Description |
| :--- | :--- | :--- |
| `rodo init` | `[--method-only] [--project <slug>] [--name <name>] [--lang <fa\|en>] [--connect <code>] [--board <id>] [--create-board] [--server <url>] [--no-kit-update] [--dry-run] [--yes-files]` | Installs or updates the RODO kit, scaffolds `rodo/<project>/`, and optionally binds & syncs with a board. |
| `rodo new` | `"<title>" [--slug <kebab-slug>] [--major] [--dry-run] [--project <slug>]` | Creates the next `rodo/<project>/cycles/NNN-slug/` folder with `card.rodo.md`, `simple.md`, and `spec.md`. |
| `rodo resume` | `[card] [--full] [--project <slug>]` | Prints compact context of the active or specified card for an AI session (`--full` includes architecture & `simple.md`). |
| `rodo validate` | `[paths...] [--strict] [--project <slug>]` | Validates card files and cycle references (`--strict` exits with code `1` on errors for CI). |
| `rodo test` | `[card] [--adapter <web\|api\|cli\|mobile\|iot\|other>] [--project <slug>]` | Runs the card's test command and tracks repeated failure signatures (`RODO_STUCK`). |
| `rodo status` | `[--local] [--project <slug>]` | Displays cards and their state side-by-side (board vs. local, or `--local` offline). |
| `rodo sync` | `[--offline] [--dry-run] [--pull-only] [--push-only] [--confirm-archive] [--check] [--project <slug>]` | Pulls, merges, pushes, and writes back card files with the bound RODO board (`--offline` validates only). |
| `rodo doctor` | `[--project <slug>]` | Runs read-only health checks on Node, Git, kit files, `.gitignore`, server connectivity, and cards. |
| `rodo login` | `[--server <url>] [--connect <code>] [--rotate]` | Logs in with a browser device code or a one-time `--connect` code (`--rotate` replaces the current token). |
| `rodo logout` | `[--server <url>]` | Revokes this device token on the server and deletes the local token. |
| `rodo devices` | `[--server <url>]` | Shows the web URL for managing connected devices (`<server>/devices`) and this device's token scopes. |
| `rodo version` | `[--json]` | Displays the CLI version, bundled kit version, and Node.js runtime version. |

---

## Monorepo Packages

This repository is maintained as a monorepo consisting of modular packages:

- **[`packages/protocol`](packages/protocol)**: Wire contract, sync API payload shapes, and card status rules between the CLI and a RODO board server.
- **[`packages/card-format`](packages/card-format)**: Parser, canonical serializer, 3-way merge engine, secret scanner, and validator for `*.rodo.md` files.
- **[`packages/rodo-kit`](packages/rodo-kit)**: Bundled AI skill (`.agents/skills/rodo/`), Persian & English project templates, and migration manifest.
- **[`packages/cli`](packages/cli)**: The end-user command-line binary (`rodo`) published to npm as `rodo-spec`.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## راهنمای سریع (فارسی)

رودو (**RODO**) یک روش کار و جعبه‌ابزار خط فرمان (`rodo`) برای توسعهٔ ساختاریافتهٔ نرم‌افزار با همکاری انسان و هوش مصنوعی است. RODO یک دروازهٔ مسدودکننده نیست؛ هیچ ابزاری جلوی `commit` یا ادامهٔ کار را نمی‌گیرد، بلکه باعث می‌شود نقشهٔ پروژه (`MAP.md`)، تصمیم‌ها (`MEMORY.md`)، توضیح ساده (`simple.md`) و مشخصات فنی (`spec.md`) همیشه با کد هماهنگ بمانند.

### ۱. نصب

پیشنیاز: **Node.js نسخهٔ ۲۰ یا بالاتر**. برای نصب سراسری از طریق `npm`:

```bash
npm i -g rodo-spec
```

### ۲. شروع سریع بدون سرور (حالت آفلاین / Method-Only)

اگر می‌خواهید بدون نیاز به سرور یا حساب کاربری، روی مخزن گیت خود کار کنید (در این حالت فایل‌های `card.rodo.md` هم داخل گیت ذخیره می‌شوند):

```bash
# ۱. راه‌اندازی کیت و پوشهٔ پروژه به زبان فارسی
rodo init --method-only --project myapp --lang fa

# ۲. ساخت اولین چرخه و کارت جدید (برای عناوین فارسی حتماً --slug انگلیسی بدهید)
rodo new "پیاده‌سازی احراز هویت" --slug auth-feature

# ۳. اعتبارسنجی ساختار کارت‌ها و مشاهدهٔ وضعیت محلی
rodo validate --strict
rodo status --local
```

### ۳. اتصال به سرور و تختهٔ RODO (به ۳ روش)

هر زمان که بخواهید کارت‌های پروژه را روی برد وب RODO (به‌طور پیش‌فرض `https://rodo.n3xus.ir`) ببینید و همگام‌سازی کنید، می‌توانید یکی از سه روش زیر را به کار ببرید:

#### روش اول: اتصال تک‌مرحله‌ای با کد اتصال از داخل برد وب (سریع‌ترین روش)
وارد برد خود در وب‌سایت `https://rodo.n3xus.ir` شوید، روی دکمهٔ **«اتصال دستگاه»** کلیک کنید تا کد یک‌بارمصرف ساخته شود و سپس در ترمینال بزنید:

```bash
rodo init --project myapp --connect RODO-XXXX-XXXX
```
این دستور هم‌زمان ورود دستگاه، اتصال پروژهٔ `rodo/myapp/` به همان برد و اولین همگام‌سازی (`sync`) کارت‌ها را انجام می‌دهد و نیازی به اجرای جداگانهٔ `rodo login` ندارد.

#### روش دوم: ورود و اتصال به برد موجود (انتخاب از لیست یا با شناسهٔ برد)
```bash
# ۱. ورود به حساب کاربری (با کد تایید مرورگر)
rodo login

# ۲-الف. نمایش لیست بردهای شما در ترمینال و انتخاب شمارهٔ برد
rodo init --project myapp

# ۲-ب. یا اتصال مستقیم با دادن شناسهٔ برد (boardId)
rodo init --project myapp --board <boardId>
```

#### روش سوم: ورود و ساخت تختهٔ (برد) جدید از داخل ترمینال
اگر هنگام تایید دستگاه در وب، تیک مجوز ساخت برد (`boards:create`) را زده باشید:
```bash
rodo login
rodo init --project myapp --create-board
```
ابزار از شما فضای کاری و پروژه را می‌پرسد و پس از تایید نام برد، تختهٔ جدید را روی سرور می‌سازد و کارت‌های محلی را به آن ارسال می‌کند.

#### همگام‌سازی مستمر در طول کار (`rodo sync`)
پس از اتصال به برد، در شروع و پایان هر جلسهٔ کاری دستور زیر را اجرا کنید تا تغییرات وب و فایل‌های محلی با هم ادغام و همگام شوند:

```bash
rodo sync
```

> **نکته:** آدرس پیش‌فرض سرور `https://rodo.n3xus.ir` است. برای استفاده از سرور دیگر می‌توانید متغیر محیطی `RODO_SERVER` را تنظیم کنید یا فلگ `--server <url>` را بدهید.

### ۴. دستورات پرکاربرد روزانه

```bash
# دریافت خلاصهٔ وضعیت و زمینهٔ کارت فعال برای دادن به دستیار هوش مصنوعی
rodo resume

# اجرای دستور تست تعریف‌شده برای کارت و پایش شکست‌های تکراری
rodo test

# بررسی سلامت کلی محیط، گیت، کیت و اتصال سرور
rodo doctor

# مشاهدهٔ آدرس مدیریت دستگاه‌های متصل و وضعیت توکن فعلی
rodo devices
```
