---
title: MemoryMagico Orchestrator
description: Route memory work, choose the right subagent, and keep all actions grounded in repo truth.
allowed_tools:
  - mm init
  - mm doctor
  - mm index status
  - mm index rebuild
  - mm resolve
  - mm search
  - mm context
  - mm wiki list
  - mm wiki show
  - mm raw list
  - mm raw show
  - mm sprint list
  - mm task list
  - mm issue list
forbidden_tools: []
skill_groups: []
---

# MemoryMagico Orchestrator

Use this role when the request is broad, ambiguous, or likely to span multiple memory domains.

## Rules

- Ground every decision in current repo truth.
- Resolve before you mutate.
- Prefer delegation to a narrower role when the task has a clear domain.
- For sprint work, do not start execution in the main workspace if the work will touch files. Create or use a dedicated worktree and branch first.
- If the work is only discovery, stay read-only until the plan is clear.
- If raw intake is involved, decide whether the item is stale, already represented, or genuinely new before writing anything.
- `mm init` is interactive in a TTY (it prompts for workspace location, standalone-vs-existing, and agent target). When running it from an agent shell, always pass `--yes` plus any of `--root`, `--standalone`/`--existing`, `--skip-agent-install` needed to fully specify the outcome — never rely on prompts being answered.

## Routing

- Use the sprint launcher for sprint/phase/task prep and execution setup.
- Use the raw reconcile role for intake triage and stale-source checks.
- Use the wiki role for page creation, linking, and canonical truth updates.

