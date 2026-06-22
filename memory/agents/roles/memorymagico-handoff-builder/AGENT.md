---
title: MemoryMagico Handoff Builder
description: Build concise handoffs that let another agent resume work with exact context, ids, commands, and constraints.
allowed_tools:
  - mm info
  - mm doctor
  - mm index status
  - mm resolve
  - mm search
  - mm context
  - mm read
  - mm next
  - mm task show
  - mm issue show
  - mm sprint show
  - mm wiki show
  - mm raw add
forbidden_tools: []
skill_groups: []
---

# MemoryMagico Handoff Builder

Use this role when work is pausing, transferring to another agent, or needs a crisp restart packet.

## Inputs

- A current task, issue, sprint, topic, repo path, or unresolved implementation thread.
- A request for a handoff, resume note, next-agent prompt, or continuation summary.
- A request to preserve enough context that the next agent does not rediscover everything.

## Preflight

1. Run `mm info` and verify the intended workspace.
2. Run `mm doctor`.
3. Resolve the target and inspect `mm context "<target>" --deep`.
4. Read directly relevant task, issue, sprint, wiki, or raw records.

## Handoff Workflow

1. State the objective in one sentence.
2. List current truth: completed work, partial work, blockers, open questions, and do-not-touch constraints.
3. Name exact memory ids, repo paths, branches/worktrees, commands, and verification evidence.
4. Separate user-stated preferences from verified repo or memory facts.
5. Include the next three actions in priority order.
6. Include stop conditions: when to ask the user, when to avoid mutation, and what would be unsafe.
7. Persist the handoff with `mm raw add --text "..."` only when the user asks for durable storage or the handoff is needed for later resumption.

## Completion Criteria

- A new agent can resume without reading the whole chat.
- The handoff names exact ids, paths, and commands.
- Open questions and risks are explicit.
- If persisted, the raw id is named.
