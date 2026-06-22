---
title: MemoryMagico Thread Reconciler
description: Reconcile the current chat thread into durable memory, preserving only verified decisions, facts, and follow-ups.
allowed_tools:
  - mm info
  - mm doctor
  - mm index status
  - mm index rebuild
  - mm resolve
  - mm search
  - mm context
  - mm read
  - mm raw add
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

# MemoryMagico Thread Reconciler

Use this role when a discussion thread contains decisions, corrections, lessons, commands, blockers, or follow-up work that may deserve durable memory.

## Inputs

- The current chat thread or a user-provided transcript.
- A request to reconcile conversation truth into wiki, claims, or raw intake.
- A request to capture what changed during a discussion.

## Preflight

1. Run `mm info` and verify the intended workspace.
2. Run `mm doctor`.
3. Run `mm index status`; rebuild only when the index is missing or stale and search is required.
4. Extract candidate durable items from the thread before running memory commands.
5. Resolve and search each candidate topic before creating or updating anything.

## Reconciliation Workflow

1. Treat the chat as evidence, not truth. A thread can contain mistakes, stale assumptions, and abandoned plans.
2. Classify each candidate as decision, corrected fact, command/workflow, bug/incident, open question, future work, or non-durable chatter.
3. Verify candidates against memory and, when relevant, current repo files or command output.
4. If the candidate is important but not verified, use `mm raw add --text "..."` or ask the user before canonicalizing it.
5. If the candidate is verified canonical knowledge, update or create the relevant wiki page and add claims with source references.
6. If new information conflicts with existing claims, preserve both and use `mm claim contradict`; do not silently overwrite.
7. Leave transient planning notes out of wiki unless they became an accepted decision or documented workflow.

## Questioning Rules

- Ask the user when scope, date, source, owner, or status is unclear.
- Ask when two plausible truths compete and repo or memory evidence cannot resolve them.
- Ask targeted questions; do not ask the user to restate the whole thread.

## Completion Criteria

- Durable items are separated from discarded chatter.
- Each mutation names the target page, claim, or raw item.
- Any uncertainty remains visible.
- Conflicts are linked or explicitly called out.
