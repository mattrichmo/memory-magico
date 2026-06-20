# MemoryMagico — Full Top-Down Audit, Critique, Hardening Plan

Date: 2026-06-18  
Audited artifact: `/mnt/data/memory-magico(1).zip`  
Goal: Git-based, CLI-first, Obsidian-like memory system for humans and agents, with dashboard as a read-only visualizer.

---

## 0. Executive summary

MemoryMagico has a strong product shape: Git-backed Markdown/JSONL memory, a CLI-first command surface, generated search/dashboard artifacts, role-oriented agent instructions, and a static dashboard intended to visualize trust state. The core idea is good. The current implementation is not yet safe enough for autonomous or semi-autonomous agent use.

The highest-risk class of bugs is **command-boundary trust**: several commands accept IDs, flags, paths, or source types and then use them as if they are already safe. In my local probes, arbitrary path traversal through record IDs was possible, including a write path that modified `package.json`. The second highest-risk issue is **machine-readable output integrity**: `--json` currently does not reliably guarantee valid JSON output, which is dangerous because agents will treat `--json` as a contract.

The dashboard should stay intentionally read-only for now. The CLI is the meat and bones. The dashboard should visualize the current memory repo, search/index state, relationships, and Git state. It should not create a second browser-local memory model.

---

## 1. What I verified

From the uploaded project zip, I verified:

```bash
find src bin scripts tests -name '*.mjs' -print0 | xargs -0 -n1 node --check
npm test
```

Result:

```text
syntax checks: pass
node --test: 15 passing
```

Existing tests already cover several useful hardening primitives:

- command registry exposure
- BOM-tolerant JSON parsing
- memory path helper traversal rejection
- selected JSON command output parseability
- role install selection
- image binary detection ordering
- strict JSONL malformed-row failure
- frontmatter round-trip for arrays of objects
- search index freshness including work pages

Those tests are useful, but they do not yet cover the most dangerous command-boundary bugs.

---

## 2. P0 findings — fix before calling this agent-safe

### P0.1 — Root CLI launcher and packaged executable contract are still brittle

The uploaded zip still has no root `./mm` launcher. `bin/mm.mjs` is present, but its file mode is `644`, not executable. `package.json` declares the binary entrypoint, so `mm` can work after `npm link`, but source-first usage fails unless users know to run `node bin/mm.mjs`.

Observed:

```bash
./mm dashboard
# no root ./mm file

node bin/mm.mjs dashboard
# actual source-first entrypoint
```

Impact:

- First-run UX breaks immediately.
- Docs that say `./mm` or `mm` will feel unreliable.
- Agent instructions that assume `mm` exists will fail silently or branch into bad recovery behavior.

Recommended hardening:

- Add root `./mm` shell launcher.
- Make `bin/mm.mjs` executable.
- Add package scripts for `mm`, `dashboard`, `dashboard:build`, `dashboard:serve`, `setup`.
- Include `dashboard/`, `memory/`, and root `mm` in package `files`.
- Add a `setup` command that prints the exact local and global invocation options.

Test:

```bash
test -x ./mm
./mm doctor --json | jq .ok
node bin/mm.mjs doctor --json | jq .ok
npm pack --dry-run --json | jq '.[0].files[].path' | grep 'dashboard/index.html'
```

---

### P0.2 — `--json` is not a trustworthy machine contract

The project has a stdout guard, but the guard currently lets non-JSON text through. The issue is that invalid JSON is parsed with a fallback that returns `null`, and the guard checks `!== undefined`, so nearly every non-empty string is treated as JSON.

Probe:

```bash
node --input-type=module - <<'NODE'
import { withJsonStdoutGuard } from './src/core/stdout-guard.mjs';
await withJsonStdoutGuard(async () => {
  console.log('hello');
  console.log('{"ok":true}');
});
NODE
```

Observed stdout:

```text
hello
{"ok":true}
```

Also:

```bash
node bin/mm.mjs info --json
```

returns human text on stdout and exit code 0.

Impact:

- Agents using `--json` can parse garbage or silently make decisions from human text.
- CI scripts cannot trust stdout.
- The command registry’s `supportsJson` metadata is not enforced.

Recommended hardening:

- Router must reject `--json` for commands that do not declare `supportsJson: true`.
- Every `--json` response should use one envelope:

```json
{
  "ok": true,
  "data": {},
  "warnings": []
}
```

or:

```json
{
  "ok": false,
  "error": {
    "code": "UNSUPPORTED_JSON_OUTPUT",
    "message": "..."
  },
  "warnings": []
}
```

- Stdout guard should validate JSON with a sentinel fallback that cannot be confused with valid parse output.
- In JSON mode, all warnings, logs, progress bars, and human output must go to stderr.

Tests:

```bash
mm info --json >out 2>err; test $? -ne 0; jq .ok out
mm task --json >out 2>err; test $? -ne 0; jq .error.code out
node tests/json-contract.test.mjs
```

Add a test that monkey-patches a command to `console.log('oops')` in JSON mode and ensures stdout still contains one valid JSON envelope only.

---

### P0.3 — Record ID path traversal leaks arbitrary JSON files

Several `show` commands use record IDs to construct file paths without validating the ID as a safe segment. I probed these commands:

```bash
for cmd in task sprint phase issue discovery initiative comment container; do
  node bin/mm.mjs $cmd show '../../../package' | head -1
done
```

Every one began printing the root `package.json` as if it were a memory record.

Impact:

- Any command that treats IDs as file segments can read outside its intended directory.
- Dashboard/API endpoints that call the same resolver can leak repo files.
- Agent-provided IDs become path gadgets.

Recommended hardening:

- Every ID must match a strict pattern before direct lookup.
- Direct lookup should use `safeJoin` / `resolveContainedPath` and reject traversal.
- Consider resolving IDs through an index map first, never by directly joining raw user input.
- Add command-boundary validation helpers:

```text
assertSafeId(id)
assertKnownKind(kind)
assertSafePathSegment(segment)
assertAllowedEnum(value, enum)
```

Tests:

```bash
for cmd in task sprint phase issue discovery initiative comment container; do
  mm $cmd show '../../../package' >/tmp/out 2>/tmp/err
  test $? -ne 0
  ! grep -q '"name": "memorymagico"' /tmp/out
  jq .error.code /tmp/out # when --json
 done
```

---

### P0.4 — Record ID traversal also enables writes

In a temp copy, this command modified `package.json`:

```bash
node bin/mm.mjs container update '../../../package' owned
```

Observed result:

```text
Updated container: ../../../package
```

`package.json` gained fields such as:

```json
{
  "status": "owned",
  "updatedAt": "2026-06-18T..."
}
```

Impact:

- This is a direct arbitrary JSON overwrite primitive within the repo.
- It can corrupt package metadata, generated artifacts, configs, or any traversable JSON file.
- It undermines Git-trusted review because the mutation is presented as a valid MemoryMagico command.

Recommended hardening:

- Fix P0.3 first.
- All write commands must validate entity IDs before reading current records.
- Persist functions must not trust existing `record.paths` blindly unless paths were previously validated and normalized.
- Add a global mutation guard: `beforeWrite({ command, targetKind, targetId, expectedDir })`.

Tests:

```bash
cp -R . /tmp/mm-write-probe
cd /tmp/mm-write-probe
before=$(sha256sum package.json)
mm container update '../../../package' owned && exit 1
sha256sum -c <<< "$before"
```

---

### P0.5 — `mm lint` misses JSON work records

I created a malformed JSON file under `memory/work/tasks`:

```bash
printf '{bad json}\n' > memory/work/tasks/bad.json
node bin/mm.mjs lint --json
```

Observed:

```json
{
  "findings": [],
  "ok": true,
  "summary": {
    "errors": 0,
    "warnings": 0
  }
}
```

Impact:

- JSON-only work records can be corrupt while lint reports clean.
- Agents and dashboard endpoints can disagree about repo health.
- This weakens `mm lint` as a trust gate.

Recommended hardening:

- Lint every canonical storage format:
  - `memory/work/**/*.md`
  - `memory/work/**/*.json`
  - `memory/inbox/*.jsonl`
  - `memory/issues/relationships.jsonl`
  - generated manifests
  - agent role files
- Add duplicate ID detection across all storage forms.
- Add schema validation for JSON records, not just Markdown frontmatter.

Tests:

```bash
printf '{bad json}\n' > memory/work/tasks/bad.json
mm lint --json | jq '.ok == false'
```

---

### P0.6 — Title updates create duplicate Markdown mirrors and lint does not catch it

`mirrorRecordToMarkdown()` writes a Markdown file based on a slug of the current title. Updating a task title creates a new Markdown file instead of updating the existing mirror.

Probe:

```bash
node bin/mm.mjs task update task_mqiarfrs_uggdg9 todo --title 'Renamed Smoke Task'
ls memory/work/tasks/*.md
```

Observed:

```text
renamed-smoke-task.md
smoke-task.md
```

Both represent the same task ID. `mm lint --json` still reports 0 errors.

Impact:

- Duplicate canonical-looking records.
- Search, dashboard, and Git history drift.
- Obsidian-like browsing becomes misleading because old mirrors remain alive.

Recommended hardening:

- Stable file path must be derived from ID, not mutable title, or stored once in `paths.self` and never recomputed from title.
- If title changes, update frontmatter/body in the same file.
- Lint must detect duplicate IDs across Markdown, JSON, generated indexes, and JSONL.

Tests:

```bash
before=$(find memory/work/tasks -name '*.md' | wc -l)
mm task update task_x todo --title 'New Title'
after=$(find memory/work/tasks -name '*.md' | wc -l)
test "$before" = "$after"
mm lint --json | jq '.findings[] | select(.code == "DUPLICATE_ID")'
```

---

## 3. P1 findings — high-priority hardening

### P1.1 — Dashboard server and dashboard app are contract-misaligned

The dashboard should consume `GET /api/dashboard` as source of truth and render the MemoryMagico snapshot shape `{ generatedAt, summary, focus, indices }`. The previous truth-based spec already identifies the static dashboard as a visual cockpit, not the mutation layer.

Current issue:

- The static dashboard expects richer optional endpoints.
- Current `dashboard.mjs` exposes only `/api/dashboard` in the uploaded project.
- The UI therefore cannot fully inspect issues, raw items, discoveries, wiki pages, Git status, graph details, or entity right-rail detail without fallback behavior.

Recommended read-only endpoints:

```http
GET /api/dashboard
GET /api/search
GET /api/resolve
GET /api/entity/:kind/:id
GET /api/issues
GET /api/raw
GET /api/discoveries
GET /api/wiki
GET /api/graph
GET /api/graph?node=<id>
GET /api/git/status
GET /api/git/log?path=<path>
GET /api/git/diff?path=<path>
GET /api/health
```

Keep all of these read-only initially.

Tests:

- Start `mm dashboard serve --host 127.0.0.1 --port 4317 --no-open`.
- Fetch each endpoint.
- Validate JSON envelope shape.
- Verify unsafe path/id query values are rejected.
- Verify dashboard still loads if optional endpoints fail.

---

### P1.2 — Dashboard static file containment check should use `path.relative()`

The server uses a `startsWith` containment check on normalized paths. This is weaker than checking `path.relative(root, target)`.

Recommended:

```text
relative = path.relative(root, target)
reject if relative startsWith('..') or path.isAbsolute(relative)
```

Also:

- Default bind must stay `127.0.0.1`.
- Serving on `0.0.0.0` should print a prominent warning.
- Write mode should not exist until server-side mutation contracts are implemented.

Tests:

```bash
mkdir ../dashboard_secret
echo secret > ../dashboard_secret/secret.txt
curl 'http://127.0.0.1:4317/../dashboard_secret/secret.txt'
# must return 403/404, never secret
```

---

### P1.3 — Many mutating commands are not protected by a repo-level lock

I found lock usage in some commands, but not consistently across mutators. Commands like task, issue, sprint, phase, graph, claim, discovery, comment, initiative, and container workflows need a consistent mutation lock.

Impact:

- Two agents can overwrite each other.
- Markdown mirror, JSON index, JSONL history, and search index can drift.
- Partial writes can leave the repo in a state where lint passes but the dashboard lies.

Recommended:

- All mutations go through `withMutationLock(commandName, targetIds, fn)`.
- Every mutation writes an append-only mutation ledger entry.
- Every mutation should have a dry-run mode eventually.
- Add lock management commands:

```bash
mm lock list
mm lock inspect <name>
mm lock break <name> --stale-only
```

Tests:

- Launch two concurrent `mm task update` operations against the same ID.
- Assert no history loss, no duplicate mirrors, no partial index write.
- Simulate stale lock file and ensure stale-only break works.

---

### P1.4 — Graph rebuild churns IDs and is not atomic enough

Graph rebuild should be Git-stable. Relationship IDs should not change if the semantic relationship has not changed.

Current risk:

- Generated relationship IDs can change every rebuild.
- This creates noisy Git diffs and destroys the value of Git review.
- Relationship JSONL writes should be locked and atomic.

Recommended:

- Deterministic relationship ID:

```text
rel_<hash(fromId + type + toId)>
```

- Sort relationships by `fromId`, `type`, `toId`.
- Atomic write JSONL.
- Validate all relationship endpoints exist.
- Detect cycles for dependency/blocking edges where cycles are invalid.

Tests:

```bash
mm graph rebuild
cp memory/issues/relationships.jsonl /tmp/a
mm graph rebuild
cmp memory/issues/relationships.jsonl /tmp/a
```

---

### P1.5 — Raw intake accepts invalid source types after writing

Probe:

```bash
echo hello >/tmp/extnote.txt
node bin/mm.mjs add /tmp/extnote.txt --source-type banana
```

This wrote an invalid raw item. Lint caught it later, but the command boundary should reject it before mutation.

Recommended:

- Validate `--source-type` against schema enum before write.
- Reject unknown flags and invalid enum values in every command.
- Add `mm raw repair` only for historical cleanup, not normal flow.

Tests:

```bash
before=$(wc -l < memory/inbox/raw-items.jsonl)
mm add /tmp/extnote.txt --source-type banana && exit 1
after=$(wc -l < memory/inbox/raw-items.jsonl)
test "$before" = "$after"
```

---

### P1.6 — Large-file and image handling need hard caps

`mm add` can copy arbitrary files into raw intake. `mm image encode` reads the entire file into memory before spooling/capping the result.

Recommended defaults:

```bash
mm add <file> --max-bytes 25000000
mm add <file> --allow-large
mm image encode <path> --max-bytes 262144
mm image encode <path> --allow-large
```

Record on ingest:

```text
byteSize
contentHash
mediaType
originalFilename
sourceRef
createdAt
```

For images:

- Magic-byte detection first.
- Refuse non-image unless `--force`.
- Never base64 huge files to stdout.
- Always spool large outputs to `memory/.mm/results` with a capped preview.

Tests:

- 1 KB image encodes normally.
- 20 MB image is refused without `--allow-large`.
- Non-image with `.png` extension is refused.
- Large result writes to result file, not stdout.

---

### P1.7 — `mm read --offset` is misleading on large files

`readTextRange()` reads the first `maxBytes`, then applies line offset. That means `--offset` cannot reach lines beyond the initial byte window.

Recommended:

- Rename semantics in help: byte-bounded preview.
- Add streaming line reader for real random-access line windows.
- JSON result should include:

```json
{
  "truncatedByBytes": true,
  "offsetAppliedAfterByteLimit": true
}
```

Tests:

- Create a large file with 100k lines.
- `mm read file --offset 90000 --lines 5` should either return correct lines via streaming or warn explicitly.

---

### P1.8 — Search/index storage will get heavy

The local hybrid search design is good. The current index stores 2048-dimension vectors per chunk, which will grow quickly for an Obsidian-like repo.

Recommended optimizations:

- Store sparse hashed vectors rather than full dense arrays.
- Store weights as compact pairs: `[index, weight]`.
- Keep lexical postings separate from semantic vector data.
- Incrementally rebuild changed pages instead of full rebuilds.
- Track index freshness for every indexed source class, not just Markdown.
- Search once for fuzzy fallback; avoid loops that call search for every page.

Tests:

- Generate 1,000 wiki pages and 10,000 chunks.
- Measure index build time, index size, and search latency.
- Assert repeated search stays below a target latency.

---

## 4. Schema hardening recommendations

The schemas should become the contract that agents cannot bypass.

### 4.1 Make kind/status/type fields strict

For every schema:

```json
{
  "kind": { "const": "task" },
  "status": { "enum": ["todo", "in_progress", "blocked", "done", "cancelled"] }
}
```

Apply corresponding enums:

```text
sprint: planned, active, paused, completed, cancelled
phase: planned, active, paused, completed, cancelled
task: todo, in_progress, blocked, done, cancelled
issue: draft, ready_for_agent, in_progress, needs_review, needs_verification, verified, closed, deferred, blocked
raw: unreconciled, processing, processed, rejected, duplicate, archived
severity: P0, P1, P2, P3, P4
confidence: confirmed, likely, hypothesis, needs_reproduction
```

### 4.2 Require verification evidence shape

Tasks marked `done` or issues marked `verified` should require evidence.

Recommended evidence schema:

```json
{
  "id": "evidence_...",
  "type": "test|lint|build|manual_review|git_diff|screenshot|agent_run",
  "summary": "string",
  "result": "pass|fail|unknown",
  "command": "optional string",
  "path": "optional safe path",
  "createdAt": "date-time"
}
```

Guard rules:

- `task.status = done` requires at least one evidence item.
- `issue.status = verified` requires verification evidence.
- `bug fixed` is not the same as `bug verified`.

### 4.3 Lock down relationship shape

Use one relationship schema everywhere:

```text
belongs_to
contains
derived_from
promoted_from
folded_into
duplicates
blocks
blocked_by
related_to
updates_memory
documents
references
contradicts
supersedes
depends_on
implemented_by
verified_by
```

Validation rules:

- `fromId` and `toId` must exist unless explicitly external.
- `blocks` should imply reverse `blocked_by` or be normalized into one canonical edge.
- No self-edge except explicitly allowed types.
- No dependency cycles for `depends_on`.
- Duplicate edge should fail lint.

### 4.4 Adopt `additionalProperties: false` gradually

For each record type:

- Start with strict core fields.
- Add a namespaced extension object for custom fields:

```json
{
  "extensions": {
    "x-user": {}
  }
}
```

This prevents typo fields from becoming silent memory.

### 4.5 Strengthen the schema validator or restrict schema subset

The custom validator should either support the JSON Schema features you use, or schemas should avoid unsupported keywords. Add tests for every keyword used.

Suggested supported subset:

```text
type
required
properties
additionalProperties
items
enum
const
pattern
format date-time
minLength
maxLength
minItems
uniqueItems
oneOf / anyOf, if needed
```

---

## 5. CLI feature recommendations

### 5.1 Core trust commands

```bash
mm status --json
```

One-command truth summary:

```text
branch
dirty files
index ready/stale
lint ok/fail
raw unresolved
open issues
blocked tasks
active sprint
last dashboard build
```

```bash
mm safe --json
```

Agent preflight:

```text
doctor
lint
index status
graph validate
git status
generated-file drift check
unsupported --json check
```

```bash
mm audit --json
```

Runs hardening probes:

```text
path traversal IDs
invalid enum rejection
JSON stdout integrity
dashboard endpoint health
large-file guardrails
schema drift
relationship integrity
secret scan
prompt-injection markers
```

### 5.2 Obsidian-like commands, but CLI-first

```bash
mm capture "note text"
mm capture --stdin
mm capture ./file.md
mm open <id>
mm backlinks <id>
mm links <id>
mm graph neighborhood <id> --json
mm graph orphans
mm graph contradictions
mm tags list
mm tags show <tag>
mm tags rename <old> <new>
```

### 5.3 Git-native commands

```bash
mm git status --json
mm git diff --memory
mm git affected
mm git log <id>
mm git commit-message
mm snapshot create
mm snapshot list
mm snapshot restore <id>
```

Keep these read-only or dry-run by default, except snapshot creation.

### 5.4 Work-management commands

Every read/list/show command needs JSON:

```bash
mm sprint list --json
mm sprint show <id> --json
mm phase list --json
mm task list --json
mm task show <id> --json
mm issue list --json
mm issue show <id> --json
mm discovery list --json
mm raw list --json
mm wiki list --json
```

Add filters:

```bash
mm task list --status blocked --sprint active --json
mm issue list --type bug --severity P0 --json
mm raw list --status unreconciled --json
```

### 5.5 Repair and migration commands

```bash
mm fsck
mm repair duplicate-ids
mm repair paths
mm repair indexes
mm migrate list
mm migrate run <version>
mm doctor --fix
```

---

## 6. Dashboard critique and direction

The dashboard should remain a tight visualizer in the style you showed: compact dark cockpit, left navigation, main list, persistent right rail, trust dots, and no glossy “AI dashboard” ornamentation.

The dashboard should not mutate memory locally. Production mutation should eventually be:

```text
UI action
  -> dry-run mutation request
  -> safe server-side mutation runner
  -> repo lock
  -> write through core CLI logic
  -> validate schemas/lint
  -> mark/rebuild index
  -> show Git diff
```

Until then, dashboard actions should copy CLI commands.

Right rail should be backed by:

```http
GET /api/entity/:kind/:id
```

and include:

```text
object summary
status
path
parent sprint/phase
relationships
verification evidence
Git state
index state
copyable CLI commands
raw JSON
```

The dashboard should show trust state, not just memory contents:

```text
source
status
freshness
verification
relationships
Git history
next action
```

---

## 7. Test plan

### 7.1 P0 test suite

| Area | Test | Expected |
|---|---|---|
| Local CLI | `test -x ./mm` | executable exists |
| Global CLI | `npm link && mm doctor --json` | valid JSON, ok true |
| JSON mode | `mm info --json` if unsupported | non-zero JSON error |
| JSON guard | command logs human text in JSON mode | not on stdout |
| ID traversal read | `mm task show ../../../package` | non-zero, no package leak |
| ID traversal write | `mm container update ../../../package owned` | non-zero, package unchanged |
| Work JSON lint | malformed `memory/work/tasks/bad.json` | lint fails |
| Duplicate IDs | duplicate md records | lint fails |
| Title update | change task title | no new md file |
| Invalid enum | `mm add --source-type banana` | rejected before write |
| Static serve traversal | `../dashboard_secret` URL | forbidden |
| Package contents | `npm pack --dry-run` | includes dashboard/root launcher |

### 7.2 P1 test suite

- All schemas reject invalid statuses.
- Done tasks without evidence fail strict lint.
- Verified issues without evidence fail strict lint.
- Relationship edges with missing nodes fail graph validation.
- Relationship rebuild is deterministic.
- Search index status changes after wiki/work edit.
- Raw JSONL malformed row fails lint.
- Large files are refused unless `--allow-large`.
- Image encode refuses oversized files before full read.
- Dashboard endpoint output conforms to contracts.
- Dashboard renders unsafe titles as text, not HTML.
- Dashboard does not expose fixture data unless `?fixture=1`.
- Read-only commands do not modify generated files.

### 7.3 Concurrency tests

- Two task updates to same ID preserve both history events or one fails with lock error.
- Graph rebuild and task update cannot interleave into partial relationship data.
- Index rebuild during write either waits or fails cleanly.

### 7.4 Property/fuzz tests

Fuzz these inputs:

```text
IDs
paths
titles
tags
source types
relationship types
JSONL rows
frontmatter values
search queries
dashboard query params
```

Properties:

- no traversal outside memory root
- no non-JSON stdout in JSON mode
- no successful mutation with invalid enum
- no generated duplicate IDs
- no XSS in dashboard render

---

## 8. Optimization plan

### 8.1 Search/index

- Move from dense 2048 arrays to sparse vector storage.
- Incrementally rebuild only changed pages.
- Keep a manifest per indexed source root.
- Cache parsed frontmatter and headings.
- Avoid repeated full search calls inside entity resolution loops.

### 8.2 Git

- Cache Git status for dashboard polling with short TTL.
- Use path-scoped Git log/diff only when the right rail asks for it.
- Show dirty generated files separately from authored memory files.
- Add generated-file drift detection.

### 8.3 Storage

- Use stable ID-derived file paths.
- Keep title as metadata, not path identity.
- Normalize all `paths.self` values relative to `memoryRoot`.
- Make generated files deterministic and sorted.
- Consider SQLite only after JSON/Markdown/JSONL contracts are hardened; do not prematurely replace the Git-readable storage model.

### 8.4 Dashboard

- Lazy-load detail endpoints.
- Poll `/api/health` more often than heavy endpoints.
- Render large raw previews capped.
- Use URL-addressable selection.
- Keep dashboard static and dependency-free.

---

## 9. Recommended sprint plan

### Sprint 1 — Command-boundary safety

1. Fix root launcher/package executable contract.
2. Enforce `--json` support metadata.
3. Fix stdout JSON guard.
4. Validate IDs before direct record lookup.
5. Block traversal write paths.
6. Make lint include JSON work records.
7. Detect duplicate IDs.
8. Fix title-update duplicate mirrors.
9. Add tests for all P0 items.

### Sprint 2 — Schema and graph trust

1. Add status/type enums to schemas.
2. Add evidence schema.
3. Add relationship schema validation and graph validation.
4. Make graph rebuild deterministic.
5. Add `mm graph validate`, `mm backlinks`, `mm links`, `mm graph neighborhood`.
6. Add strict lint mode.

### Sprint 3 — Obsidian-like CLI experience

1. Add `mm status --json`.
2. Add `mm safe --json`.
3. Add `mm capture`.
4. Add `mm open`.
5. Add `mm tags` commands.
6. Add templates.
7. Add JSON output to all read/list/show work commands.

### Sprint 4 — Dashboard usefulness without mutation

1. Add read-only API endpoints.
2. Add `GET /api/entity/:kind/:id`.
3. Add right rail detail from canonical entity endpoint.
4. Add Git review endpoint visualization.
5. Add raw untrusted warnings.
6. Keep actions as copyable CLI commands.

### Sprint 5 — Agent safety and review

1. Add mutation ledger.
2. Add repo-level mutation lock to every mutating command.
3. Add `mm snapshot`.
4. Add `mm audit` hardening command.
5. Add prompt-injection warnings to raw/context surfaces.
6. Add agent role command-contract validation.

---

## 10. Product critique

The winning positioning is not “another dashboard.” It is:

```text
A Git-based agentic memory harness: Markdown where humans read, JSONL where machines append, generated indexes where agents search, and Git where trust is reviewed.
```

Keep the dashboard as a visual cockpit. The CLI is the source of truth, mutation surface, test surface, and agent contract.

The project becomes genuinely stronger than Obsidian when it has:

- typed links, not just wiki links
- schema-validated tasks/issues/discoveries
- provenance from raw input to durable memory
- verification evidence
- Git-native review
- machine-readable command contracts
- agent-safe command boundaries
- local hybrid search

The current codebase is close enough to be worth hardening. But the P0 command-boundary bugs need to be fixed before any serious agent workflow relies on it.
