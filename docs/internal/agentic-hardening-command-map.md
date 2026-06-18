# Agentic Hardening Command Map

Current truth for the main CLI surface after the first hardening pass.

| Command | Category | Reads | Writes | JSON | Lock | Path policy | Notes |
|---|---|---:|---:|---:|---:|---|---|
| `mm help` | meta | yes | no | yes | no | n/a | Registry-generated help. |
| `mm commands` | meta | yes | no | yes | no | n/a | Lists registered commands. |
| `mm info` | meta | yes | no | no | no | n/a | Workspace roots + command names. |
| `mm doctor` | doctor | yes | no | yes | no | repo/memory read | Scaffold check. |
| `mm lint` | doctor | yes | no | yes | no | repo/memory read | Workspace integrity check. |
| `mm ledger` | doctor | yes | yes | yes | yes | repo/memory read-write | JSON/JSONL inspect and repair. |
| `mm schema` | meta | yes | no | no | no | repo read | Schema inspection. |
| `mm add` | ingest | external source | raw ledger + raw asset | no | yes | external-source-read + memory-write | Copies external files into raw intake. |
| `mm install` | agent | selected roles + repo scaffold | `.claude/` / `.agents/` | no | yes | repo write | Generates selected agent surfaces. |
| `mm dashboard` | view | workspace | dashboard output | no | no | memory read/write | Control surface. |
| `mm init` | workspace | workspace | scaffold + generated + bridge agent | no | yes | repo/memory write | Initializes workspace and installs the bridge agent. |
| `mm index` | index | wiki/work/generated | generated search index | yes | yes | generated-write | Rebuild/status/show. |
| `mm resolve` | read | index + pages | no | yes | no | generated-read + memory-read | Human ref resolution; requires fresh index. |
| `mm ingest` | ingest | raw + pages | pages + ledgers | no | yes | memory read/write | Raw promotion. |
| `mm claim` | work | wiki claims | claims ledger | no | no | memory write | Claim management. |
| `mm raw` | ingest | raw ledger + raw files | raw ledger + processed files | yes for list/show | yes | memory write | Raw triage. |
| `mm container` | work | work records | work ledger | no | no | memory write | Containers. |
| `mm initiative` | work | work records | work pages/ledger | no | no | memory write | Initiatives. |
| `mm issue` | work | work records | work pages/ledger | no | no | memory write | Issues. |
| `mm discovery` | work | work records | work pages/ledger | no | no | memory write | Discoveries. |
| `mm comment` | work | work records | work pages/ledger | no | no | memory write | Comments. |
| `mm wiki` | wiki | wiki pages | wiki pages + log + index | no | yes | memory write | Canonical pages. |
| `mm graph` | graph | relationships + pages | relationships ledger | no | no | memory write | Relationship graph. |
| `mm sprint` | work | work records | work pages/ledger | no | no | memory write | Sprints. |
| `mm phase` | work | work records | work pages/ledger | no | no | memory write | Phases. |
| `mm task` | work | work records | work pages/ledger | no | no | memory write | Tasks. |
| `mm next` | work | tasks + sprints | no | no | no | memory read | Next work queue. |
| `mm context` | read | index + pages + related records | no | yes | no | generated-read + memory-read | Focused context. |
| `mm search` | read | index + pages | no | yes | no | generated-read + memory-read | Retrieval search. |
| `mm read` | read | file system | no | yes | no | memory-read / repo-read | Bounded reads. |
