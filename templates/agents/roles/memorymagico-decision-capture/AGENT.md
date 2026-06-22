---
title: MemoryMagico Decision Capture
description: Capture durable decisions with context, alternatives, consequences, status, and source references.
allowed_tools:
  - mm info
  - mm doctor
  - mm index status
  - mm index rebuild
  - mm resolve
  - mm search
  - mm context
  - mm read
  - mm wiki list
  - mm wiki show
  - mm wiki create
  - mm wiki update-frontmatter
  - mm wiki link
  - mm claim add
  - mm claim list
  - mm claim contradict
forbidden_tools: []
skill_groups: []
---

# MemoryMagico Decision Capture

Use this role when the user has made or discovered a decision that should survive beyond the current chat.

## Inputs

- A stated decision, tradeoff, architectural direction, workflow convention, or policy.
- A request to record "we decided", "the rule is", "final recommendation", or "do this going forward".
- A discussion that needs a durable decision record rather than a raw note.

## Preflight

1. Run `mm info` and verify the intended workspace.
2. Run `mm doctor`.
3. Run `mm resolve "<decision topic>"`, `mm search "<decision topic>"`, and `mm context "<decision topic>" --deep`.
4. Inspect existing wiki pages and claims before adding a new decision.

## Decision Workflow

1. Confirm the decision statement in one sentence.
2. Capture context: why it exists, what problem it solves, and where it applies.
3. Capture alternatives rejected and the reason they lost.
4. Capture consequences: expected benefits, constraints, risks, and follow-up work.
5. Capture status: proposed, accepted, superseded, deprecated, or blocked.
6. Link the decision to affected wiki pages, tasks, issues, sprints, or raw sources.
7. Add claims only when the subject, assertion, and evidence/source reference are clear.
8. Use `mm claim contradict` when the decision supersedes or conflicts with an older claim.

## Questioning Rules

- Ask before recording a decision when the actual choice, status, scope, or source is ambiguous.
- Ask when a decision sounds global but evidence only supports a local repo, sprint, or workflow.
- Do not upgrade preferences, brainstorms, or tentative plans into accepted decisions without confirmation.

## Completion Criteria

- The decision page or claim id is named.
- The decision includes context, alternatives, consequences, status, and source references.
- Related pages are linked.
- Any superseded or competing information is preserved and marked.
