# Workflows

A cookbook of common MemoryMagico sequences. See [CLI.md](../CLI.md) for the full command reference and [README.md](../README.md) for the overall pitch and architecture.

## 1. Git-backed memory review

Inspect the memory diff before and after any meaningful agent run, the same way you'd review a code diff.

```bash
git status --short
mm lint --json
mm index status --json
git diff -- memory/
```

After accepting changes:

```bash
mm index rebuild
git diff -- memory/
git add memory/
git commit -m "memory: update project knowledge"
```

For risky or experimental changes, use a branch or worktree:

```bash
git switch -c memory/reconcile-audit-notes
# or
git worktree add ../repo-memory-audit -b memory/reconcile-audit-notes
```

## 2. Safe agent preflight

Run before an agent mutates memory or project files:

```bash
git status --short
mm doctor
mm lint --json
mm index status --json
mm resolve "<target>" --json
mm context "<target>" --deep --json
```

Stop if the target can't be resolved, the workspace is unhealthy, or the context shows the work is stale, duplicate, blocked, or already complete.

## 3. Capture and reconcile raw information

```bash
mm raw add --text "A user reported that image ingestion rejects valid PNG files."
mm raw list
mm raw show raw_...
mm search "image ingestion PNG"
mm resolve "image ingestion"
```

If the item is genuinely new:

```bash
mm discovery create "PNG image ingestion failure" \
  --source-raw-item-ids raw_... \
  --summary "Valid PNG files can be rejected as generic binary" \
  --recommended-action "promote_to_issue"

mm raw process raw_... discovery discovery_...
```

If it's stale or duplicate:

```bash
mm raw reject raw_...
# or
mm raw process raw_... issue issue_...
```

## 4. Promote raw intake to a wiki page

```bash
mm raw show raw_...
mm ingest raw_...
mm index rebuild
mm resolve "<new page title>"
mm context "<new page title>" --deep
```

Use this when the raw item should become canonical knowledge rather than an issue, task, or discovery.

## 5. Create an execution slice

```text
initiative -> sprint -> phase -> task -> evidence
```

```bash
mm initiative create "Improve agentic hardening" \
  --why "Agents need stricter command boundaries" \
  --outcome "Mutation commands are path-safe and testable"

mm sprint create "P0 hardening" \
  --goal "Fix command-boundary safety defects" \
  --initiative-ids init_...

mm phase create "CLI path containment" \
  --sprint-id sprint_... \
  --success-gates "all path traversal probes fail safely"

mm task create "Validate wiki kind before writing" \
  --sprint-id sprint_... \
  --phase-id phase_... \
  --acceptance "unsupported --kind values are rejected" \
  --verification "node --test tests/hardening.test.mjs"
```

Move a task to `in_progress` only once acceptance criteria and a verification plan exist:

```bash
mm task update task_... in_progress --note "Starting with path-policy tests."
```

Complete it only with evidence:

```bash
mm task complete task_... \
  --test "node --test tests/hardening.test.mjs" \
  --result "pass" \
  --evidence "tests/hardening.test.mjs" \
  --commits "abc1234"
```

## 6. Issue lifecycle with verification gates

Issues can be drafted cheaply, but need risk, acceptance criteria, and a verification plan before they're ready for agent execution.

```bash
mm issue create "Bound raw output" \
  --issue-type bug \
  --severity P1 \
  --confidence likely \
  --risk "Agents can accidentally print large or sensitive payloads" \
  --acceptance "raw show has byte and line caps" \
  --verification "large raw payload is truncated or spooled"

mm issue update issue_... ready_for_agent \
  --note "Ready after acceptance criteria and verification plan were added."

mm issue update issue_... in_progress \
  --branch "hardening/raw-output-caps"

mm issue verify issue_... \
  --test "node --test tests/hardening.test.mjs" \
  --result "pass" \
  --evidence "tests/hardening.test.mjs" \
  --pr "https://github.com/example/repo/pull/123"

mm issue close issue_...
```

## 7. Context retrieval for agents

Agents should pull context through the CLI rather than recursively reading the repo.

```bash
mm resolve "raw output caps" --json
mm search "raw output caps" --mode hybrid --explain
mm context "raw output caps" --deep --json
mm read memory/wiki/concepts/raw-intake.md --lines 80 --json
```

## 8. Maintenance

After meaningful memory changes:

```bash
mm lint
mm index rebuild
mm graph rebuild
mm dashboard build
```

When a JSON or JSONL file looks broken:

```bash
mm ledger inspect memory/inbox/raw-items.jsonl --tail 20
mm ledger repair memory/inbox/raw-items.jsonl --quarantine-bad-lines --dry-run
mm ledger repair memory/inbox/raw-items.jsonl --quarantine-bad-lines
```

## A typical safe mutation, end to end

```bash
# 1. Gather truth
mm doctor
mm index status
mm resolve "<target>"
mm context "<target>" --deep

# 2. Mutate through the CLI
mm task update task_... in_progress --note "Starting verified implementation."

# 3. Verify and rebuild
mm lint
mm index rebuild
mm task complete task_... --test "npm test" --result "pass" --evidence "test-output.txt"
```
