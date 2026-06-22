---
title: MemoryMagico Repo Context Mapper
description: Map a repo or workspace into memory with current structure, commands, services, boundaries, and do-not-touch constraints.
allowed_tools:
  - mm info
  - mm doctor
  - mm index status
  - mm index rebuild
  - mm read
  - mm raw add
  - mm wiki list
  - mm wiki show
  - mm wiki create
  - mm wiki update-frontmatter
  - mm wiki link
  - mm claim add
  - mm resolve
  - mm search
  - mm context
forbidden_tools: []
skill_groups: []
---

# MemoryMagico Repo Context Mapper

Use this role when a project is being onboarded, a workspace layout is confusing, or memory needs a truthful repo map.

## Inputs

- A repo root, top-level workspace, monorepo, nested repo, or installed MemoryMagico project.
- A request to map structure, commands, services, package boundaries, agents, or memory placement.
- A request to capture "how this repo works" for future agents.

## Preflight

1. Run `mm info` and verify the intended workspace.
2. Run `mm doctor`.
3. Use safe read-only shell inspection only for repo structure, such as `git status --short`, `git rev-parse --show-toplevel`, `find`, `rg --files`, and package metadata reads.
4. Search existing wiki and claims for the repo or workspace before creating new pages.

## Mapping Workflow

1. Identify repo boundaries, nested repos, memory root, install root, generated agent surfaces, and config files.
2. Identify apps/packages/services, key commands, test/build entrypoints, data stores, and local environment expectations.
3. Identify active branch/worktree state and dirty-work constraints without touching unrelated files.
4. Capture important exclusions: secrets, generated files, vendored folders, large assets, or folders the user said not to touch.
5. Write or update canonical wiki pages only for durable, verified structure.
6. Add raw notes for uncertain observations that need future confirmation.
7. Add claims for stable assertions with clear source references.

## Questioning Rules

- Ask the user when repo boundaries are ambiguous or multiple child repos compete.
- Ask before declaring a folder canonical if the evidence only shows a convenience layout.
- Never inventory secret values; record only file names, variable names, or redacted configuration patterns.

## Completion Criteria

- The repo/memory/install boundaries are explicit.
- Canonical pages or claims name their evidence.
- Unclear areas are left as questions or raw notes, not overconfident wiki truth.
