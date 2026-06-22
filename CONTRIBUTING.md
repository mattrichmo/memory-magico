# Contributing

## Repository layout

```text
.
├── .memorymagico.json                 # optional project pointer to memoryRoot
├── bin/
│   └── mm.mjs                         # CLI entrypoint
├── src/
│   ├── commands/                      # CLI command implementations
│   └── core/                          # retrieval, paths, locks, JSON, frontmatter, records
├── schemas/                           # JSON schema guardrails
├── templates/
│   └── agents/roles/                  # bundled default agent role definitions
├── scripts/
│   └── smoke-test.mjs                 # basic smoke test
├── tests/
│   └── hardening.test.mjs             # command hardening tests
├── docs/
│   └── internal/                      # hardening notes and command map
└── memory/
    ├── AGENTS.md                      # root agent rules
    ├── agents/roles/                  # source role definitions
    ├── inbox/
    │   ├── raw-items.jsonl            # raw intake ledger
    │   ├── raw/                       # raw source files
    │   ├── processed/                 # reconciled raw source files
    │   └── rejected/                  # rejected raw source files
    ├── wiki/                          # canonical knowledge pages
    ├── work/
    │   ├── initiatives/
    │   ├── sprints/
    │   ├── phases/
    │   ├── tasks/
    │   ├── issues/
    │   ├── discoveries/
    │   ├── comments/
    │   └── containers/
    ├── generated/                     # generated indexes and dashboard data
    └── .mm/
        ├── manifest.json              # workspace identity used by .memorymagico.json
        ├── locks/                     # lock files for write operations
        └── search/                    # search manifest and index state
```

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for `toolRoot`/`repoRoot`/`memoryRoot` path resolution. Packaged `mm` commands should resolve memory from the nearest `.memorymagico.json` first, then validate it against `memory/.mm/manifest.json`.

## Testing and validation

```bash
mm doctor
mm lint
mm index rebuild
mm search "radar monitoring"
mm resolve "radar monitoring"
```

```bash
node scripts/smoke-test.mjs
node --test tests/hardening.test.mjs
```

```bash
find src bin scripts tests -name '*.mjs' -print0 | xargs -0 -n1 node --check
```

## Development guidelines

Keep canonical memory in Markdown/YAML pages where possible. Treat `memory/generated/` and `memory/.mm/search/` as rebuildable artifacts. Edit role source files rather than generated agent files. Add or update tests when changing command boundaries. Keep help text, registry metadata, command behavior, and documentation in sync. Avoid arbitrary shell execution in generated agent workflows — prefer explicit `mm` commands.
