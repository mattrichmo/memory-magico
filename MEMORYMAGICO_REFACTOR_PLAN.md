# MemoryMagico Refactor Plan

> Purpose: rebuild MemoryMagico from the current JSON-record tracker into a project-neutral, Markdown/YAML-first memory system with a surgical CLI, deterministic search, and strict verification.
>
> This plan is based on the current repo truth in `package.json`, `bin/mm.mjs`, `src/commands/*`, `src/core/*`, `schemas/*`, and `dashboard/*`. It assumes a destructive refactor is allowed and that obsolete architecture may be deleted once replacements exist.

## Current Truth

MemoryMagico today is still split across a tracker-style JSON model and a weak wiki stub.

- `package.json` points `mm` and `memorymagico` at `./bin/mm.mjs`; `qm` is no longer exposed.
- `bin/mm.mjs` is a thin bootstrap into `src/commands/router.mjs`, which dispatches to the command modules.
- `src/core/paths.mjs` assumes a nested tool installation and derives `repoRoot` two levels above the package, which does not match this checkout layout.
- `src/commands/` currently manages JSON-backed `initiative`, `sprint`, `phase`, `task`, `issue`, `discovery`, `comment`, `raw`, `container`, `graph`, `search`, `context`, and `wiki` flows.
- `src/commands/wiki.mjs` only creates a bare Markdown file with a top-level heading.
- `src/commands/search.mjs` is substring search over JSON records, not an index-backed retrieval system.
- `src/commands/doctor.mjs` checks for a JSON-backed `memory/` scaffold.
- `src/core/entities.mjs`, `records.mjs`, `guards.mjs`, `validation.mjs`, and `history.mjs` are built around the current JSON record model.
- `schemas/*.json` define the current tracker-oriented schema surface.
- `dashboard/*` and `src/core/dashboard-data.mjs` render tracker rollups, activity, and inbox pressure rather than a canonical wiki/search experience.
- `.DS_Store` junk is present and should be removed.

## Refactor Rules

1. Markdown/YAML pages are canonical knowledge.
2. JSON and JSONL are generated indexes, ledgers, caches, or migration artifacts only.
3. Raw sources are immutable after capture.
4. Search is a first-class product surface, not a side utility.
5. Compatibility aliases only survive if an external consumer absolutely requires them; otherwise delete them.
6. The refactor can delete old files, old schemas, old command paths, and old dashboard surfaces once the replacement exists.

## Phase 0 - Cutover, Root Contract, and Legacy Removal

### Goal

Stop pretending the current layout is stable. Define the real workspace root, remove legacy aliases, and clear out the old command plumbing.

### Tasks

1. Fix the repo/tool root contract in `src/core/paths.mjs` so the active workspace root is explicit and does not depend on a nested install assumption.
2. Keep the `package.json` binary map pointed at `./bin/mm.mjs` for `mm` and `memorymagico`, and keep `qm` removed.
3. Decide whether `bin/mm.mjs` should be a thin router into a central registry or a thin bootstrap into one `run(argv)` entrypoint, then delete the dead routing path.
4. Keep `qm`, Quarter, and other historical naming residue out of help text, docs, examples, labels, and generated output.
5. Add the minimum npm scripts needed for verification, smoke testing, and rebuilds once the new architecture exists.
6. Remove archive junk such as `.DS_Store` and `__MACOSX` entries from the repo.

### Done When

- `mm --help` routes through the new entrypoint.
- `memorymagico --help` routes through the same surface.
- No intentional `qm` references remain outside a migration note.
- The workspace root is deterministic and documented.

## Phase 1 - Canonical Memory Model

### Goal

Define the target record/page contract before moving implementation details around.

### Tasks

1. Define canonical page kinds for the memory system, including `source`, `concept`, `decision`, `glossary`, `person`, `product`, `project`, `system`, `process`, `synthesis`, `open_question`, `initiative`, `sprint`, `phase`, `task`, `issue`, `discovery`, and `note`.
2. Define the required base frontmatter for canonical Markdown pages, including stable IDs, kind, title, status, aliases, tags, source references, related links, and timestamps.
3. Decide which current JSON record fields become frontmatter, which become generated index fields, and which disappear entirely.
4. Define the relationship contract for backlinks, source links, typed graph edges, and work references.
5. Define the page naming and slug rules so generated paths stay stable and human-readable.

### Done When

- The page contract is documented in the repo.
- The work model and wiki model share one naming system.
- There is a clear rule for what is canonical versus generated.

## Phase 2 - Init and Workspace Scaffold

### Goal

Make a fresh repo usable with one command.

### Tasks

1. Implement `mm init` so it detects the active repository and creates the memory workspace in the right place.
2. Support `--force` for reinitializing a workspace.
3. Add templates for `default`, `company`, `research`, and `personal` starter workspaces.
4. Create `memory/README.md`, `memory/AGENTS.md`, `memory/wiki/index.md`, `memory/wiki/log.md`, `memory/wiki/overview.md`, and `memory/wiki/open-questions.md`.
5. Create empty generated folders and ledgers needed by the new index/search pipeline.
6. Make `mm doctor` verify the scaffold for a fresh workspace instead of only the old JSON tree.

### Done When

- A clean test repo can run `mm init` and then `mm doctor` successfully.
- The scaffold no longer depends on hand-created setup.

## Phase 3 - Markdown/YAML Page Engine

### Goal

Build the low-level read/write/validate layer for canonical pages.

### Tasks

1. Add a frontmatter parser and serializer that can round-trip Markdown pages without losing body content or unknown fields.
2. Normalize common frontmatter key variants so the old and new naming conventions can be converted safely.
3. Add safe atomic page writes with temporary files and rename-based commits.
4. Add a page validator that checks required fields, kind-specific status rules, timestamps, and broken references.
5. Add slug and path helpers so page filenames stay stable and collision-safe.
6. Add heading-aware page chunking for later search and retrieval work.

### Done When

- A page can be read, modified, and written back without body loss.
- Invalid frontmatter produces useful lint errors.
- Page helpers are isolated from the old JSON record implementation.

## Phase 4 - Wiki Surface

### Goal

Turn the wiki into the canonical human-readable memory layer instead of a placeholder file generator.

### Tasks

1. Replace the current `mm wiki create` behavior with Markdown pages that include frontmatter, a kind-specific body scaffold, and managed metadata.
2. Add `mm wiki show`, `mm wiki list`, `mm wiki update-frontmatter`, `mm wiki link`, and `mm wiki backlinks`.
3. Make `memory/wiki/index.md` and `memory/wiki/log.md` real managed files with preserved human-written sections.
4. Generate backlinks from actual page links, typed graph edges, and source/work references.
5. Add useful page templates for concepts, decisions, systems, projects, processes, sources, synthesis pages, and work pages.

### Done When

- Wiki pages are no longer bare `# Title` stubs.
- Index and log updates are rebuildable and non-destructive.
- Backlinks reflect real page relationships.

## Phase 5 - Explicit Search Phase

### Goal

Build a local retrieval stack that gives the CLI surgical access to the wiki and work memory without external dependencies.

### Tasks

1. Add a dedicated search index area, with internal build artifacts under `memory/.mm/search/` and published derived outputs under `memory/generated/` where appropriate.
2. Implement a scanner that walks canonical page roots, skips generated junk, and records page metadata.
3. Implement a heading-based chunker so search operates on chunks, not only whole pages.
4. Implement a zero-dependency tokenizer that handles case folding, punctuation stripping, camelCase, snake_case, kebab-case, stopwords, bigrams, and character trigrams.
5. Implement BM25 scoring over chunks with explain data for matched terms and boosts.
6. Implement deterministic hashed vectors with shared query/chunk feature extraction.
7. Implement a hybrid scorer that merges resolver hints, BM25, vector similarity, metadata boosts, graph boosts, and recency or status boosts.
8. Add `mm index rebuild` and `mm index status` so the index can be rebuilt, checked for staleness, and verified after file changes.
9. Upgrade `mm search` to support lexical, vector, and hybrid modes, plus JSON and explain output.
10. Add fixture-based search tests and honest docs that explain this is deterministic local retrieval, not neural embeddings.

### Done When

- `mm search "query"` defaults to hybrid retrieval.
- `mm index rebuild` can recreate the search artifacts from source pages.
- `mm index status` detects stale or missing index files.
- Search explanations are good enough for LLM use.

## Phase 6 - Resolver and Context

### Goal

Let users and agents refer to objects naturally instead of forcing generated IDs everywhere.

### Tasks

1. Add a central resolver that understands exact IDs, titles, aliases, file paths, sprint numbers, status shortcuts, and fuzzy matches.
2. Add `mm resolve` with human and JSON output.
3. Update `show`, `context`, `next`, `wiki show`, `sprint show`, `task list`, and similar commands to use the same resolver.
4. Add explicit disambiguation so multiple plausible matches are shown instead of guessed silently.
5. Expand `mm context` so it can gather the resolved entity, parent/child records, related pages, raw sources, log entries, and verification evidence without dumping irrelevant content.

### Done When

- Every command uses one resolver path.
- Users can ask for `sprint 28` or a page title instead of needing IDs.
- Context output stays compact by default and structured when requested.

## Phase 7 - Ingestion and Promotion

### Goal

Turn raw sources into maintained memory, not just stored intake.

### Tasks

1. Define the raw source model so raw items remain uniquely identified and immutable once captured.
2. Rework `mm add` and `mm raw add` so they preserve source copies safely and do not rely on destructive defaults.
3. Add `mm ingest` with plan and execute modes so the agent can preview the recommended page updates before writing them.
4. Make ingestion create source pages, suggested follow-up page updates, graph edges, and log entries in one staged flow.
5. Ensure failed ingestion does not leave the raw item marked processed without the corresponding memory updates.

### Done When

- A raw source can become a source page and related updates without partial state.
- Raw intake and promotion are clearly separated.

## Phase 8 - Workflows as Markdown-Backed Pages

### Goal

Keep initiatives, sprints, phases, tasks, and issues useful, but make them part of the Markdown memory system instead of isolated JSON records.

### Tasks

1. Convert initiative creation to Markdown pages under `memory/work/initiatives/`.
2. Add initiative lifecycle gates so loose capture is allowed but planned/active/shipped states require meaningful structure.
3. Convert sprint creation to Markdown pages with auto-numbering support.
4. Add sprint lifecycle gates so `ready`, `active`, and `completed` require the right evidence.
5. Convert phase creation to Markdown pages and make phase resolution work by sprint and order.
6. Convert task creation to Markdown pages and keep tasks visible in `mm next`.
7. Add task lifecycle gates so `done` requires verification evidence.
8. Convert issue creation to Markdown pages with readable risk, acceptance, and verification fields.
9. Add issue verification gates so verified status requires proof and updates log/graph state.
10. Add a generated work index so work commands can resolve items without scanning every file.
11. Migrate existing JSON work records into the new Markdown-backed layout and retire the old record files once verified.

### Done When

- Initiatives, sprints, phases, tasks, and issues are readable as Markdown pages.
- Work commands resolve through the new page/index layer.
- The old JSON work store is no longer the source of truth.

## Phase 9 - Graph and Relationship Automation

### Goal

Make relationships automatic enough that agents do not need to maintain the graph manually.

### Tasks

1. Define the relationship schema and supported edge types for source, work, wiki, and claim relationships.
2. Auto-create graph edges during ingest when raw sources become source pages or update existing pages.
3. Auto-create graph edges during work commands for belongs_to, derived_from, verifies, comments_on, and related_to relationships.
4. Add `mm graph show` so graph neighborhoods can be inspected from any resolved entity.
5. Add graph rebuild so the graph index can be recreated from canonical pages and the relationship ledger.

### Done When

- The graph reflects page refs, work refs, and source refs without manual edge management.
- `mm graph show` exposes useful neighborhood context.

## Phase 10 - Claims, Contradictions, and Knowledge Quality

### Goal

Track company truth, not just files.

### Tasks

1. Add a claim model that can live in frontmatter or managed body sections.
2. Add `mm claim add` so pages can store source-backed claims.
3. Add `mm claim list` so agents can inspect active beliefs by page, confidence, or status.
4. Add contradiction relationships so conflicting claims or pages are explicit in the graph.
5. Add stale claim lint so old low-confidence claims, missing sources, contradicted claims, and deprecated pages are flagged.

### Done When

- Pages can carry source-backed claims.
- Contradictions are visible in context and lint.
- Knowledge quality is auditable over time.

## Phase 11 - Dashboard Rebuild

### Goal

Replace the tracker-centric dashboard with a memory-centric control surface.

### Tasks

1. Rebuild the dashboard data source around canonical pages, generated indexes, search results, raw intake, and recent log activity.
2. Remove the current demo/tracker assumptions from `dashboard/app.js` and `src/core/dashboard-data.mjs`.
3. Add panels for wiki health, search health, ingest health, and recent memory changes.
4. Keep the UI operational on desktop and mobile without relying on the old issue/sprint pressure framing.
5. Make any API contract changes explicit so the dashboard can be rebuilt without hidden coupling.

### Done When

- The dashboard shows the new memory system truth, not the old tracker rollups.
- Search and wiki state are visible in the main control surface.

## Phase 12 - Verification, Migration, and Decommission

### Goal

Lock the new system in, verify it, and delete the old architecture once it is no longer needed.

### Tasks

1. Add end-to-end smoke tests that exercise init, capture, wiki creation, search, resolver, context, ingest, lint, and doctor.
2. Add fixture repos or workspace fixtures that make search and resolver behavior deterministic.
3. Update docs so `README.md`, `CLI.md`, `IMPLEMENTATION.md`, `DESIGN_NOTES.md`, and `DELIVERY.md` describe the new system instead of the old one.
4. Remove obsolete compatibility aliases, dead command modules, and legacy schema files after the replacement paths are verified.
5. Perform a final repo truth audit and remove any remaining junk files or stale migration notes.

### Done When

- The new architecture is verified end-to-end.
- The old JSON-first surfaces are gone or clearly marked as deprecated migration residue.

## Phase 13 - Agent Orchestration Surface

### Goal

Make agent routing explicit so orchestration, sprint launch, and specialist routing stay grounded in repo truth.

### Tasks

1. Keep `memory/AGENTS.md` as the top-level agent contract for raw intake, wiki truth, and sprint execution conventions.
2. Maintain a broad orchestrator role for routing, truth checks, and delegation.
3. Maintain a focused sprint launcher role that resolves sprint truth, validates linked work, and prefers one branch per worktree before edits.
4. Keep specialist router roles small and domain-focused, such as raw reconcile and wiki, instead of creating many narrow subskills.
5. Expose the install surface for Claude Code and Codex from the same role sources so agents stay in sync.
6. Document the safe raw intake patterns and the list-oriented command surface so agents can discover truth without guessing.

### Done When

- The orchestrator, sprint launcher, and specialist roles are documented in the repo.
- `mm install claude|codex|all` generates the expected agent surfaces from role sources.
- Sprint execution guidance explicitly mentions branch/worktree isolation.
- The CLI help surface shows the list commands and agent installer entrypoints.

## Suggested Execution Order

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8
10. Phase 9
11. Phase 10
12. Phase 11
13. Phase 12
14. Phase 13

## Target End State

MemoryMagico should end up as:

- a Markdown/YAML-first memory system,
- with a deterministic local search layer,
- with a resolver that understands human references,
- with raw-source ingestion that does not corrupt canon,
- and with a dashboard and CLI that expose current truth instead of old tracker assumptions.
