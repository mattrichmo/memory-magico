# MemoryMagico CLI reference

```bash
mm <command> [subcommand] [...args]
mm help
mm help search
mm commands
mm commands --json
mm info
```

Most read commands support `--json`; agents should use it when parsing results programmatically. See [README.md](README.md) for the pitch/architecture, [docs/workflows.md](docs/workflows.md) for an end-to-end cookbook, and [docs/agent-system.md](docs/agent-system.md) for agent role details.

## Workspace and health

```bash
mm init [--yes|-y] [--project-root <path>] [--memory-root <path>] [--install-root <path>] [--separate-git|--in-repo-memory] [--force] [--skip-agent-install]
mm doctor [--json] [--fix]
mm lint [--json]
mm ledger inspect <path> [--tail N] [--json]
mm ledger repair <path> [--quarantine-bad-lines] [--dry-run] [--json]
mm schema list
mm schema show <schema-file>
mm schema validate <schema-file> [data-file]
```

| Command | Description |
|---|---|
| `mm init` | Interactive wizard (in a terminal) for creating the memory workspace scaffold, writing `.memorymagico.json` into the selected repo, and installing optional generated agent surfaces. |
| `mm doctor` | Validates that the expected scaffold exists; `--fix` creates missing scaffold files. |
| `mm lint` | Runs schema, referential, and lifecycle invariant checks. |
| `mm ledger` | Inspects or repairs JSON/JSONL ledgers; repair can quarantine malformed lines. |
| `mm schema` | Lists, shows, or validates schema definitions. |

## Search, read, and context

```bash
mm index rebuild [--json]
mm index status [--json]
mm index show

mm search <query> [--kind <kind>] [--limit N] [--mode lexical|vector|hybrid] [--json] [--explain]
mm resolve <query> [--kind <kind>] [--limit N] [--json]
mm context <id-or-query> [--deep] [--json]
mm read <path> [--offset N] [--lines N] [--max-bytes N] [--json] [--binary-info]
mm results list [--json]
mm results show <id> [--json]
mm results prune --older-than 30d
mm results prune --all --yes
```

| Command | Description |
|---|---|
| `mm index` | Rebuilds or inspects the local search index. |
| `mm search` | Searches memory pages and work records using the generated index. |
| `mm resolve` | Resolves human references, titles, aliases, or IDs to memory entities. |
| `mm context` | Returns focused context for a target entity or query. |
| `mm read` | Reads bounded file ranges with line and byte caps. |
| `mm results` | Lists, reads, or prunes spooled large results. |

## Wiki

```bash
mm wiki create <title> [--kind concept|decision|system|project|process|source|synthesis|note] [--status draft|active|stable|deprecated|archived]
mm wiki list
mm wiki show <page>
mm wiki update-frontmatter <page> [--title "..."] [--kind <kind>] [--status <status>]
mm wiki link <from> <to>
mm wiki backlinks <page>

mm frontmatter get <page> [--json]
mm frontmatter set <page> --key value [--json]
```

Wiki pages are canonical. Update an existing page rather than creating a duplicate for the same concept.

## Raw intake

```bash
mm add <file> [--title "..."] [--source-type <type>] [--tags tag1,tag2] [--move]

mm raw add <text> [--title "..."]
mm raw add --text <text>
mm raw add --stdin
mm raw add-image <filepath> [--json]
mm raw list [--json]
mm raw list-all [--json]
mm raw show <id> [--json]
mm raw process <id> [target-kind target-id [target-path]]
mm raw reject <id>
mm raw archive <id>
mm raw cleanup

mm image inspect <path> [--json]
mm image encode <path> [--json]
mm image add <path>

mm ingest <raw-id> [--json]
```

Raw intake captures source material before anyone decides what it means. Treat it as immutable and untrusted. Reconciliation is the step that decides whether an item is new, stale, a duplicate, rejected, or already represented in canonical memory. Verified chat findings can be created directly as issues and composed into sprints; they do not need a raw item first.

## Work management

```bash
mm container list|show|create|update|archive
mm initiative list|show|create|update
mm sprint list|show|create|update|compose
mm phase list|show|create|update
mm task list|show|create|update|complete
mm issue list|show|create|update|close|link-pr|verify|block|unblock
mm discovery list|show|create|update
mm comment list|show|create
mm next [--sprint-id sprint_...]
```

Creation examples:

```bash
mm container create "Memory Harness" --domain memory-harness --category engineering

mm initiative create "Harden MemoryMagico CLI" \
  --why "Agents need reliable command boundaries" \
  --outcome "Safe, testable CLI workflows"

mm sprint create "CLI Hardening Sprint" \
  --goal "Close P0 safety gaps" \
  --initiative-ids init_...

mm phase create "Path safety" \
  --sprint-id sprint_... \
  --success-gates "path traversal tests pass,write commands use safe-path helpers"

mm task create "Harden schema show path handling" \
  --sprint-id sprint_... \
  --phase-id phase_... \
  --acceptance "schema names cannot escape schemas/" \
  --verification "node --test tests/hardening.test.mjs"

mm issue create "JSONL lint passes malformed files" \
  --issue-type bug \
  --severity P0 \
  --risk "Malformed ledgers can appear clean" \
  --acceptance "bad JSONL returns non-zero lint" \
  --verification "inject malformed row and run mm lint --json"

mm sprint compose "Fix discovered CLI bugs" \
  --issue-ids issue_...,issue_... \
  --phase-title "Bug fixes" \
  --success-gates "all linked tasks have verification evidence"

mm migrate run 2026-06-24-backfill-work-item-numbers

mm sprint update sprint_... completed \
  --success-gates "all 14 tasks verified,design-system closeout recorded" \
  --note "Sprint closed after final review."

mm discovery create "Raw command prints full payloads" \
  --summary "Raw output should have byte and line caps" \
  --recommended-action "promote_to_issue"
```

Sprint creation assigns the next global sprint number automatically. Phase creation assigns the next number within the sprint. Task creation assigns the next number within its phase, or within the sprint when no phase is set. `mm sprint compose` creates a numbered sprint, phase `1`, and numbered tasks.

### Status and lifecycle values

**Initiatives:** `idea, shaping, planned, active, shipped, parked, cancelled`

**Sprints and phases:** `planned, active, paused, completed, cancelled` — completed sprints and phases should have meaningful success gates.

**Tasks:** `todo, in_progress, blocked, done, cancelled` — moving to `in_progress` requires acceptance criteria and a verification plan; moving to `done` requires verification evidence.

**Issues:** `draft, ready_for_agent, in_progress, needs_review, needs_verification, verified, closed, deferred, blocked` — moving to `ready_for_agent` requires a risk statement, acceptance criteria, and a verification plan; moving to `verified` requires evidence such as a test command, result, evidence reference, commit, or pull request.

## Claims and graph

```bash
mm claim add <subject> <text> [--confidence high|likely|hypothesis|needs_review] [--source raw_...]
mm claim list [subject]
mm claim contradict <claim-a> <claim-b> <reason>

mm graph add <from-id> <type> <to-id> [--summary "..."] [--strength weak|medium|strong]
mm graph list [--type <type>] [--node <id>] [--id <relationship-id>]
mm graph show [id-or-node]
mm graph rebuild
```

Relationship types:

```text
belongs_to, contains, derived_from, promoted_from, folded_into, duplicates,
blocks, blocked_by, related_to, updates_memory, documents, references,
contradicts, supersedes, depends_on, implemented_by, verified_by
```

## Dashboard

```bash
mm dashboard build
mm dashboard serve [--port 4317] [--host 127.0.0.1] [--no-open]
```

Generates or serves a local view over MemoryMagico data. Defaults to binding `127.0.0.1`.

## Agents

```bash
mm install claude|codex|all [--roles role_a,role_b] [--install-root <path>] [--dry-run] [--update]
mm update [--roles role_a,role_b] [--install-root <path>] [--dry-run]
```

```bash
mm install all
mm install claude --roles memorymagico-orchestrator
mm install codex --roles memorymagico-sprint-launcher --dry-run
mm install all --install-root ..
mm install all --update
mm update
```

Bundled system roles (`memorymagico-*`) are seeded into `memory/agents/roles/` the first time they're missing. `--update` force-refreshes only those system roles from the installed package and regenerates their agent surfaces — custom roles you've added are never touched. `mm update` is shorthand for `mm install all --update`. `mm init` offers this as a wizard step and always installs only `memorymagico-orchestrator` for Claude Code by default. See [docs/agent-system.md](docs/agent-system.md) for role definitions and rules.

When a repo uses a sibling memory workspace, `mm install` reads role sources from the configured `memoryRoot` in `.memorymagico.json`. By default it writes generated `.claude/` or `.agents/` files into the configured project root. Use `--install-root <path>` to write those files into a top-level folder beside both `memory/` and the project repo; MemoryMagico writes a matching `.memorymagico.json` there so global `mm` commands resolve the same workspace.

## Troubleshooting

**`mm` command not found** — use `npm link`, or run the entrypoint directly: `node bin/mm.mjs help`.

**`npm link` fails** — confirm `package.json` exists and declares the CLI binary:

```json
{
  "type": "module",
  "bin": {
    "mm": "./bin/mm.mjs",
    "memorymagico": "./bin/mm.mjs"
  }
}
```

**Search misses recently changed pages** — rebuild the index:

```bash
mm index rebuild
mm index status
```

**A JSONL ledger is malformed** — inspect first, then repair with quarantine:

```bash
mm ledger inspect memory/inbox/raw-items.jsonl --tail 50
mm ledger repair memory/inbox/raw-items.jsonl --quarantine-bad-lines --dry-run
mm ledger repair memory/inbox/raw-items.jsonl --quarantine-bad-lines
```

**An agent is about to create duplicate work** — resolve and search before creating anything:

```bash
mm resolve "<thing>" --json
mm search "<thing>" --json --explain
mm context "<thing>" --deep --json
```
