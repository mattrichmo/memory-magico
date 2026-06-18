# MemoryMagico

MemoryMagico is a file-backed memory system for AI-assisted software work.

The current implementation centers on:

- Markdown/YAML wiki pages as canonical knowledge.
- A local generated search index.
- A resolver for titles, IDs, and natural references.
- Raw intake that can be ingested into source pages.
- Markdown-backed work pages for initiatives, sprints, phases, tasks, issues, and discoveries.

## Start Here

```bash
mm init
mm doctor
mm index rebuild
mm ledger inspect memory/inbox/raw-items.jsonl
mm search "your topic"
mm resolve "your topic"
```

## Agent Setup

```bash
mm install claude
mm install codex
mm install all
mm install all --roles memorymagico-orchestrator
```

- `memory/AGENTS.md` is the top-level routing contract.
- `memory/agents/roles/memorymagico-orchestrator/AGENT.md` handles broad routing and truth checks.
- `memory/agents/roles/memorymagico-sprint-launcher/AGENT.md` handles sprint prep and worktree/branch setup.
- `memory/agents/roles/memorymagico-raw-reconcile/AGENT.md` handles stale-source and duplicate intake checks.
- `memory/agents/roles/memorymagico-wiki/AGENT.md` handles canonical wiki work.
- `mm init` installs the orchestrator bridge by default unless `--skip-agent-install` is set.

## Workspace Layout

`mm init` creates a `memory/` workspace with:

```text
memory/
  README.md
  AGENTS.md
  wiki/
  work/
  generated/
  .mm/search/
```

## Key Commands

```bash
mm wiki create "Sentinel-1 Radar Monitoring" --kind concept
mm wiki list
mm wiki show sentinel-1-radar-monitoring

mm raw list
mm raw add --text "literal raw text"

mm index rebuild
mm index status
mm ledger inspect memory/inbox/raw-items.jsonl
mm search "radar monitoring" --explain
mm resolve "radar monitoring" --json

mm ingest raw_...
mm context "sprint 28" --deep
mm next
mm claim add architecture "Markdown pages are canonical." --source memory/wiki/overview.md
mm graph rebuild
mm dashboard serve
```

## Notes

- Raw sources are treated as intake, not as canonical memory.
- For pasted text, prefer `mm raw add --text '...'` or `mm raw add --stdin`; do not rely on shell quoting alone for unsafe strings.
- Generated indexes can be deleted and rebuilt.
- The CLI is intentionally local and dependency-free.
# memory-magico
