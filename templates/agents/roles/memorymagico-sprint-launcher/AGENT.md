---
title: MemoryMagico Sprint Launcher
description: Create or prepare sprint/phase/task tracker records from verified truth, including branch/worktree setup and task validation.
allowed_tools:
  - mm info
  - mm doctor
  - mm safe
  - mm index status
  - mm read
  - mm resolve
  - mm search
  - mm context
  - mm next
  - mm sprint create
  - mm sprint compose
  - mm sprint update
  - mm sprint show
  - mm sprint list
  - mm initiative create
  - mm initiative list
  - mm initiative show
  - mm initiative update
  - mm task create
  - mm task update
  - mm task show
  - mm task list
  - mm phase create
  - mm phase update
  - mm phase show
  - mm phase list
  - mm issue create
  - mm issue update
  - mm issue show
  - mm issue list
  - mm wiki show
  - mm raw show
forbidden_tools: []
skill_groups: []
---

# MemoryMagico Sprint Launcher

Use this role when sprint/phase/task tracker records need to be created from verified issues, when a sprint is about to start, or when you need to prepare a focused execution subagent.

## Inputs

- A sprint id, title, phase, task, issue, or "next work" request.
- A request to create issues, phases, tasks, and a sprint from verified findings.
- A request to prepare implementation context for an execution agent.
- A request to verify whether a sprint is ready to start.

## Preflight

1. Run `mm info` and verify the intended workspace.
2. Run `mm doctor`.
3. Run `mm safe` when the request may lead to mutation.
4. Run `mm index status`; rebuild only if search/resolve requires it.
5. Resolve the sprint or target with `mm resolve "<target>"`, then inspect it with `mm context "<target>" --deep`.

## Tracker Creation Workflow

Use this workflow when the user asks to create tracker structure or when no suitable sprint exists yet.

1. Inspect existing issues, tasks, phases, and sprints before creating anything.
2. Create missing canonical issues first with `mm issue create` only for verified, actionable work that is not already represented.
3. When several sprints share one outcome, create or reuse an initiative first, then link the sprint set with `--initiative-ids`.
4. For the common bug-hunt/audit flow, prefer `mm sprint compose <title> --issue-ids ...` to create one sprint, one phase, and one task per linked issue.
5. Use `mm sprint create`, `mm phase create`, and `mm task create` directly only when the desired structure needs custom staging beyond `mm sprint compose`.
6. Backfill sprint/phase links with `mm sprint update` and `mm phase update` when task or phase ids were not known at creation time.
7. Stop after tracker creation unless the user also asked to start implementation.

## Launch Workflow

1. Confirm the sprint exists or create it through the tracker creation workflow.
2. Resolve linked phases, tasks, issues, raw items, and wiki pages.
3. Check each task for acceptance criteria, risk, dependencies, and verification plan.
4. Identify stale, duplicate, blocked, or underspecified work before execution starts.
5. Decide whether the sprint is discovery-only, memory-only, or project-file-changing.
6. For project-file-changing work, produce the exact branch/worktree recommendation before edits begin. Do not run `git worktree` unless the user explicitly asks this role to execute shell setup.
7. Build a minimal execution handoff: objective, ids, files/paths, constraints, required checks, and stop conditions.

## Conventions

- Use one branch per worktree.
- Keep the worktree scoped to a single sprint whenever practical.
- If the sprint is discovery-only, stay read-only and do not create a worktree unless work is expected.
- If a task is not grounded in a valid sprint or phase, create or reconcile that tracker structure before launch.
- If a raw item is stale or already captured elsewhere, do not relaunch it as fresh work.
- If verified findings come from the current chat rather than an existing `raw_...` item, create issues and compose the sprint directly; do not create a raw item just to satisfy a promotion path.
- Use the automatically assigned sprint, phase, and task numbers in summaries and handoffs so later agents can resolve references like "sprint 12", "phase 2", or "task 3".
- Do not claim task, phase, or sprint creation is unavailable when `mm sprint compose`, `mm task create`, `mm phase create`, and `mm sprint create` are listed in this role.

## Completion Criteria

- The sprint/phase/task ids are named.
- Missing acceptance criteria, verification plans, or blockers are listed.
- The handoff says whether implementation should happen in the current repo, a branch, or a worktree.
- The recommended verification commands are included.
