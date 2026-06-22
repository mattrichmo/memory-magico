# MemoryMagico Implementation

MemoryMagico now has a Markdown-first core:

- `src/core/frontmatter.mjs` parses and writes YAML frontmatter.
- `src/core/pages.mjs` scans wiki/work pages and chunks content by headings.
- `src/core/retrieval.mjs` builds a local search index with BM25 and hashed vectors.
- `src/core/workspace.mjs` creates the workspace scaffold.
- `src/commands/init.mjs`, `index.mjs`, `resolve.mjs`, `search.mjs`, `wiki.mjs`, `ingest.mjs`, `context.mjs`, and `next.mjs` expose the new surfaces.

The new direction is:

- canonical knowledge in Markdown/YAML,
- generated indexes in `memory/generated/` and `memory/.mm/search/`,
- local search and resolver flows for agents.

## Workspace Roots

```text
toolRoot   = installed package root
repoRoot   = project root that owns .memorymagico.json, or a legacy workspace root
memoryRoot = path from .memorymagico.json, explicit --memory-root, or legacy <repo>/memory
```

`.memorymagico.json` stores the repo-local pointer to memory, and `memory/.mm/manifest.json` stores the workspace identity. When both include a `workspaceId`, the CLI validates that they match before operating on memory.

## Current Verification

```bash
mm init
mm doctor
mm index rebuild
mm search "radar monitoring"
mm resolve "radar monitoring"
```
