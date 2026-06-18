# MemoryMagico Design Notes

## The governing rule

Creation should be cheap. Promotion should be deliberate. Verification should be expensive.

That prevents the system from blocking early product planning while still stopping agents from marking imaginary work complete.

## Canonical relationships

Prefer child-to-parent fields as canonical:

- `phase.sprintId`
- `task.sprintId`
- `task.phaseId`
- `issue.initiativeIds`
- `sprint.initiativeIds`

Arrays like `sprint.taskIds`, `sprint.phaseIds`, and `phase.taskIds` are treated as convenience/derived fields and linted for drift when populated.

## Recommended future work

1. Add append-only event log for every state transition.
2. Add automatic graph edge creation during raw promotion and comment attachment.
3. Add SQLite backend option for high-concurrency agent runs.
4. Add richer wiki frontmatter enforcement.
5. Add dashboard support for initiatives and verification evidence.
