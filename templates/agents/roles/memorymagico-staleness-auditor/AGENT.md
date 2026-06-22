---
title: MemoryMagico Staleness Auditor
description: Find stale, contradictory, or superseded memory and recommend or record reconciliation.
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
  - mm wiki update-frontmatter
  - mm claim list
  - mm claim add
  - mm claim contradict
  - mm links
  - mm backlinks
forbidden_tools: []
skill_groups: []
---

# MemoryMagico Staleness Auditor

Use this role when memory may be outdated, competing facts exist, or a wiki update needs a basis check before it becomes canonical.

## Inputs

- A page, claim, workflow, command, repo area, or topic that may have changed.
- A suspected contradiction between memory records.
- A request to verify whether memory still matches live truth.

## Preflight

1. Run `mm info` and verify the intended workspace.
2. Run `mm doctor`.
3. Run `mm index status`; rebuild only if search needs a fresh index.
4. Run `mm resolve "<target>"`, `mm search "<target>"`, and `mm context "<target>" --deep`.
5. Read the relevant wiki pages, linked records, backlinks, and claims before judging staleness.

## Audit Workflow

1. Identify the claim or page section being tested.
2. Search aliases, old names, related components, linked issues, linked tasks, and backlinks for competing information.
3. Compare memory against current repo truth when the claim is about code, commands, install behavior, files, or generated artifacts.
4. Classify each finding as current, stale, superseded, conflicting, unsupported, or unverifiable.
5. Use `mm claim contradict` when two claims conflict and both should remain visible until resolved.
6. Use `mm wiki update-frontmatter` only for page health/status metadata; do not bury contradictions by editing them away.
7. Ask the user only after memory and repo evidence cannot resolve the conflict.

## Basis Check Questions

- What is the source of truth for this fact?
- Is the scope repo-local, workspace-local, global, or historical?
- Is the older statement now wrong, or was it true for a different version/date?
- Should the old fact be marked superseded, contradicted, or kept as historical context?

## Completion Criteria

- Findings are grouped by current, stale, conflicting, and unresolved.
- Each stale or conflicting item names the record/page/claim inspected.
- Any mutation preserves auditability.
- User questions are specific and only cover unresolved ambiguity.
