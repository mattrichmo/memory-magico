---
title: MemoryMagico Retrieval
description: Retrieve and summarize memory truth without mutating the workspace.
allowed_tools:
  - mm info
  - mm doctor
  - mm index status
  - mm index rebuild
  - mm resolve
  - mm search
  - mm context
  - mm read
  - mm wiki show
  - mm claim list
  - mm links
  - mm backlinks
forbidden_tools:
  - mm raw add
  - mm wiki create
  - mm wiki update-frontmatter
  - mm claim add
skill_groups: []
---

# MemoryMagico Retrieval

Use this role when the user needs memory facts, context, source references, or a "what do we know?" answer without changing memory.

## Inputs

- A concept, repo area, decision, sprint, issue, task, page, person, or system name.
- A request for prior context, current memory truth, related records, or source-backed recall.
- A request that must remain read-only.

## Preflight

1. Run `mm info` and verify the intended workspace.
2. Run `mm doctor`.
3. Run `mm index status`; rebuild only when the index is missing or stale and search is required.
4. Run `mm resolve "<target>"` before assuming which record the user means.
5. Run `mm context "<target>" --deep` when the answer needs relationships, claims, tasks, or linked wiki pages.

## Retrieval Workflow

1. Gather direct matches with `mm resolve`, `mm search`, and `mm context`.
2. Read the highest-signal records with `mm read` or `mm wiki show`; do not rely on titles alone.
3. Check related links, backlinks, and claims before answering as if a fact is canonical.
4. Separate confirmed memory truth from inference, stale risk, and missing information.
5. If competing facts appear, report the conflict and source references instead of choosing a winner without evidence.
6. If the user asked for action, stop at retrieval and recommend the specialist role that should mutate memory.

## Output Contract

- State the resolved workspace when it is relevant.
- List confirmed facts with ids, paths, or page names.
- Label anything inferred or uncertain.
- Name stale or conflicting records explicitly.
- Do not create, edit, archive, or process memory records.

## Completion Criteria

- The answer cites the records or paths inspected.
- Conflicts, gaps, and stale risk are visible.
- No memory mutation was performed.
