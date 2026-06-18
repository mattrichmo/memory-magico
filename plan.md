# MemoryMagico Agentic CLI Hardening Plan — Deep Implementation Brief

> **Purpose:** turn MemoryMagico into a safer, more agent-friendly Markdown-first memory CLI without copying a full Claude Code-style harness.  
> **Primary goal:** keep MemoryMagico small and local, but give it serious boundary discipline: safe paths, safe stdout, bounded reads, atomic writes, frontmatter hygiene, manifest-first recall, media intake, and test-proven failure handling.
>
> **Non-negotiable implementation rule:** no helper module counts as done until:
>
> 1. at least one existing command is wired through it,
> 2. at least one regression test proves it blocks a real failure mode,
> 3. JSON-mode stdout remains parseable,
> 4. the command registry documents the behavior,
> 5. the behavior is visible through `mm help`, `mm commands --json`, or a relevant lint/check command.
>
> The point is not to create a pile of unused safety utilities. The point is to force risky MemoryMagico flows through shared, tested, boring primitives.

---

## 0. Current Truth and Scope

MemoryMagico already has a meaningful base. This hardening plan assumes these parts exist and should be improved rather than rebuilt blindly:

- `src/core/frontmatter.mjs` parses/writes Markdown page frontmatter.
- `src/core/pages.mjs` scans pages and chunks content.
- `src/core/retrieval.mjs` builds local search/retrieval indexes.
- `src/core/workspace.mjs` creates the workspace scaffold.
- `src/commands/help.mjs`, `src/commands/raw.mjs`, and `src/commands/install.mjs` already expose important CLI surfaces.
- `memory/AGENTS.md` defines top-level routing/agent behavior.
- The system is intended to remain Markdown-first, with JSON/JSONL used for indexes, ledgers, generated artifacts, and command-machine output.

### Hardening principles

1. **Markdown/YAML remains canonical.** Generated JSON indexes are rebuildable caches unless explicitly declared as ledgers.
2. **Raw sources are immutable.** Never destructively sanitize or rewrite raw source files.
3. **LLM commands must be surgical.** The CLI should retrieve, inspect, and edit precise memory surfaces without front-loading the whole workspace.
4. **Write commands must be boring and guarded.** Path safety, locks, atomic writes, cleanup, and validation should be shared primitives.
5. **Machine output must be machine-safe.** `--json` means stdout is valid JSON and nothing else.
6. **No fake hardening.** A module existing is not enough. It must be integrated into commands and regression-tested.

---

## Phase 0 — Baseline Audit and Integration Map

### Goal

Before writing hardening code, produce an exact map of current commands, risks, read/write paths, JSON behavior, and integration points. This prevents helper modules from being built in isolation and never wired into the CLI.

### Deliverables

- `docs/internal/agentic-hardening-command-map.md`
- `docs/internal/agentic-hardening-risk-register.md`
- `src/core/command-contract-types.mjs` or equivalent type/comment contract
- A temporary or initial `mm commands --json` prototype if command discovery already exists

### Tasks

#### 0.1 Inventory every command

List every command exposed by `bin/mm.mjs`, `src/commands/*.mjs`, aliases, and nested subcommands.

For each command, document:

```text
command
aliases
category
reads files?
writes files?
deletes/moves files?
writes ledgers?
writes generated artifacts?
emits JSON?
can output large results?
can run long?
needs index?
needs fresh index?
can accept human refs?
can accept paths?
can accept external source files?
can be destructive?
should require lock?
should require confirmation?
```

#### 0.2 Build the command integration matrix

Create a table like:

```md
| Command | Read paths | Write paths | JSON | Large output | Lock | Path policy | Needs range reader | Notes |
|---|---|---|---|---|---|---|---|---|
| `mm raw add` | external source, memory raw | memory/raw, raw ledger | yes | maybe | write | external-read + memory-write | yes | must never delete source |
| `mm raw show` | memory raw | none | yes | yes | no | memory-read | yes | binary detection needed |
| `mm wiki create` | none | memory/wiki | yes | no | write | memory-write | no | frontmatter write guard |
| `mm search` | index, wiki chunks | none | yes | yes | no | generated-read + memory-read | maybe | result spool |
| `mm index rebuild` | wiki/work/raw metadata | memory/.mm/search | yes | maybe | index-write | generated-write | yes | atomic swap |
```

#### 0.3 Identify direct unsafe primitives

Search the codebase for direct use of:

```text
console.log
process.stdout.write
fs.writeFile
fs.writeFileSync
fs.appendFile
fs.appendFileSync
fs.rename
fs.rm
fs.unlink
fs.mkdir
path.join
path.resolve
JSON.parse
JSON.stringify
readFile
readFileSync
readdir
realpath
process.cwd()
```

For each occurrence, classify it as:

```text
safe existing use
must be wrapped
must be removed
needs test coverage
```

#### 0.4 Establish baseline failing tests

Before implementing the fix, create tests that currently fail or document expected failures for:

```text
--json pollution
path traversal write
symlink write
malformed JSONL
huge file read
bad frontmatter
invisible Unicode in title
large result overflow
concurrent write
interrupted index rebuild
```

These are the regression targets for later phases.

### Acceptance gates

- The command integration matrix exists.
- Every command has a risk classification.
- Every later phase references the exact commands it must change.
- The plan identifies at least one existing command integration point for each new helper.
- No hardening helper is started without a known command consumer.

---

## Phase 1 — Command Registry, Router, and Machine Output Discipline

### Goal

Make every CLI command explicit, introspectable, and safe for agent automation. Replace hand-maintained command/help behavior with a central command contract registry. Enforce valid JSON stdout for machine modes.

### Deliverables

- `src/core/command-registry.mjs`
- `src/core/command-result.mjs`
- `src/core/renderers.mjs`
- `src/core/stdout-guard.mjs`
- `src/core/errors.mjs`
- Updated `bin/mm.mjs`
- Updated `src/commands/help.mjs`
- New `src/commands/commands.mjs`
- Tests for command registry and JSON stdout discipline

### Command metadata contract

Every command must register metadata:

```js
{
  name: "search",
  aliases: ["find"],
  category: "read",
  summary: "Search MemoryMagico wiki/work records.",
  description: "Runs local hybrid retrieval over the generated search index.",
  readOnly: true,
  destructive: false,
  concurrencySafe: true,
  supportsJson: true,
  supportsExplain: true,
  requiresUserInteraction: false,
  requiresFreshIndex: true,
  acceptsHumanRef: false,
  acceptsPaths: false,
  maxResultSizeChars: 20000,
  examples: [
    'mm search "sprint 28" --json',
    'mm search "radar moisture" --mode hybrid --explain'
  ]
}
```

Required metadata fields:

```text
name
aliases
category
summary
readOnly
destructive
concurrencySafe
supportsJson
supportsExplain
requiresUserInteraction
requiresFreshIndex
acceptsHumanRef
acceptsPaths
maxResultSizeChars
examples
```

### Standard command result shape

All command handlers should return a `CommandResult` instead of printing from deep logic.

Human mode:

```js
{
  ok: true,
  format: "human",
  title: "Search results",
  data: {...},
  warnings: [],
  render: "..."
}
```

JSON mode:

```js
{
  ok: true,
  data: {...},
  warnings: [],
  meta: {
    command: "search",
    durationMs: 42
  }
}
```

Error mode:

```js
{
  ok: false,
  error: {
    code: "AMBIGUOUS_REFERENCE",
    message: "Could not resolve 'sprint 28' uniquely.",
    details: {...},
    candidates: [...]
  },
  warnings: []
}
```

### Tasks

#### 1.1 Build the registry

- Create `src/core/command-registry.mjs`.
- Register every existing command.
- Include subcommand metadata where relevant.
- Ensure aliases route through the registry, not custom ad hoc router branches.
- If `src/commands/index.mjs` exists but is unused, either wire it in properly or delete the dead router path.

#### 1.2 Replace ad hoc help

- Generate `mm help` from registry metadata.
- Add `mm help <command>`.
- Add `mm commands`.
- Add `mm commands --json`.

Example JSON:

```json
{
  "ok": true,
  "commands": [
    {
      "name": "search",
      "aliases": ["find"],
      "category": "read",
      "readOnly": true,
      "destructive": false,
      "supportsJson": true
    }
  ]
}
```

#### 1.3 Add stdout/stderr policy

Rules:

```text
human output -> stdout
JSON output -> stdout only valid JSON
stream JSON/NDJSON -> stdout only valid JSON lines
warnings -> stderr
debug -> stderr
errors in human mode -> stderr + non-zero exit
errors in JSON mode -> stdout JSON error object + non-zero exit
```

No command should write accidental debug text to stdout in JSON mode.

#### 1.4 Install JSON stdout guard

- Create `src/core/stdout-guard.mjs`.
- In `--json` mode, guard `process.stdout.write`.
- If a non-JSON write is attempted by accidental logging, route it to stderr or buffer it as a warning.
- Restore stdout on exit, error, and SIGINT.

Guard behavior should support:

```text
single JSON object mode
NDJSON mode later
human mode no guard
```

#### 1.5 Ban direct output from core modules

Core modules should not call:

```text
console.log
console.error
process.stdout.write
```

Core modules return data. Command renderers print.

Add a lint/test check that scans `src/core` for direct console output, except explicitly approved logger modules.

#### 1.6 Add stable typed errors

Create `src/core/errors.mjs`.

Core error classes:

```text
MemoryMagicoError
PathSafetyError
InvalidFrontmatterError
MalformedJsonError
MalformedJsonlError
UnsafeUnicodeError
StaleIndexError
AmbiguousReferenceError
MissingReferenceError
VerificationGateError
ResultTooLargeError
LockError
AbortError
UnsupportedMediaError
```

Each error should include:

```text
code
message
details
hint
exitCode
```

### Commands to integrate in this phase

At minimum:

```text
mm help
mm commands
mm search --json
mm context --json
mm index status --json
mm raw list --json
mm lint --json
mm doctor --json
```

### Negative tests

- A command in `--json` mode accidentally calls `console.log("debug")`; stdout still parses as JSON.
- Every `--json` command can be executed and `JSON.parse(stdout)` succeeds.
- `mm commands --json` includes every registered command.
- Unknown command returns stable error.
- Ambiguous alias returns stable error.
- Help text is generated from registry, not stale hardcoded lists.

### Acceptance gates

- Every command is registered.
- No command can be routed unless registered.
- `mm commands --json` works.
- `mm help` and `mm help <command>` are generated from registry.
- Every `--json` output path returns parseable JSON.
- Debug/warnings never corrupt JSON stdout.
- Core modules do not print directly.

---

## Phase 2 — Safe Paths and Access Policies

### Goal

Prevent reads/writes from escaping the repo or memory workspace, while still allowing controlled raw-source imports from external paths. Make path safety a shared primitive used by every command that reads or writes files.

### Deliverables

- `src/core/safe-path.mjs`
- `src/core/path-policies.mjs`
- `mm lint paths`
- Tests for traversal, symlink, encoded paths, Unicode normalization, prefix attacks, Windows-style paths, and external raw intake

### Path policies

Define explicit policies instead of one vague helper:

```text
memory-read:
  read allowed only under memory root

memory-write:
  write allowed only under memory root
  symlink write refused by default

repo-read:
  read allowed under repo root

repo-write:
  write allowed under repo root only for install/scaffold/config flows

generated-read:
  read allowed under memory/.mm

generated-write:
  write allowed only under memory/.mm
  must use atomic writes

external-source-read:
  read allowed outside repo only for explicit raw import commands
  never delete source by default
  must record original source path metadata carefully

asset-write:
  write allowed only under memory/raw/assets or configured raw asset root

temp-write:
  write allowed only under memory/.mm/tmp
```

### Safe path API

Create functions:

```js
normalizeUserPath(input)
rejectNullBytes(input)
rejectEncodedTraversal(input)
rejectBackslashTraversal(input)
normalizeUnicodeForPath(input)
validateRelativeKey(input)
resolveRepoPath(repoRoot, input, policy)
resolveMemoryPath(memoryRoot, input, policy)
realpathDeepestExisting(targetPath)
assertRealPathInside(rootPath, targetPath)
assertNoSymlinkWrite(targetPath)
isInsidePath(root, candidate)
```

### Required validation

Reject:

```text
null bytes
absolute paths where relative keys are expected
../ traversal
URL-encoded traversal: %2e%2e%2f
double-encoded traversal where feasible
Unicode-normalized traversal
backslash traversal where not supported
Windows drive paths in relative-key fields
UNC/network paths in relative-key fields
prefix attacks: /repo/memory2 must not count as /repo/memory
symlink writes by default
```

### Tasks

#### 2.1 Implement safe path helpers

- Use `path.resolve` only inside safe wrappers.
- Compare real paths with path-segment boundaries, not string prefixes.
- Use deepest existing ancestor for new files that do not exist yet.
- Refuse symlink writes unless a future explicit `--follow-symlink` mode exists.

#### 2.2 Define command path policies

Update the Phase 0 command matrix with final path policies for each command.

Examples:

```text
mm raw add <external-file>:
  source: external-source-read
  destination: memory-write or asset-write
  ledger: memory-write

mm wiki create:
  destination: memory-write

mm index rebuild:
  read: memory-read
  write: generated-write

mm read <memory-path>:
  read: memory-read by default
  optional --repo can enable repo-read

mm install:
  write: repo-write only for documented scaffold locations
```

#### 2.3 Wire every write command through path safety

At minimum integrate:

```text
mm raw add
mm raw add-image
mm raw process
mm wiki create
mm wiki upsert
mm frontmatter set
mm initiative create
mm sprint create
mm phase create
mm task create
mm issue create
mm index rebuild
mm install
mm doctor --fix
mm lint --fix
```

#### 2.4 Wire risky read commands through path safety

At minimum integrate:

```text
mm read
mm raw show
mm context
mm search --include-body
mm ingest
mm wiki inspect
mm lint
mm index rebuild
```

#### 2.5 Add path lint

Add:

```bash
mm lint paths
mm lint paths --json
```

Detect:

```text
wiki links resolving outside memory
frontmatter path fields with traversal
raw index paths outside expected roots
generated index paths outside memory/.mm
symlink files under writable memory areas
```

### Negative tests

- `mm wiki create ../../outside`
- `mm raw process raw_1 --target ../../../package.json`
- `mm read ../../.env`
- `mm read %2e%2e/%2e%2e/.env`
- symlink under `memory/wiki/evil.md` pointing outside memory
- writing to `/tmp/outside.md` where relative path expected
- prefix attack with sibling folder named `memory2`
- Windows-style `C:\Users\...` in relative field
- UNC-style `\\server\share` in relative field
- external raw import reads file but never deletes it

### Acceptance gates

- No write command can escape memory/repo according to its policy.
- Read commands cannot read outside their policy.
- Symlink writes fail by default.
- External raw import remains possible but controlled.
- Every risky command uses the shared safe path module.
- Path failure messages include command, input path, policy, and hint.

---

## Phase 3 — Atomic Writes, Locks, Cleanup, and Abort Safety

### Goal

Prevent memory corruption from partial writes, concurrent agent writes, interrupted index rebuilds, and temp-file leakage.

### Deliverables

- `src/core/atomic-write.mjs`
- `src/core/lock.mjs`
- `src/core/cleanup.mjs`
- `src/core/abort.mjs`
- `memory/.mm/locks/`
- `memory/.mm/tmp/`
- Tests for concurrent writes and interrupted writes

### Required write model

All writes must use one of these paths:

```text
atomicWriteText
atomicWriteJson
atomicWriteJsonlRewrite
safeAppendJsonlWithLock
writeGeneratedArtifactAtomic
```

Direct `fs.writeFile` or `fs.appendFile` in commands should be removed or justified.

### Lock types

Define lock scopes:

```text
workspace-write.lock:
  general writes to canonical memory pages/ledgers

index-rebuild.lock:
  search index rebuild and generated artifact swap

raw-ingest.lock:
  raw source copy + raw ledger append

install.lock:
  install/scaffold writes

lint-fix.lock:
  lint --fix changes
```

### Lock behavior

- Lock files live under `memory/.mm/locks`.
- Lock contains:

```json
{
  "name": "workspace-write",
  "pid": 12345,
  "createdAt": "...",
  "command": "mm wiki create",
  "cwd": "...",
  "hostname": "..."
}
```

- If lock exists and process is alive, command fails with `LOCK_HELD`.
- If lock is stale, command may recover with warning.
- Add optional `--wait` later, but default can fail fast.
- Add `mm locks list`.
- Add `mm locks clear-stale`.

### Atomic write behavior

For canonical writes:

1. Validate target path.
2. Acquire lock.
3. Write to temp file under same filesystem or `memory/.mm/tmp`.
4. Flush best effort.
5. Rename temp file into place.
6. Release lock.
7. Cleanup temp files on failure.

For generated index rebuild:

1. Acquire `index-rebuild.lock`.
2. Build into `memory/.mm/tmp/search-build-<id>/`.
3. Validate generated artifacts.
4. Atomically swap into `memory/.mm/search/`.
5. If interrupted, keep old search index intact.
6. Cleanup temp build dir.

### Abort behavior

- Handle `SIGINT` and `SIGTERM`.
- Register cleanup handlers.
- Restore stdout guards.
- Release locks.
- Delete temp files.
- Do not overwrite old index unless new index is complete.

### Commands to integrate

```text
all write commands
mm index rebuild
mm raw add
mm raw process
mm ingest
mm lint --fix
mm doctor --fix
mm install
```

### Negative tests

- Two simultaneous `mm wiki create` commands do not corrupt ledgers/indexes.
- Two simultaneous `mm index rebuild` commands serialize or one fails safely.
- Simulated write failure leaves no partial target file.
- Simulated SIGINT during index rebuild leaves previous index valid.
- Stale lock can be detected.
- Cleanup removes temp files after command failure.
- Direct command write without lock is caught by test/static scan where feasible.

### Acceptance gates

- Every write command uses locks or is explicitly read-only.
- Every canonical write is atomic.
- Index rebuild is all-or-nothing.
- Interrupted commands do not leave corrupt canonical files.
- Temp files are cleaned.
- Lock failure is legible to agents.

---

## Phase 4 — JSON, JSONL, and Ledger Safety

### Goal

Make JSON parsing, JSONL ledgers, and machine-readable output robust enough for agentic use.

### Deliverables

- `src/core/json-safe.mjs`
- `src/core/jsonl.mjs`
- `src/core/ledger.mjs`
- `src/commands/ledger.mjs`
- Tests for BOMs, malformed JSON, malformed JSONL, partial tail reads, strict/tolerant modes, and ledger repair

### JSON helpers

Implement:

```js
safeParseJson(input, options)
parseJsonOrThrow(input, options)
stringifyJsonStable(value)
readJsonFileSafe(path, options)
writeJsonFileAtomic(path, value, options)
```

Requirements:

```text
strip UTF-8 BOM
controlled error object on failure
optional schema/shape validation hook
stable key ordering where useful for generated artifacts
clear error line/column where possible
```

### JSONL helpers

Implement modes:

```text
strict:
  fail on first malformed line

tolerant:
  skip malformed lines, return warnings

tail:
  read last N bytes, tolerate partial first line, parse valid remaining lines
```

API:

```js
readJsonl(path, { mode, maxBytes, maxLines })
appendJsonl(path, record, { lock })
rewriteJsonlAtomic(path, records)
parseJsonlText(text, { mode })
```

### Ledger policy

Canonical ledgers should default to strict mode:

```text
raw index
activity log
relationship graph
work ledger
events ledger
```

Tolerant/tail modes are for inspection commands, not canonical mutation.

### Add ledger commands

```bash
mm ledger inspect <path>
mm ledger inspect <path> --tail 100
mm ledger inspect <path> --json
mm ledger repair <path> --quarantine-bad-lines
```

Repair behavior:

- Copies original to backup.
- Writes malformed lines to quarantine file.
- Rewrites valid JSONL atomically.
- Requires lock.
- Requires explicit `--yes` if destructive.

### JSON stdout integration

Every `--json` command must:

- Return through the renderer.
- Include `ok`.
- Include structured `warnings`.
- Include structured `error` on failure.
- Never write human prose to stdout.

### Negative tests

- JSON file with BOM parses.
- malformed JSON returns `MALFORMED_JSON`.
- JSONL with one bad line fails in strict mode.
- JSONL with one bad line skips in tolerant mode with warning.
- JSONL tail mode handles partial first line.
- ledger repair quarantines bad line and preserves valid lines.
- Every `--json` command stdout parses with `JSON.parse`.

### Acceptance gates

- JSON and JSONL parsing is centralized.
- Canonical ledger mutations are strict.
- Inspection can be tolerant without hiding corruption.
- Ledger repair exists and is safe.
- JSON stdout contract is enforced across commands.

---

## Phase 5 — Range-Limited Reads, Binary Detection, and `mm read`

### Goal

Ensure agents never accidentally load huge files, binary blobs, or entire raw transcripts when only a bounded slice is needed.

### Deliverables

- `src/core/read-range.mjs`
- `src/core/binary-detect.mjs`
- `src/commands/read.mjs`
- Tests for huge files, CRLF, BOM, binary files, line offsets, byte caps, truncation, and JSON output

### Range reader API

```js
readTextRange(path, {
  offsetLine,
  maxLines,
  maxBytes,
  encoding,
  stripBom,
  normalizeCrlf,
  includeMetadata,
  signal
})
```

Return:

```js
{
  path,
  offsetLine,
  linesRead,
  maxLines,
  bytesRead,
  totalBytes,
  totalLinesKnown,
  truncatedByLines,
  truncatedByBytes,
  startsAtLine,
  endsAtLine,
  content,
  mtimeMs
}
```

### Defaults

```text
default max lines: 200
default max bytes: 64 KB
context max bytes: 128 KB
raw show max bytes: 64 KB
search body preview: 2 KB per result
lint sample: configurable
```

### Binary detection

Before reading as text:

- Check for null bytes.
- Check common image/media magic bytes.
- If binary, return metadata only unless `--force-text` is passed.
- `--force-text` should still apply byte caps.

### Add `mm read`

Examples:

```bash
mm read memory/wiki/search.md
mm read memory/wiki/search.md --offset 120 --lines 80
mm read memory/raw/sources/transcript.md --max-bytes 50000
mm read memory/wiki/search.md --json
mm read memory/raw/assets/screenshot.png --binary-info
```

### Commands to integrate

```text
mm context
mm search --include-body
mm ingest
mm wiki inspect/show
mm raw show
mm lint
mm index rebuild where it samples page bodies
```

### Negative tests

- 10 MB text file is truncated.
- CRLF file line counts remain correct.
- BOM is stripped.
- binary PNG is not dumped as text.
- offset beyond EOF returns controlled empty range.
- `mm read --json` output parses.
- `mm context` cannot dump an entire huge raw source accidentally.

### Acceptance gates

- No large file is read unbounded by default.
- Commands return truncation metadata.
- Binary files are detected before text read.
- `mm read` becomes the public and internal bounded read primitive.
- Context/search/ingest use the shared reader.

---

## Phase 6 — Result Spooling and Output Budgets

### Goal

Prevent huge command results from breaking agent workflows, flooding chat context, or corrupting JSON consumers.

### Deliverables

- `src/core/result-budget.mjs`
- `src/core/result-spool.mjs`
- `memory/.mm/results/`
- `mm results list`
- `mm results show <id>`
- Tests for large human output, large JSON output, result preview, full-result recovery, and pruning

### Result budget contract

Every command metadata entry includes:

```text
maxResultSizeChars
spoolable
previewChars
```

Default examples:

```text
search: 20000
context: 30000
lint: 30000
ingest: 40000
read: 20000
```

### Spool behavior

If rendered output exceeds budget:

Human mode prints:

```text
Result exceeded 30000 characters.
Preview shown below.
Full result written to memory/.mm/results/result_20260617_143200_context.md
```

JSON mode returns:

```json
{
  "ok": true,
  "truncated": true,
  "preview": {...},
  "fullResult": {
    "id": "result_...",
    "path": "memory/.mm/results/result_20260617_143200_context.json",
    "mediaType": "application/json",
    "bytes": 182004
  },
  "warnings": [
    {
      "code": "RESULT_SPOOLED",
      "message": "Full result exceeded maxResultSizeChars and was written to disk."
    }
  ]
}
```

### Result metadata

Each spooled result gets a sidecar:

```json
{
  "id": "result_...",
  "command": "context",
  "args": ["sprint 28", "--deep"],
  "createdAt": "...",
  "format": "json",
  "path": "memory/.mm/results/result_....json",
  "previewPath": "memory/.mm/results/result_....preview.json",
  "bytes": 182004
}
```

### Commands to integrate

```text
mm context
mm search
mm lint
mm ingest
mm read
mm index rebuild --verbose
mm wiki contradictions when added
```

### Add result commands

```bash
mm results list
mm results show result_...
mm results prune --older-than 30d
mm results prune --all --yes
```

### Negative tests

- A huge context result spools.
- JSON spooled result still returns parseable JSON.
- Human result shows preview and file path.
- Full result can be retrieved.
- Result pruning does not delete canonical memory files.
- Result paths are under `memory/.mm/results`.

### Acceptance gates

- Large outputs no longer flood stdout.
- JSON consumers receive preview + path metadata.
- Result storage is generated/non-canonical.
- Commands use registry budgets.
- Spooling uses safe paths and atomic writes.

---

## Phase 7 — Frontmatter and Unicode/String Safety

### Goal

Make Markdown/YAML pages tolerant of human/LLM mistakes while preserving raw truth. Prevent invisible Unicode and malformed frontmatter from breaking search, sorting, matching, slugs, or command resolution.

### Deliverables

- Hardened `src/core/frontmatter.mjs`
- `src/core/string-safety.mjs`
- `src/core/slug.mjs`
- `src/commands/frontmatter.mjs`
- `mm lint frontmatter`
- `mm lint unicode`
- Tests for malformed frontmatter, aliases, Unicode traps, safe fixes, and raw immutability

### Frontmatter subset

Support only the subset MemoryMagico needs:

```yaml
---
id: page_123
kind: concept
title: Sentinel-1 Radar Monitoring
aliases:
  - SAR
  - radar scenes
tags:
  - remote-sensing
semantic_terms:
  - radar imagery
  - moisture signal
status: active
created_at: 2026-06-17T00:00:00.000Z
updated_at: 2026-06-17T00:00:00.000Z
---
```

Supported types:

```text
string
number
boolean
null
array of strings
array of numbers
simple quoted strings
```

Do not support arbitrary nested YAML in v1.

### Canonical key normalization

Normalize:

```text
semantic_terms -> semanticTerms
source_refs -> sourceRefs
created_at -> createdAt
updated_at -> updatedAt
reviewed_at -> reviewedAt
raw_refs -> rawRefs
```

### Unicode/string safety

Detect:

```text
bidi control characters
zero-width characters
null bytes
private-use characters in machine-facing fields
unassigned/suspicious codepoints where detectable
NFKC normalization changes
leading/trailing invisible whitespace
lookalike slug collisions
```

Machine-facing fields:

```text
id
kind
title
aliases
tags
semanticTerms
status
slug
path fields
sourceRefs
```

Do not mutate raw source files.

Sanitize/normalize only:

```text
generated slugs
search-index text
frontmatter keys
CLI matching strings
JSON output strings where needed
```

### Commands

```bash
mm frontmatter get <page>
mm frontmatter set <page> title "New Title"
mm frontmatter set <page> semantic_terms "hybrid retrieval,BM25"
mm lint frontmatter
mm lint unicode
mm lint frontmatter --fix
mm lint unicode --fix-frontmatter
```

Fix modes must:

- Require lock.
- Use atomic writes.
- Preserve Markdown body.
- Show diff or summary.
- Never touch raw sources.
- Never “fix” ambiguous content without user/agent explicit flag.

### Negative tests

- malformed array reports file and line.
- missing closing `---` reports file and line.
- `title: Sprint 28` is flagged.
- `status: done​` with zero-width char is flagged.
- snake_case keys normalize.
- frontmatter rewrite preserves body exactly.
- raw source with weird Unicode is not mutated.
- slug collisions are reported.

### Acceptance gates

- Frontmatter errors are legible and line-aware.
- Unicode traps are detected in machine-facing fields.
- Safe fixes are mechanical and reviewable.
- Raw files are immutable.
- Search/resolver use sanitized derivatives, not mutated raw truth.

---

## Phase 8 — Manifest-First Recall and Wiki Hygiene

### Goal

Make `mm context`, `mm search`, and agent recall selective before they are deep. The agent should inspect a compact map of memory before reading full pages.

### Deliverables

- `src/core/wiki-manifest.mjs`
- `src/commands/wiki.mjs` updates
- `mm wiki manifest`
- `mm wiki orphans`
- `mm wiki backlinks <page>`
- `mm lint wiki`
- Tests for manifest caps, backlinks, orphan pages, missing descriptions, stale index, and context selection

### Manifest record shape

```json
{
  "id": "page_...",
  "kind": "concept",
  "title": "MemoryMagico Search Architecture",
  "path": "memory/wiki/systems/search.md",
  "summary": "Hybrid local retrieval with BM25, hashed vectors, aliases, and graph boosts.",
  "aliases": ["semantic-lite search", "local retrieval"],
  "tags": ["search", "cli"],
  "links": ["Resolver", "Index Rebuild"],
  "sourceRefs": ["raw_..."],
  "updatedAt": "..."
}
```

### Manifest behavior

- Scan frontmatter and first heading/summary only.
- Do not read entire page bodies unless selected.
- Cap manifest size.
- Warn when page summaries are missing.
- Warn when `memory/wiki/index.md` is too large.
- Prefer topic pages over giant entrypoints.

### Commands

```bash
mm wiki manifest
mm wiki manifest --json
mm wiki backlinks "Search Architecture"
mm wiki orphans
mm lint wiki
```

### Context integration

`mm context <ref>` should:

1. Resolve the human ref.
2. Load manifest.
3. Select likely related pages.
4. Read bounded sections only.
5. Include backlinks/source refs/comments/tasks if relevant.
6. Spool result if large.

### Search integration

`mm search` should:

1. Use generated index if fresh.
2. If index missing, fall back to manifest scan with warning.
3. Never bulk-read whole wiki by default.

### Wiki hygiene lint checks

```text
orphan pages
broken Obsidian links
broken Markdown links
missing frontmatter
missing summary/description
huge entrypoint files
missing source refs on claim-heavy pages
stale index
duplicate aliases
slug collisions
```

### Negative tests

- A huge `index.md` triggers warning.
- Page with no inbound/outbound links is detected as orphan.
- Broken `[[Link]]` is detected.
- `mm context "sprint 28"` reads manifest before page bodies.
- Missing search index falls back gracefully.
- Manifest output remains under configured cap.

### Acceptance gates

- Agent can inspect memory shape without bulk-loading files.
- Context uses manifest-first behavior.
- Wiki hygiene failures are visible through lint.
- Entry pages stay pointer-like.
- Search/context are surgical.

---

## Phase 9 — Raw Media and Clipboard Image Intake

### Goal

Support safe raw image ingestion and base64 preparation without turning MemoryMagico into a full image-processing stack.

### Deliverables

- `src/core/media-detect.mjs`
- `src/core/image-intake.mjs`
- `src/core/base64-safe.mjs`
- `src/commands/image.mjs`
- `mm raw add-image`
- `mm image inspect`
- `mm image encode`
- Tests for magic bytes, fake extensions, size caps, base64 caps, clipboard behavior where testable, and asset metadata

### Supported v1 formats

```text
PNG
JPEG
WebP
GIF
```

Use magic bytes, not only file extensions.

### Media limits

Centralize constants:

```text
MAX_IMAGE_BYTES_DEFAULT = 5 MB or configured
MAX_BASE64_OUTPUT_BYTES = configured
MAX_CLIPBOARD_IMAGE_BYTES = configured
SUPPORTED_IMAGE_TYPES = png, jpeg, webp, gif
```

### Commands

```bash
mm raw add-image ./screenshot.png
mm raw add-image --clipboard
mm image inspect ./screenshot.png
mm image inspect ./screenshot.png --json
mm image encode ./screenshot.png --base64
mm image encode ./screenshot.png --base64 --json
```

### Raw image storage

Store assets under:

```text
memory/raw/assets/
```

Raw index entry:

```json
{
  "id": "raw_img_...",
  "kind": "image",
  "path": "memory/raw/assets/raw_img_...png",
  "mediaType": "image/png",
  "byteSize": 412331,
  "source": "clipboard",
  "originalName": "screenshot.png",
  "createdAt": "...",
  "sha256": "..."
}
```

Width/height:

- Include if cheap to detect safely.
- Do not add heavy dependency only for width/height in v1.

### Clipboard support

Implement best-effort adapters:

```text
macOS: pngpaste if installed, osascript/screencapture if appropriate, or documented fallback
Linux X11: xclip/xsel if installed
Linux Wayland: wl-paste if installed
Windows: PowerShell clipboard path if feasible
```

If adapter unavailable, fail with clear install/fallback instructions.

### Base64 behavior

- Base64 encode only after size guard.
- Refuse to print huge base64 to stdout unless `--yes` or `--output <file>` is provided.
- Prefer writing base64 to generated result file or JSON field only under cap.

### Non-goal

No mandatory resizing/compression in v1.

Optional future adapter interface:

```bash
mm image compress ./image.png --adapter sharp
mm image compress ./image.png --adapter imagemagick
mm image compress ./image.png --adapter sips
```

### Negative tests

- `fake.png` containing text is rejected.
- oversized image is rejected.
- base64 over configured cap is refused.
- image is copied into raw assets, original is not deleted.
- raw index record is written atomically.
- clipboard unavailable gives stable `CLIPBOARD_IMAGE_UNAVAILABLE`.
- path traversal in output asset path is impossible.

### Acceptance gates

- Image raw intake works safely.
- Magic bytes are validated.
- Size/base64 limits are enforced.
- Raw asset is immutable.
- Original external file is not deleted.
- Resizing is explicitly deferred/optional.

---

## Phase 10 — Error Classification and Lint Hardening

### Goal

Make failures legible to humans and useful to agents. Expand lint from “does it mostly work?” to a set of focused health checks covering the new safety boundaries.

### Deliverables

- Expanded `src/core/errors.mjs`
- `src/core/lint-result.mjs`
- Updated `src/commands/lint.mjs`
- Focused lint modes
- Tests for each error category and lint mode

### Stable error codes

Define stable codes:

```text
UNKNOWN_COMMAND
INVALID_ARGUMENT
AMBIGUOUS_REFERENCE
MISSING_REFERENCE
PATH_OUTSIDE_MEMORY_ROOT
PATH_OUTSIDE_REPO_ROOT
PATH_TRAVERSAL_REJECTED
SYMLINK_WRITE_REJECTED
MALFORMED_JSON
MALFORMED_JSONL
LEDGER_CORRUPT
INVALID_FRONTMATTER
UNSAFE_UNICODE
STALE_INDEX
RESULT_TOO_LARGE
RESULT_SPOOLED
LOCK_HELD
LOCK_STALE
COMMAND_ABORTED
UNSUPPORTED_MEDIA_TYPE
IMAGE_TOO_LARGE
BASE64_TOO_LARGE
CLIPBOARD_IMAGE_UNAVAILABLE
```

### Error object shape

```json
{
  "code": "PATH_TRAVERSAL_REJECTED",
  "message": "Path traversal is not allowed for memory-write paths.",
  "details": {
    "input": "../../outside.md",
    "policy": "memory-write",
    "command": "wiki create"
  },
  "hint": "Use a path under memory/wiki or pass a title instead of a path.",
  "exitCode": 2
}
```

### Lint modes

Add focused lint modes:

```bash
mm lint
mm lint paths
mm lint frontmatter
mm lint unicode
mm lint jsonl
mm lint wiki
mm lint index
mm lint locks
mm lint results
mm lint media
mm lint --json
mm lint --fix-frontmatter
mm lint --fix-unicode
mm lint --fix-stale-locks
```

### Lint result shape

```json
{
  "ok": false,
  "summary": {
    "errors": 2,
    "warnings": 4
  },
  "findings": [
    {
      "severity": "error",
      "code": "INVALID_FRONTMATTER",
      "path": "memory/wiki/foo.md",
      "line": 4,
      "message": "Expected array item under aliases.",
      "hint": "Use '- alias value' on separate lines."
    }
  ]
}
```

### Tasks

#### 10.1 Make errors actionable

- Add `hint` to user-facing errors.
- Include command and path policy in path errors.
- Include file/line/field in frontmatter errors.
- Include candidate refs in ambiguous reference errors.
- Include repair command suggestion for JSONL corruption.

#### 10.2 Expand lint coverage

Integrate new checks from phases:

```text
paths
frontmatter
unicode
jsonl
wiki links
index freshness
result spool health
stale locks
media raw index
command registry completeness
```

#### 10.3 Add JSON lint output

`mm lint --json` must be parseable and suitable for agents.

#### 10.4 Add fix guardrails

All fix modes must:

```text
require lock
use atomic writes
only perform mechanical fixes
summarize changes
support --dry-run
support --json
never mutate raw sources
```

### Negative tests

- Each stable error class can be triggered.
- `mm lint --json` parses.
- malformed frontmatter reports line.
- bad JSONL suggests ledger repair.
- stale lock appears in `mm lint locks`.
- unsafe unicode appears in `mm lint unicode`.
- `--fix` modes do not touch raw files.
- ambiguous ref error includes candidates.

### Acceptance gates

- Errors are stable and machine-readable.
- Lint has focused modes.
- Lint output includes file/line/hint when available.
- Fix modes are safe and dry-run capable.
- Agents can reason about failures without stack traces.

---

## Phase 11 — Regression Fixtures and CI Hardening

### Goal

Prove the hardening behavior with fixtures and integration tests. Do not rely on the existence of helper modules as evidence.

### Deliverables

- `tests/fixtures/memory-basic/`
- `tests/fixtures/memory-corrupt-jsonl/`
- `tests/fixtures/memory-bad-frontmatter/`
- `tests/fixtures/memory-path-attacks/`
- `tests/fixtures/memory-large-files/`
- `tests/fixtures/memory-media/`
- CLI integration test utilities
- CI script updates

### Fixture repos

Create fixture memory workspaces for:

```text
basic valid workspace
bad frontmatter
bad JSONL
unsafe Unicode
path traversal attempts
symlink attacks
large raw transcript
large wiki page
binary media files
stale search index
ambiguous references
concurrent writes
```

### Test categories

#### 11.1 JSON contract tests

- Every command with `supportsJson: true` must have one test that parses stdout as JSON.
- Error mode JSON must also parse.

#### 11.2 Path safety tests

- Write commands reject traversal.
- Read commands reject traversal.
- Symlink writes fail.
- External raw import is allowed only through raw import commands.

#### 11.3 Ledger tests

- strict JSONL fails on bad line.
- tolerant mode warns.
- repair quarantines bad lines.

#### 11.4 Range read tests

- huge text file truncates.
- binary file returns metadata.
- line offsets are correct.

#### 11.5 Atomic/lock tests

- concurrent writes do not corrupt.
- lock held error is stable.
- interrupted index rebuild leaves previous index intact.

#### 11.6 Frontmatter/unicode tests

- malformed frontmatter line reporting.
- invisible Unicode detection.
- safe fixes preserve body.

#### 11.7 Media tests

- magic bytes detect PNG/JPEG/WebP/GIF.
- fake extension rejected.
- oversized image rejected.
- base64 cap enforced.

### Static checks

Add checks for:

```text
direct console.log in src/core
direct fs.writeFile in commands outside atomic helpers
unregistered command files
commands with supportsJson but no JSON test
commands with acceptsPaths but no path policy
write commands without lock policy
```

### Acceptance gates

- Test suite covers all hardening phases.
- Every command JSON output is parse-tested.
- Every path policy has negative tests.
- Every write flow has lock/atomic coverage.
- No unregistered commands.
- No risky helper is unintegrated.

---

## Phase 12 — Documentation, AGENTS Contract, and Agent Recipes

### Goal

Document how MemoryMagico expects agents to use the hardened CLI, including safe workflows for search, context, edits, raw ingest, media ingest, and repair.

### Deliverables

- `docs/agentic-cli-hardening.md`
- `docs/command-contracts.md`
- `docs/json-output.md`
- `docs/path-safety.md`
- `docs/frontmatter.md`
- `docs/result-spooling.md`
- `docs/media-intake.md`
- Updated `memory/AGENTS.md`
- Updated README command examples

### Docs to write

#### 12.1 Command contract docs

Explain:

```text
readOnly
destructive
concurrencySafe
supportsJson
supportsExplain
requiresFreshIndex
acceptsHumanRef
acceptsPaths
maxResultSizeChars
```

#### 12.2 JSON output docs

Explain:

```text
stdout/stderr contract
ok/error shape
warnings
spooled results
exit codes
NDJSON future mode
```

#### 12.3 Path safety docs

Explain policies:

```text
memory-read
memory-write
repo-read
repo-write
generated-read
generated-write
external-source-read
asset-write
temp-write
```

#### 12.4 Agent recipes

Add examples:

```bash
# inspect available commands
mm commands --json

# find the current sprint without guessing IDs
mm resolve "current sprint" --json

# get bounded context
mm context "sprint 28" --deep --json

# safely read a slice of a huge source
mm read memory/raw/sources/transcript.md --offset 300 --lines 100 --json

# ingest an image
mm raw add-image --clipboard --json

# recover from malformed ledger
mm ledger inspect memory/raw/index.jsonl --json
mm ledger repair memory/raw/index.jsonl --quarantine-bad-lines --dry-run --json

# validate memory health
mm lint --json
```

#### 12.5 AGENTS.md update

Add agent rules:

```text
Use mm commands --json to discover capabilities.
Prefer mm resolve before guessing IDs.
Prefer mm context over raw grep.
Use --json when calling commands for automation.
Never write files directly if an mm command exists.
Never edit raw sources.
Run mm lint after write-heavy sessions.
Respect spooled result paths.
```

### Acceptance gates

- Docs match actual command registry.
- Examples are tested or smoke-tested.
- AGENTS.md tells agents how to operate safely.
- README no longer implies unsafe/manual flows.
- Command docs can be regenerated or checked against registry.

---

## Suggested Execution Order

This is the recommended order because later phases depend on earlier primitives.

```text
0. Baseline audit and command integration map
1. Command registry and machine output discipline
2. Safe paths and access policies
3. Atomic writes, locks, cleanup, and abort safety
4. JSON, JSONL, and ledger safety
5. Range-limited reads and mm read
6. Result spooling and output budgets
7. Frontmatter and Unicode/string safety
8. Manifest-first recall and wiki hygiene
9. Raw media and clipboard image intake
10. Error classification and lint hardening
11. Regression fixtures and CI hardening
12. Documentation, AGENTS contract, and recipes
```

### Alternate execution if speed matters

If this must be sliced into smaller pull requests:

```text
PR 1: Phase 0 + registry skeleton + commands --json
PR 2: stdout guard + JSON output contract tests
PR 3: safe paths + path policy integration for write commands
PR 4: atomic writes + locks
PR 5: JSONL/ledger helpers
PR 6: range reader + mm read
PR 7: result spool
PR 8: frontmatter/unicode lint
PR 9: manifest-first context/search
PR 10: image intake
PR 11: lint expansion + regression fixtures
PR 12: docs/AGENTS update
```

---

## Explicit Non-Goals

Do not build these in this hardening tranche:

```text
full Claude Code harness
Ink/TUI interface
remote sessions
MCP server/client plumbing
model routing
plugin marketplace
telemetry/growthbook/feature flags
subagent orchestration
full image resizing stack
mandatory native image dependencies
semantic embedding provider
database-backed memory store
cloud sync
```

MemoryMagico should remain:

```text
local
Markdown-first
CLI-driven
transparent
agent-friendly
dependency-light
```

---

## Final Target End State

After this plan, MemoryMagico should have:

```text
safe command contracts
safe JSON stdout
safe path containment
atomic writes
locks
cleanup on abort
strict/tolerant JSONL handling
bounded file reads
binary detection
result spooling
frontmatter coercion
Unicode trap detection
manifest-first recall
raw image intake
stable error codes
focused lint modes
regression fixtures
agent-facing docs
```

The CLI should be safe enough for an LLM to operate without front-loading the whole repo and without silently corrupting the memory tree.

The hard standard:

```text
MemoryMagico is not hardened when helpers exist.
MemoryMagico is hardened when every risky command is forced through those helpers and the failure modes are tested.
```
