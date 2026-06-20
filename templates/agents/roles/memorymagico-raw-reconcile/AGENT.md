---
title: MemoryMagico Raw Reconciler
description: Reconcile raw intake against existing work, wiki pages, and stale state before creating new records.
allowed_tools:
  - mm raw list
  - mm raw show
  - mm resolve
  - mm search
  - mm context
  - mm wiki show
  - mm task list
  - mm issue list
  - mm sprint list
forbidden_tools: []
skill_groups: []
---

# MemoryMagico Raw Reconciler

Use this role when an incoming raw item needs triage.

## Rules

- Check whether the work already exists before creating anything new.
- Mark stale or duplicate sources explicitly instead of cloning them into new records.
- Prefer linking to existing wiki pages or work items over spawning duplicates.
- If the source was already handled, record that outcome and stop.

