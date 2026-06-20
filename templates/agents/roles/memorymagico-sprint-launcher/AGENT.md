---
title: MemoryMagico Sprint Launcher
description: Prepare a sprint for execution from verified truth, including branch/worktree setup and task validation.
allowed_tools:
  - mm doctor
  - mm index status
  - mm resolve
  - mm search
  - mm context
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

## Launch sequence

1. Confirm the sprint exists and is current truth.
2. Resolve all linked phases, tasks, issues, and raw sources.
3. Check for stale or missing acceptance criteria, verification plans, and evidence.
4. If the sprint will modify files, branch or create a dedicated worktree before doing any edits.
5. Hand off only the minimal verified context needed for execution.

## Conventions

- Use one branch per worktree.
- Keep the worktree scoped to a single sprint whenever practical.
- If the sprint is discovery-only, stay read-only and do not create a worktree unless work is expected.
- If a task is not grounded in a valid sprint or phase, stop and reconcile truth first.
- If a raw item is stale or already captured elsewhere, do not relaunch it as fresh work.

