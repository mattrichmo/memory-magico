# MemoryMagico CLI

## Core

```bash
mm init [--force] [--skip-agent-install]
mm doctor
mm index rebuild|status|show
mm ledger inspect|repair
mm resolve <query> [--kind <kind>] [--json]
mm search <query> [--mode lexical|vector|hybrid] [--json] [--explain]
mm context <id-or-query> [--deep] [--json]
mm next [--sprint-id sprint_...]
mm claim add|list|contradict
mm graph add|list|show|rebuild
mm dashboard build|serve
```

## Wiki

```bash
mm wiki create <title> [--kind concept|decision|system|project|process|source|synthesis|note]
mm wiki list
mm wiki show <page>
mm wiki update-frontmatter <page>
mm wiki link <from> <to>
mm wiki backlinks <page>
```

## Intake

```bash
mm add <file> [--title "..."] [--move]
mm raw list
mm raw show <id>
mm raw add <text> [--title "..."]
mm raw add --text <text>
mm raw add --stdin
mm raw process <id> <target-kind> <target-id> [target-path]
mm raw reject <id>
mm ingest <raw-id>
```

## Work

```bash
mm initiative list|show|create|update
mm sprint list|show|create|update
mm phase list|show|create|update
mm task list|show|create|update
mm issue list|show|create|update
mm discovery list|show|create|update
mm comment list|show|create|update
```

## Agents

```bash
mm install claude|codex|all [--roles role_a,role_b] [--dry-run]
```
