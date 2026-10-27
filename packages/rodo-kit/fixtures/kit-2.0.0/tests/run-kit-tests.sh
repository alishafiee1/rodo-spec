#!/usr/bin/env bash
# Tests for the RODO method kit 2.x: install and update scripts, kit consistency, and the example project.
# The kit enforces nothing; these tests only check that the kit itself is complete and its scripts behave.
# Usage: bash tests/run-kit-tests.sh   (needs node, git)
set -u
KIT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL="$KIT/scripts/rodo-install.cjs"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 (expected $2, got $3)"; sed 's/^/        /' "$TMP/out" 2>/dev/null | head -8; fail=$((fail+1)); fi
}
has() { grep -c -- "$1" "${2:-$TMP/out}" 2>/dev/null | awk '{s+=$1} END {print (s>0)?1:0}'; }
run() { "$@" >"$TMP/out" 2>&1; echo $?; }

echo "== kit consistency"
for f in .githooks .github .claude scripts/rodo-lint.cjs scripts/rodo-lint scripts/rodo-done.cjs scripts/rodo-approval.cjs; do
  check "removed: $f is gone" 0 "$([ -e "$KIT/$f" ] && echo 1 || echo 0)"
done
grep -rnI -E 'rodo-lint|rodo-done|rodo-approval|rodo-guard|hooksPath|\.githooks|workflows/rodo\.yml|approvalRequiresSync|acceptanceCommand|ciTestCommand|x-failures|\[approval: ' "$KIT" \
  --exclude=MIGRATION.md --exclude=run-kit-tests.sh >"$TMP/out" 2>&1
check "no file mentions removed parts (except MIGRATION.md)" 0 "$(grep -c . "$TMP/out")"
check "KIT_VERSION is 2.0.0" "2.0.0" "$(cat "$KIT/KIT_VERSION")"
check "kit-manifest version matches KIT_VERSION" "$(cat "$KIT/KIT_VERSION")" "$(node -p "require('$KIT/kit-manifest.json').version")"
check "every manifest file exists" 0 "$(node -e "const m=require('$KIT/kit-manifest.json');const fs=require('fs');process.stdout.write(String(m.files.filter(f=>!fs.existsSync('$KIT/'+f)).length))")"
for j in kit-manifest.json .agents/skills/rodo/templates/config.json example/rodo/config.json example/package.json; do
  check "valid JSON: $j" 0 "$(node -e "JSON.parse(require('fs').readFileSync('$KIT/$j','utf8'))" >/dev/null 2>&1; echo $?)"
done
for p in SKILL planner coder onboarding small-change testing; do check "skill playbook exists: $p.md" 1 "$([ -s "$KIT/.agents/skills/rodo/$p.md" ] && echo 1 || echo 0)"; done
for t in MAP MEMORY CHANGELOG brief architecture glossary simple spec card.rodo; do check "template exists: $t" 1 "$(ls "$KIT/.agents/skills/rodo/templates/$t".* >/dev/null 2>&1 && echo 1 || echo 0)"; done
check "small-change rule: decision question is written" 1 "$(has 'would any sentence in a card' "$KIT/.agents/skills/rodo/small-change.md")"
check "small-change rule: in RULES.md (Persian)" 1 "$(has 'آیا جمله‌ای در یک کارت' "$KIT/rodo/RULES.md")"
check "CHANGELOG format has date | what | why | files" 1 "$(has 'YYYY-MM-DD | what changed | why | files' "$KIT/.agents/skills/rodo/small-change.md")"
check "SKILL says approval and tests are optional" 1 "$(has 'Optional: human approval' "$KIT/.agents/skills/rodo/SKILL.md")"

echo "== example project"
E="$KIT/example"
for c in "$E"/rodo/cycles/*/; do n=$(basename "$c"); check "example $n has simple.md" 1 "$([ -s "$c/simple.md" ] && echo 1 || echo 0)"; done
node - "$E" >"$TMP/out" 2>&1 <<'EOF'
// Light self-check of the example cards (the RODO watcher does the real validation in projects).
const fs = require('fs'), path = require('path'); const root = process.argv[2]; let bad = 0;
const say = (m) => { console.log(m); bad++; };
for (const n of fs.readdirSync(path.join(root, 'rodo/cycles'))) {
  const f = path.join(root, 'rodo/cycles', n, 'card.rodo.md'); if (!fs.existsSync(f)) continue;
  const t = fs.readFileSync(f, 'utf8'); const m = /^---\n([\s\S]*?)\n---\n/.exec(t);
  if (!m) { say(`${n}: no frontmatter`); continue; }
  const fm = Object.fromEntries(m[1].split('\n').map((l) => /^([\w-]+):\s*(.*)$/.exec(l)).filter(Boolean).map((x) => [x[1], x[2].replace(/^"|"$/g, '')]));
  for (const k of ['schemaVersion', 'boardId', 'title', 'status']) if (!fm[k]) say(`${n}: missing ${k}`);
  if (!['todo', 'in_progress', 'blocked', 'cancelled', 'done'].includes(fm.status)) say(`${n}: status ${fm.status}`);
  const note = (k) => { const m = new RegExp(`^- ${k}:[ \\t]*(.*)$`, 'm').exec(t); return m ? m[1].trim() : ''; };
  if (fm.status === 'blocked' && (!note('Blocker') || note('Blocker') === 'none')) say(`${n}: blocked without a "- Blocker:" reason`);
  if (fm.status === 'cancelled' && !note('Cancelled')) say(`${n}: cancelled without a "- Cancelled:" reason`);
  if (fm.status === 'cancelled' && !new RegExp(`^## لغوشده[\\s\\S]*?\\(/rodo/cycles/${n}/`, 'm').test(fs.readFileSync(path.join(root, 'rodo/MAP.md'), 'utf8'))) say(`${n}: cancelled but not listed under ## لغوشده in MAP.md`);
  for (const r of t.matchAll(/^- \[[^\]]+\]\((\/[^)#\s]+)/gm)) if (!fs.existsSync(path.join(root, r[1]))) say(`${n}: ref not found ${r[1]}`);
}
const map = fs.readFileSync(path.join(root, 'rodo/MAP.md'), 'utf8');
for (const r of map.matchAll(/\]\((\/[^)#\s]+)/g)) if (!fs.existsSync(path.join(root, r[1]))) say(`MAP: broken link ${r[1]}`);
for (const l of fs.readFileSync(path.join(root, 'rodo/CHANGELOG.md'), 'utf8').split('\n').filter((l) => l.startsWith('- ')))
  if (!/^- \d{4}-\d{2}-\d{2} \| .+ \| .+ \| .+$/.test(l)) say(`CHANGELOG line not "date | what | why | files": ${l}`);
process.exit(bad ? 1 : 0);
EOF
check "example cards, refs, MAP links and CHANGELOG lines are well formed" 0 "$?"
for c in "$E"/rodo/cycles/*/; do
  [ -f "$c/spec.md" ] && [ -f "$c/acceptance.feature" ] || continue
  missing=0; for r in $(grep -oE '\*\*R[0-9]+\*\*' "$c/spec.md" | tr -d '*' | sort -u); do grep -qE "@$r( |$)" "$c/acceptance.feature" || missing=$((missing+1)); done
  check "example $(basename "$c"): every spec rule Rn has an @Rn scenario" 0 "$missing"
done
check "example keeps the cancelled card (status: cancelled)" 1 "$(grep -c '^status: cancelled$' "$E/rodo/cycles/003-gift-wrap/card.rodo.md" 2>/dev/null)"
check "SKILL lists the five statuses" 1 "$(has 'todo` | `in_progress` | `blocked` | `cancelled` | `done' "$KIT/.agents/skills/rodo/SKILL.md")"
check "RULES.md explains blocked and cancelled" 2 "$(grep -c -E '^\| `(blocked|cancelled)`' "$KIT/rodo/RULES.md")"
check "example has a cancelled cycle listed with a reason" 1 "$(grep -A3 '^## لغوشده' "$E/rodo/MAP.md" | grep -c '003-gift-wrap.*— ')"

echo "== install"
T="$TMP/new"; mkdir -p "$T"; (cd "$T" && git init -q); printf '# My project\n\nOwn rules.\n' > "$T/AGENTS.md"
mkdir -p "$T/rodo"; echo "MY MAP" > "$T/rodo/MAP.md"
check "install into an existing project" 0 "$(run node "$INSTALL" --target "$T")"
check "  ...keeps the user's AGENTS.md text" 1 "$(has 'Own rules.' "$T/AGENTS.md")"
check "  ...appends one RODO block" 1 "$(grep -c 'rodo:start' "$T/AGENTS.md")"
check "  ...creates CLAUDE.md" 1 "$(has '@AGENTS.md' "$T/CLAUDE.md")"
check "  ...installs the skill" 1 "$([ -s "$T/.agents/skills/rodo/SKILL.md" ] && echo 1 || echo 0)"
check "  ...creates the rodo/ skeleton" 1 "$([ -s "$T/rodo/RULES.md" ] && [ -s "$T/rodo/config.json" ] && [ -s "$T/rodo/project/brief.md" ] && [ -d "$T/rodo/cycles" ] && echo 1 || echo 0)"
check "  ...never overwrites an existing file (rodo/MAP.md kept)" "MY MAP" "$(cat "$T/rodo/MAP.md")"
check "  ...writes rodo/.kit-version" "2.0.0" "$(cat "$T/rodo/.kit-version")"
check "  ...keeps cards out of git via .gitignore" 1 "$(has '^\*\.rodo\.md$' "$T/.gitignore")"
check "  ...does NOT set core.hooksPath" "" "$(cd "$T" && git config core.hooksPath)"
check "  ...installs no hooks or CI files" 0 "$(ls -d "$T/.githooks" "$T/.github" "$T/.claude" 2>/dev/null | wc -l | tr -d ' ')"
echo "// my change" >> "$T/scripts/rodo-update.cjs"; node "$INSTALL" --target "$T" >"$TMP/out" 2>&1
check "install twice: still one RODO block" 1 "$(grep -c 'rodo:start' "$T/AGENTS.md")"
check "install twice: .gitignore not duplicated" 1 "$(grep -c '^\*\.rodo\.md$' "$T/.gitignore")"
check "install twice: a changed kit file is kept, not overwritten" 1 "$(grep -c 'my change' "$T/scripts/rodo-update.cjs")"
T2="$TMP/nog"; mkdir -p "$T2"; node "$INSTALL" --target "$T2" --no-gitignore >"$TMP/out" 2>&1
check "install --no-gitignore leaves .gitignore alone" 0 "$([ -e "$T2/.gitignore" ] && echo 1 || echo 0)"
check "install works outside git" 0 "$(run node "$INSTALL" --target "$TMP/nogit")"
check "install refuses the kit folder as target" 2 "$(run node "$INSTALL" --target "$KIT")"

echo "== update"
git -C "$T" checkout -q -- . 2>/dev/null; cp "$KIT/scripts/rodo-update.cjs" "$T/scripts/rodo-update.cjs"
NK="$TMP/kit2"; mkdir -p "$NK"
(cd "$KIT" && tar cf - --exclude=./example --exclude=./tests .) | (cd "$NK" && tar xf -)
echo 9.9.9 > "$NK/KIT_VERSION"; echo '// v9 marker' >> "$NK/scripts/rodo-install.cjs"
echo "NEW SKILL FILE" > "$NK/.agents/skills/rodo/new-playbook.md"; rm "$NK/.agents/skills/rodo/testing.md"
mkdir -p "$NK/rodo"; echo "KIT RULES SHOULD NOT LAND" > "$NK/rodo/RULES.md"
sum() { (cd "$T" && find rodo -type f ! -name .kit-version -exec md5sum {} + | sort; md5sum AGENTS.md CLAUDE.md); }
before=$(sum)
check "update --dry-run" 0 "$(run node "$T/scripts/rodo-update.cjs" --root "$T" --from "$NK" --dry-run)"
check "  ...changes nothing" 0 "$(grep -c 'v9 marker' "$T/scripts/rodo-install.cjs")"
check "update --from a newer kit" 0 "$(run node "$T/scripts/rodo-update.cjs" --root "$T" --from "$NK")"
check "  ...replaces kit files" 1 "$(grep -c 'v9 marker' "$T/scripts/rodo-install.cjs")"
check "  ...adds new skill files and drops removed ones" "1 0" "$([ -e "$T/.agents/skills/rodo/new-playbook.md" ] && echo 1 || echo 0) $([ -e "$T/.agents/skills/rodo/testing.md" ] && echo 1 || echo 0)"
check "  ...records the version" "9.9.9" "$(cat "$T/rodo/.kit-version")"
check "  ...leaves rodo/, AGENTS.md, CLAUDE.md untouched" "same" "$([ "$before" = "$(sum)" ] && echo same || echo changed)"
check "  ...shows migration notes" 1 "$(has 'MIGRATION.md')"
check "  ...installs no hooks" "" "$(cd "$T" && git config core.hooksPath)"
(cd "$NK" && git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm kit && git branch -M main)
echo '// broken' > "$T/scripts/rodo-install.cjs"
check "update via git clone (--repo file://...)" 0 "$(run node "$T/scripts/rodo-update.cjs" --root "$T" --repo "file://$NK" --ref main)"
check "  ...restored the kit file" 1 "$(grep -c 'rodo-install: adds the RODO method files' "$T/scripts/rodo-install.cjs")"
check "update without kitRepo configured stops" 2 "$(run node "$T/scripts/rodo-update.cjs" --root "$T")"

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
