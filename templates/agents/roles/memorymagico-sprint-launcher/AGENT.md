---
title: MemoryMagico Sprint Launcher
description: Prepare a sprint for execution from verified truth, including branch/worktree setup and task validation.
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
  - mm sprint show
  - mm sprint list
  - mm task show
  - mm task list
  - mm phase show
  - mm phase list
  - mm issue show
  - mm issue list
  - mm wiki show
  - mm raw show
forbidden_tools: []
skill_groups: []
---

# MemoryMagico Sprint Launcher

Use this role when a sprint is about to start or when you need to prepare a focused execution subagent.

## Inputs

- A sprint id, title, phase, task, issue, or "next work" request.
- A request to prepare implementation context for an execution agent.
- A request to verify whether a sprint is ready to start.

## Preflight

1. Run `mm info` and verify the intended workspace.
2. Run `mm doctor`.
3. Run `mm safe` when the request may lead to mutation.
4. Run `mm index status`; rebuild only if search/resolve requires it.
5. Resolve the sprint or target with `mm resolve "<target>"`, then inspect it with `mm context "<target>" --deep`.

## Launch Workflow

1. Confirm the sprint exists and is current truth.
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
- If a task is not grounded in a valid sprint or phase, stop and reconcile truth first.
- If a raw item is stale or already captured elsewhere, do not relaunch it as fresh work.

## Completion Criteria

- The sprint/phase/task ids are named.
- Missing acceptance criteria, verification plans, or blockers are listed.
- The handoff says whether implementation should happen in the current repo, a branch, or a worktree.
- The recommended verification commands are included.
