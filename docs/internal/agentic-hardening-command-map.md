# Agentic Hardening Command Map

Current truth for the CLI command surface. `src/core/command-registry.mjs` and `src/commands/router.mjs` remain authoritative; the hardening tests assert that every registered command has a handler, useful help metadata, and working `mm help <command>` output.

| Command | Category | Reads | Writes | JSON | Lock | Notes |
|---|---|---:|---:|---:|---:|---|
| `mm help` | meta | yes | no | yes | no | Registry-generated help. |
| `mm commands` | meta | yes | no | yes | no | Lists registered command metadata. |
| `mm info` | meta | yes | no | no | no | Shows workspace roots and command surface. |
| `mm setup` | meta | yes | no | no | no | Shows supported invocation modes. |
| `mm status` | meta | yes | no | yes | no | Workspace summary. |
| `mm safe` | doctor | yes | no | yes | no | Combined preflight checks. |
| `mm audit` | doctor | yes | no | yes | no | Command-boundary audit probes. |
| `mm doctor` | doctor | yes | optional | yes | repo-write | Scaffold check; `--fix` can create missing scaffold pieces. |
| `mm lint` | doctor | yes | no | yes | no | Schema, referential, and lifecycle checks. |
| `mm ledger` | doctor | yes | optional | yes | repo-write | Inspects or repairs JSON/JSONL ledgers. |
| `mm lock` | doctor | yes | optional | yes | no | Lists, inspects, or breaks lock files. |
| `mm schema` | meta | yes | no | yes | no | Lists, shows, or validates schemas. |
| `mm add` | ingest | external file | raw intake | no | repo-write + raw-ingest | Imports an external file as raw intake. |
| `mm capture` | ingest | stdin/file/text | raw intake | yes | repo-write + raw-ingest | Captures notes or files as raw intake. |
| `mm install` | agent | roles/config | agent surfaces | no | no | Generates Claude/Codex agent files. |
| `mm update` | agent | roles/config | system roles + agent surfaces | no | no | Shorthand for `mm install all --update`. |
| `mm dashboard` | view | workspace | dashboard output | no | no | Builds or serves the dashboard. |
| `mm open` | read | memory entity | no | yes | no | Resolves and previews an entity. |
| `mm backlinks` | read | graph/workspace | no | yes | no | Shows inbound links. |
| `mm links` | read | graph/workspace | no | yes | no | Shows outbound links. |
| `mm template` | meta | yes | no | yes | no | Lists or shows built-in templates. |
| `mm tags` | meta | yes | optional | yes | repo-write | Lists, inspects, or renames tags. |
| `mm git` | meta | git repo | no | yes | no | Status, diff, affected files, logs, and commit hints. |
| `mm init` | workspace | workspace | scaffold + agent files | no | no | Initializes project/memory binding. |
| `mm index` | index | wiki/work/generated | optional generated index | yes | repo-write | Status/show are read-only; rebuild writes generated search artifacts. |
| `mm resolve` | read | index/pages | no | yes | no | Resolves IDs, titles, aliases, or natural-language refs. |
| `mm ingest` | ingest | raw/pages | pages/ledgers | no | repo-write | Promotes raw intake. |
| `mm claim` | work | claims | claims ledger | yes | repo-write | Adds, lists, or records contradictions. |
| `mm raw` | ingest | raw intake | optional raw state | yes | repo-write | Adds, lists, reconciles, rejects, archives, or cleans raw intake. |
| `mm container` | work | work records | work records | yes | repo-write | Lists, shows, creates, updates, or archives containers. |
| `mm initiative` | work | work records | work records | yes | repo-write | Lists, shows, creates, or updates initiatives. |
| `mm issue` | work | work records | work records | yes | repo-write | Creates and manages issue lifecycle/verification. |
| `mm discovery` | work | work records | work records | yes | repo-write | Creates and manages discoveries. |
| `mm comment` | work | work records | work records | yes | repo-write | Creates comments attached to entities. |
| `mm wiki` | wiki | wiki pages | wiki pages + index | yes | repo-write + workspace-write | Creates, updates, links, and reads wiki pages. |
| `mm graph` | graph | graph/workspace | relationships ledger | yes | repo-write | Adds, rebuilds, validates, and queries relationships. |
| `mm fsck` | doctor | yes | no | yes | no | Consistency checks across lint, graph, index, and IDs. |
| `mm repair` | doctor | workspace | optional normalized files | yes | repo-write | Repairs duplicate IDs, paths, or indexes. |
| `mm migrate` | workspace | migrations/workspace | optional migration state | yes | repo-write | Lists or runs one-time migrations. |
| `mm snapshot` | workspace | workspace/snapshots | snapshots or restored files | yes | repo-write | Creates, lists, or restores snapshots. |
| `mm sprint` | work | work records | work records | yes | repo-write | Creates, updates, or composes sprints from issues. |
| `mm phase` | work | work records | work records | yes | repo-write | Creates or updates sprint phases. |
| `mm task` | work | work records | work records | yes | repo-write | Creates, updates, or completes tasks with evidence. |
| `mm next` | work | work records | no | yes | no | Lists next actionable work. |
| `mm context` | read | index/pages/records | no | yes | no | Gathers focused context for agents. |
| `mm search` | read | index/pages | no | yes | no | Local retrieval over generated index. |
| `mm read` | read | file system | no | yes | no | Bounded safe file reads. |
| `mm frontmatter` | wiki | pages | optional page frontmatter | yes | repo-write | Reads or updates Markdown frontmatter. |
| `mm results` | meta | spooled results | optional prune | yes | repo-write | Lists, shows, or prunes large-result files. |
| `mm image` | ingest | image file | optional raw intake | yes | internal write lock for `add` | Inspects, encodes, or adds image files to raw intake. |

## Workflow-Critical Paths

- Audit, research, and bug-hunt findings should become `mm issue create` records once verified and actionable.
- Multiple verified issues can be converted into execution structure with `mm sprint compose <title> --issue-ids ...`.
- Custom execution structure can be built directly with `mm sprint create`, `mm phase create`, and `mm task create`.
- Help flags on path-taking commands must remain read-only usage output; hardening tests cover `mm add --help`, `mm raw add --help`, and `mm image ... --help`.
