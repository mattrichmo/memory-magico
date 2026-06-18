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
toolRoot   = repo/package root
repoRoot   = workspace root
memoryRoot = <repo>/memory
```

## Current Verification

```bash
mm init
mm doctor
mm index rebuild
mm search "radar monitoring"
mm resolve "radar monitoring"
```
