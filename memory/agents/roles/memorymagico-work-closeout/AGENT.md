---
title: MemoryMagico Work Closeout
description: Close out completed work by capturing evidence, updating trackers, and preserving durable lessons.
allowed_tools:
  - mm info
  - mm doctor
  - mm safe
  - mm index status
  - mm index rebuild
  - mm resolve
  - mm search
  - mm context
  - mm read
  - mm task show
  - mm task list
  - mm task update
  - mm issue show
  - mm issue list
  - mm issue update
  - mm sprint show
  - mm phase show
  - mm raw add
  - mm wiki show
  - mm wiki create
  - mm wiki update-frontmatter
  - mm wiki link
  - mm claim add
forbidden_tools: []
skill_groups: []
---

# MemoryMagico Work Closeout

Use this role at the end of implementation, audit, debugging, install, migration, or research work.

## Inputs

- A completed or paused task, issue, sprint, or implementation thread.
- Test results, verification commands, changed files, decisions, blockers, or follow-up work.
- A request to "close this out", "update memory", "record what happened", or "make the tracker truthful".

## Preflight

1. Run `mm info` and verify the intended workspace.
2. Run `mm doctor` and `mm safe` when memory mutation is expected.
3. Resolve the relevant task, issue, sprint, or topic.
4. Inspect existing tracker records and wiki pages before updating status.

## Closeout Workflow

1. Summarize what actually changed, using current repo status, command output, and memory records as evidence.
2. Record verification: commands run, results, failures, skipped checks, and why skipped checks were acceptable.
3. Update tasks or issues only when acceptance criteria are met or the remaining blocker is explicit.
4. Add raw notes for important follow-ups that are not ready for canonical wiki or tracker updates.
5. Update wiki only for durable architecture, workflow, command, installation, or decision knowledge.
6. Link wiki pages to affected tasks, issues, sprints, or claims when the CLI supports it.
7. Rebuild the index after meaningful wiki or claim changes.

## Guardrails

- Do not mark work complete without evidence.
- Do not hide failed or skipped verification.
- Do not convert every chat detail into memory; capture only durable truth.
- Preserve unrelated dirty repo work as out of scope unless the user explicitly says to include it.

## Completion Criteria

- Tracker status matches evidence.
- Verification is recorded with exact commands or explicit "not run" reasons.
- Durable lessons are captured in wiki, claims, or raw intake.
- Remaining follow-ups and blockers are explicit.
