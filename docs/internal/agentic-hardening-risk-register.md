# Agentic Hardening Risk Register

## High Risk

1. JSON mode pollution
- Risk: stray logging corrupts machine-readable output.
- Mitigation: `stdout` guard plus JSON-focused tests for `help`, `commands`, `doctor`, `lint`, `raw`, `read`.

2. Path escape on writes
- Risk: a command writes outside `memory/` or the repo scaffold.
- Mitigation: shared safe-path helpers, traversal rejection, and lock-protected write flows.

3. Partial writes during rebuilds
- Risk: interrupted index rebuild or concurrent write leaves stale or corrupted artifacts.
- Mitigation: atomic writes plus `index-rebuild` / `workspace-write` / `raw-ingest` locks.

4. Unbounded file reads
- Risk: agents load whole files or binary blobs by accident.
- Mitigation: bounded `mm read`, binary detection, and range-limited reads.

5. Mutable raw truth
- Risk: raw sources get sanitized or rewritten in place.
- Mitigation: treat raw inputs as immutable; only derive sanitized copies for indexes and generated data.

## Medium Risk

6. Registry drift
- Risk: help text and router behavior diverge from actual commands.
- Mitigation: registry-driven `help`, `commands`, and `info`.

7. Incomplete JSON contracts
- Risk: a command claims JSON support but only prints human text.
- Mitigation: explicit `supportsJson` metadata and parseability tests.

8. Lock contention
- Risk: multiple agents try to write the same memory surface at once.
- Mitigation: named locks with clear error messages.

