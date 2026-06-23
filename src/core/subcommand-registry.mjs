const DEFAULT_LOCK_SCOPE = 'repo-write';

const CONTRACTS = [
  { command: 'help', action: 'show', domain: 'system', summary: 'Show top-level or command help.', usage: 'mm help [command] [action]', readOnly: true, lockScope: null, roleTags: ['system.help'], dashboard: false, examples: ['mm help issue create'] },
  { command: 'commands', action: 'list', domain: 'system', summary: 'List command metadata.', usage: 'mm commands [--json] [--subcommands]', readOnly: true, lockScope: null, roleTags: ['system.commands.read'], dashboard: false, examples: ['mm commands --json --subcommands'] },
  { command: 'info', action: 'show', domain: 'system', summary: 'Show workspace roots and command surface.', usage: 'mm info', readOnly: true, lockScope: null, roleTags: ['system.info.read'], dashboard: false, examples: ['mm info'] },
  { command: 'status', action: 'show', domain: 'system', summary: 'Summarize workspace, git, index, and dashboard state.', usage: 'mm status [--json]', readOnly: true, lockScope: null, roleTags: ['system.status.read'], dashboard: true, examples: ['mm status --json'] },

  { command: 'doctor', action: 'check', domain: 'system', summary: 'Validate workspace scaffold.', usage: 'mm doctor [--json]', readOnly: true, lockScope: null, roleTags: ['system.doctor.read'], dashboard: true, examples: ['mm doctor --json'] },
  { command: 'doctor', action: 'fix', domain: 'system', summary: 'Create missing workspace scaffold files.', usage: 'mm doctor --fix [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, matchFlags: ['--fix'], roleTags: ['system.doctor.write'], dashboard: false, examples: ['mm doctor --fix'] },
  { command: 'safe', action: 'check', domain: 'system', summary: 'Run pre-mutation safety checks.', usage: 'mm safe [--json]', readOnly: true, lockScope: null, roleTags: ['system.safe.read'], dashboard: true, examples: ['mm safe --json'] },
  { command: 'audit', action: 'check', domain: 'system', summary: 'Run command-boundary audit probes.', usage: 'mm audit [--json]', readOnly: true, lockScope: null, roleTags: ['system.audit.read'], dashboard: true, examples: ['mm audit --json'] },
  { command: 'lint', action: 'check', domain: 'system', summary: 'Check memory records and invariants.', usage: 'mm lint [--json]', readOnly: true, lockScope: null, roleTags: ['system.lint.read'], dashboard: true, examples: ['mm lint --json'] },
  { command: 'fsck', action: 'check', domain: 'system', summary: 'Check lint, graph, index, and duplicate-id health.', usage: 'mm fsck [--json]', readOnly: true, lockScope: null, roleTags: ['system.fsck.read'], dashboard: true, examples: ['mm fsck --json'] },
  { command: 'repair', action: 'run', domain: 'system', summary: 'Repair duplicate ids, paths, or indexes.', usage: 'mm repair <duplicate-ids|paths|indexes> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['system.repair.write'], dashboard: false, examples: ['mm repair indexes'] },
  { command: 'index', action: 'status', domain: 'system', summary: 'Inspect search index state.', usage: 'mm index status [--json]', readOnly: true, lockScope: null, roleTags: ['system.index.read'], dashboard: true, examples: ['mm index status --json'] },
  { command: 'index', action: 'rebuild', domain: 'system', summary: 'Rebuild generated search index artifacts.', usage: 'mm index rebuild [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['system.index.write'], dashboard: false, examples: ['mm index rebuild'] },
  { command: 'schema', action: 'list', domain: 'system', summary: 'List schema definitions.', usage: 'mm schema list [--json]', readOnly: true, lockScope: null, roleTags: ['system.schema.read'], dashboard: false, examples: ['mm schema list'] },
  { command: 'schema', action: 'show', domain: 'system', summary: 'Show a schema definition.', usage: 'mm schema show <file> [--json]', readOnly: true, lockScope: null, roleTags: ['system.schema.read'], dashboard: false, examples: ['mm schema show wiki-page.schema.json'] },
  { command: 'snapshot', action: 'create', domain: 'system', summary: 'Create a point-in-time memory snapshot.', usage: 'mm snapshot create [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['system.snapshot.write'], dashboard: false, examples: ['mm snapshot create'] },
  { command: 'snapshot', action: 'list', domain: 'system', summary: 'List memory snapshots.', usage: 'mm snapshot list [--json]', readOnly: true, lockScope: null, roleTags: ['system.snapshot.read'], dashboard: false, examples: ['mm snapshot list'] },
  { command: 'snapshot', action: 'restore', domain: 'system', summary: 'Restore a memory snapshot.', usage: 'mm snapshot restore <id> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['system.snapshot.write'], dashboard: false, examples: ['mm snapshot restore snapshot_...'] },
  { command: 'install', action: 'run', domain: 'system', summary: 'Generate Claude and Codex agent surfaces.', usage: 'mm install <claude|codex|all> [--update] [--dry-run]', readOnly: false, lockScope: null, roleTags: ['system.agent.install'], dashboard: false, examples: ['mm install all --update'] },
  { command: 'update', action: 'run', domain: 'system', summary: 'Refresh bundled MemoryMagico system roles.', usage: 'mm update [--install-root <path>] [--roles role_a,role_b] [--dry-run]', readOnly: false, lockScope: null, roleTags: ['system.agent.update'], dashboard: false, examples: ['mm update --dry-run'] },

  { command: 'add', action: 'file', domain: 'intake', summary: 'Import an external file as raw intake.', usage: 'mm add <path> [--move]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.create'], dashboard: false, examples: ['mm add ./notes.md'] },
  { command: 'capture', action: 'add', domain: 'intake', summary: 'Capture a note, stdin payload, or file into raw intake.', usage: 'mm capture <text|path> [--stdin] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.create'], dashboard: false, examples: ['mm capture --stdin'] },
  { command: 'raw', action: 'add', domain: 'intake', summary: 'Add text to raw intake.', usage: 'mm raw add <text> | mm raw add --stdin [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.create'], dashboard: true, examples: ['mm raw add "follow up"'] },
  { command: 'raw', action: 'add-image', domain: 'intake', summary: 'Add an image to raw intake.', usage: 'mm raw add-image <path> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.create'], dashboard: true, examples: ['mm raw add-image ./screenshot.png'] },
  { command: 'raw', action: 'list', domain: 'intake', summary: 'List unreconciled raw items.', usage: 'mm raw list [--json]', readOnly: true, lockScope: null, roleTags: ['intake.raw.read'], dashboard: true, examples: ['mm raw list --json'] },
  { command: 'raw', action: 'list-all', domain: 'intake', summary: 'List all raw items.', usage: 'mm raw list-all [--json]', readOnly: true, lockScope: null, roleTags: ['intake.raw.read'], dashboard: true, examples: ['mm raw list-all'] },
  { command: 'raw', action: 'show', domain: 'intake', summary: 'Show a raw item and bounded payload preview.', usage: 'mm raw show <id> [--json]', readOnly: true, lockScope: null, roleTags: ['intake.raw.read'], dashboard: true, examples: ['mm raw show raw_... --json'] },
  { command: 'raw', action: 'process', domain: 'intake', summary: 'Mark raw intake processed against an existing target.', usage: 'mm raw process <id> [target-kind target-id [target-path]] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.promote'], dashboard: true, examples: ['mm raw process raw_... issue issue_...'] },
  { command: 'raw', action: 'promote', domain: 'intake', summary: 'Canonical alias for processing raw intake into an existing target.', usage: 'mm raw promote <id> --to <kind> --id <target-id> [--path <target-path>] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.promote'], dashboard: true, examples: ['mm raw promote raw_... --to issue --id issue_...'] },
  { command: 'raw', action: 'reject', domain: 'intake', summary: 'Reject a raw item.', usage: 'mm raw reject <id> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.reject'], dashboard: true, examples: ['mm raw reject raw_...'] },
  { command: 'raw', action: 'archive', domain: 'intake', summary: 'Archive a raw item.', usage: 'mm raw archive <id> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.archive'], dashboard: true, examples: ['mm raw archive raw_...'] },
  { command: 'raw', action: 'cleanup', domain: 'intake', summary: 'Find or move orphan raw source files.', usage: 'mm raw cleanup [--dry-run] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.cleanup'], dashboard: false, examples: ['mm raw cleanup --dry-run'] },
  { command: 'ingest', action: 'source', domain: 'intake', summary: 'Promote raw intake into a canonical wiki source page.', usage: 'mm ingest <raw-id> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.promote', 'knowledge.wiki.create'], dashboard: false, examples: ['mm ingest raw_...'] },
  { command: 'image', action: 'inspect', domain: 'intake', summary: 'Inspect image metadata safely.', usage: 'mm image inspect <path> [--json]', readOnly: true, lockScope: null, roleTags: ['intake.image.read'], dashboard: false, examples: ['mm image inspect ./screenshot.png'] },
  { command: 'image', action: 'encode', domain: 'intake', summary: 'Encode an image safely for downstream use.', usage: 'mm image encode <path> [--json]', readOnly: true, lockScope: null, roleTags: ['intake.image.read'], dashboard: false, examples: ['mm image encode ./screenshot.png --json'] },
  { command: 'image', action: 'add', domain: 'intake', summary: 'Add an image file as raw intake.', usage: 'mm image add <path> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['intake.raw.create'], dashboard: false, examples: ['mm image add ./screenshot.png'] },

  { command: 'wiki', action: 'list', domain: 'knowledge', summary: 'List wiki pages.', usage: 'mm wiki list [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.wiki.read'], dashboard: true, examples: ['mm wiki list'] },
  { command: 'wiki', action: 'show', domain: 'knowledge', summary: 'Show a wiki page.', usage: 'mm wiki show <ref> [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.wiki.read'], dashboard: true, examples: ['mm wiki show overview'] },
  { command: 'wiki', action: 'create', domain: 'knowledge', summary: 'Create a canonical wiki page.', usage: 'mm wiki create <title> [--kind note] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['knowledge.wiki.create'], dashboard: true, examples: ['mm wiki create "Search Architecture" --kind concept'] },
  { command: 'wiki', action: 'update-frontmatter', domain: 'knowledge', summary: 'Update wiki page frontmatter.', usage: 'mm wiki update-frontmatter <path> [flags] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['knowledge.wiki.update'], dashboard: false, examples: ['mm wiki update-frontmatter wiki/overview.md --title Overview'] },
  { command: 'wiki', action: 'link', domain: 'knowledge', summary: 'Append a wiki link between canonical pages.', usage: 'mm wiki link <from> <to> [--json]', readOnly: false, lockScope: null, roleTags: ['knowledge.wiki.link'], dashboard: true, examples: ['mm wiki link overview search-architecture'] },
  { command: 'wiki', action: 'backlinks', domain: 'knowledge', summary: 'List backlinks for a wiki target.', usage: 'mm wiki backlinks <target> [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.wiki.read'], dashboard: true, examples: ['mm wiki backlinks overview'] },
  { command: 'frontmatter', action: 'get', domain: 'knowledge', summary: 'Read Markdown frontmatter.', usage: 'mm frontmatter get <path> [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.frontmatter.read'], dashboard: false, examples: ['mm frontmatter get wiki/overview.md'] },
  { command: 'frontmatter', action: 'set', domain: 'knowledge', summary: 'Update Markdown frontmatter.', usage: 'mm frontmatter set <path> [flags] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['knowledge.frontmatter.update'], dashboard: false, examples: ['mm frontmatter set wiki/overview.md --title Overview'] },
  { command: 'claim', action: 'list', domain: 'knowledge', summary: 'List claims.', usage: 'mm claim list [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.claim.read'], dashboard: true, examples: ['mm claim list'] },
  { command: 'claim', action: 'add', domain: 'knowledge', summary: 'Add a claim.', usage: 'mm claim add <scope> <text> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['knowledge.claim.create'], dashboard: true, examples: ['mm claim add architecture "Markdown pages are canonical."'] },
  { command: 'claim', action: 'contradict', domain: 'knowledge', summary: 'Record a contradiction between claims.', usage: 'mm claim contradict <claim-a> <claim-b> <note> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['knowledge.claim.update'], dashboard: true, examples: ['mm claim contradict claim_a claim_b "Repo truth differs"'] },
  { command: 'comment', action: 'list', domain: 'knowledge', summary: 'List comments.', usage: 'mm comment list [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.comment.read'], dashboard: true, examples: ['mm comment list'] },
  { command: 'comment', action: 'show', domain: 'knowledge', summary: 'Show a comment.', usage: 'mm comment show <id> [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.comment.read'], dashboard: true, examples: ['mm comment show comment_...'] },
  { command: 'comment', action: 'add', domain: 'knowledge', summary: 'Attach a comment to a memory entity.', usage: 'mm comment add <target-ref> <body> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['knowledge.comment.create'], dashboard: true, examples: ['mm comment add issue_... "Reviewer confirmed this."'] },
  { command: 'read', action: 'file', domain: 'knowledge', summary: 'Read a bounded repo or memory file range.', usage: 'mm read [--repo|--memory] <path> [--lines N] [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.file.read'], dashboard: false, examples: ['mm read --repo README.md --json', 'mm read --memory wiki/index.md --lines 80'] },
  { command: 'open', action: 'file', domain: 'knowledge', summary: 'Open a memory or repo file in the host app.', usage: 'mm open <path-or-ref>', readOnly: true, lockScope: null, roleTags: ['knowledge.file.open'], dashboard: false, examples: ['mm open wiki/overview.md'] },
  { command: 'resolve', action: 'entity', domain: 'knowledge', summary: 'Resolve a human reference to entities.', usage: 'mm resolve <query> [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.resolve.read'], dashboard: true, examples: ['mm resolve "approval bug"'] },
  { command: 'context', action: 'entity', domain: 'knowledge', summary: 'Build context for a human reference.', usage: 'mm context <query> [--deep] [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.context.read'], dashboard: true, examples: ['mm context "approval bug" --deep'] },
  { command: 'search', action: 'query', domain: 'knowledge', summary: 'Search indexed memory.', usage: 'mm search <query> [--json]', readOnly: true, lockScope: null, roleTags: ['knowledge.search.read'], dashboard: true, examples: ['mm search "approval bug" --json'] },

  { command: 'issue', action: 'create', domain: 'work', summary: 'Create an issue record.', usage: 'mm issue create <title> [--severity P1] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['issue.created'], roleTags: ['work.issue.create'], dashboard: true, examples: ['mm issue create "Fix approval bypass" --severity P1 --confidence confirmed'] },
  { command: 'issue', action: 'list', domain: 'work', summary: 'List issue records.', usage: 'mm issue list [--status draft] [--json]', readOnly: true, lockScope: null, roleTags: ['work.issue.read'], dashboard: true, examples: ['mm issue list --json'] },
  { command: 'issue', action: 'show', domain: 'work', summary: 'Show an issue record.', usage: 'mm issue show <id> [--json]', readOnly: true, lockScope: null, roleTags: ['work.issue.read'], dashboard: true, examples: ['mm issue show issue_...'] },
  { command: 'issue', action: 'update', domain: 'work', summary: 'Update an issue record.', usage: 'mm issue update <id> [flags] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['issue.updated'], roleTags: ['work.issue.update'], dashboard: true, examples: ['mm issue update issue_... --status ready_for_agent'] },
  { command: 'issue', action: 'close', domain: 'work', summary: 'Close an issue with evidence.', usage: 'mm issue close <id> --test <cmd> --result pass [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, requiredEvidence: ['test', 'result'], lifecycleEffects: ['issue.closed'], roleTags: ['work.issue.close'], dashboard: true, examples: ['mm issue close issue_... --test "npm test" --result pass'] },
  { command: 'issue', action: 'verify', domain: 'work', summary: 'Verify an issue with evidence.', usage: 'mm issue verify <id> --test <cmd> --result pass [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, requiredEvidence: ['test', 'result'], lifecycleEffects: ['issue.verified'], roleTags: ['work.issue.verify'], dashboard: true, examples: ['mm issue verify issue_... --test "npm test" --result pass'] },
  { command: 'issue', action: 'block', domain: 'work', summary: 'Mark an issue blocked.', usage: 'mm issue block <id> --note <reason> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['issue.blocked'], roleTags: ['work.issue.update'], dashboard: true, examples: ['mm issue block issue_... --note "waiting on schema"'] },
  { command: 'issue', action: 'unblock', domain: 'work', summary: 'Unblock an issue.', usage: 'mm issue unblock <id> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['issue.unblocked'], roleTags: ['work.issue.update'], dashboard: true, examples: ['mm issue unblock issue_...'] },
  { command: 'issue', action: 'link-pr', domain: 'work', summary: 'Link a pull request to an issue.', usage: 'mm issue link-pr <id> <url> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['issue.pr_linked'], roleTags: ['work.issue.update'], dashboard: true, examples: ['mm issue link-pr issue_... https://github.com/org/repo/pull/123'] },

  { command: 'task', action: 'create', domain: 'work', summary: 'Create a task record.', usage: 'mm task create <title> --sprint-id <sprint_id> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['task.created'], roleTags: ['work.task.create'], dashboard: true, examples: ['mm task create "Patch guard" --sprint-id sprint_...'] },
  { command: 'task', action: 'list', domain: 'work', summary: 'List task records.', usage: 'mm task list [--status todo] [--json]', readOnly: true, lockScope: null, roleTags: ['work.task.read'], dashboard: true, examples: ['mm task list --json'] },
  { command: 'task', action: 'show', domain: 'work', summary: 'Show a task record.', usage: 'mm task show <id> [--json]', readOnly: true, lockScope: null, roleTags: ['work.task.read'], dashboard: true, examples: ['mm task show task_...'] },
  { command: 'task', action: 'update', domain: 'work', summary: 'Update task status or metadata.', usage: 'mm task update <id> <status> [flags] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['task.updated'], roleTags: ['work.task.update'], dashboard: true, examples: ['mm task update task_... in_progress --note "Started"'] },
  { command: 'task', action: 'complete', domain: 'work', summary: 'Complete a task with evidence.', usage: 'mm task complete <id> --test <cmd> --result pass [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, requiredEvidence: ['test', 'result'], lifecycleEffects: ['task.completed'], roleTags: ['work.task.complete'], dashboard: true, examples: ['mm task complete task_... --test "npm test" --result pass'] },
  { command: 'sprint', action: 'create', domain: 'work', summary: 'Create a sprint record.', usage: 'mm sprint create <title> --goal <goal> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['sprint.created'], roleTags: ['work.sprint.create'], dashboard: true, examples: ['mm sprint create "Audit closeout" --goal "Resolve verified findings"'] },
  { command: 'sprint', action: 'compose', domain: 'work', summary: 'Compose a sprint, phase, and tasks from issues.', usage: 'mm sprint compose <title> --issue-ids a,b [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['sprint.created', 'phase.created', 'task.created'], roleTags: ['work.sprint.compose', 'work.phase.create', 'work.task.create'], dashboard: true, examples: ['mm sprint compose "Bug fix sprint" --issue-ids issue_a,issue_b'] },
  { command: 'sprint', action: 'list', domain: 'work', summary: 'List sprint records.', usage: 'mm sprint list [--json]', readOnly: true, lockScope: null, roleTags: ['work.sprint.read'], dashboard: true, examples: ['mm sprint list --json'] },
  { command: 'sprint', action: 'show', domain: 'work', summary: 'Show a sprint record.', usage: 'mm sprint show <id> [--json]', readOnly: true, lockScope: null, roleTags: ['work.sprint.read'], dashboard: true, examples: ['mm sprint show sprint_...'] },
  { command: 'sprint', action: 'update', domain: 'work', summary: 'Update a sprint record.', usage: 'mm sprint update <id> <status> [flags] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['sprint.updated'], roleTags: ['work.sprint.update'], dashboard: true, examples: ['mm sprint update sprint_... active --note "Started"'] },
  { command: 'phase', action: 'create', domain: 'work', summary: 'Create a phase record.', usage: 'mm phase create <title> --sprint-id <sprint_id> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['phase.created'], roleTags: ['work.phase.create'], dashboard: true, examples: ['mm phase create "Fixes" --sprint-id sprint_...'] },
  { command: 'phase', action: 'list', domain: 'work', summary: 'List phase records.', usage: 'mm phase list [--json]', readOnly: true, lockScope: null, roleTags: ['work.phase.read'], dashboard: true, examples: ['mm phase list --json'] },
  { command: 'phase', action: 'show', domain: 'work', summary: 'Show a phase record.', usage: 'mm phase show <id> [--json]', readOnly: true, lockScope: null, roleTags: ['work.phase.read'], dashboard: true, examples: ['mm phase show phase_...'] },
  { command: 'phase', action: 'update', domain: 'work', summary: 'Update a phase record.', usage: 'mm phase update <id> <status> [flags] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, lifecycleEffects: ['phase.updated'], roleTags: ['work.phase.update'], dashboard: true, examples: ['mm phase update phase_... in_progress'] },
  { command: 'discovery', action: 'create', domain: 'work', summary: 'Create a discovery record.', usage: 'mm discovery create <title> [--severity P1] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['work.discovery.create'], dashboard: true, examples: ['mm discovery create "Approval flow gap" --severity P1'] },
  { command: 'discovery', action: 'list', domain: 'work', summary: 'List discoveries.', usage: 'mm discovery list [--json]', readOnly: true, lockScope: null, roleTags: ['work.discovery.read'], dashboard: true, examples: ['mm discovery list --status needs_research'] },
  { command: 'discovery', action: 'show', domain: 'work', summary: 'Show a discovery.', usage: 'mm discovery show <id> [--json]', readOnly: true, lockScope: null, roleTags: ['work.discovery.read'], dashboard: true, examples: ['mm discovery show discovery_...'] },
  { command: 'discovery', action: 'update', domain: 'work', summary: 'Update a discovery.', usage: 'mm discovery update <id> <status> [flags] [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['work.discovery.update'], dashboard: true, examples: ['mm discovery update discovery_... promoted_to_issue --promoted-issue-id issue_...'] },
  { command: 'container', action: 'create', domain: 'work', summary: 'Create a container record.', usage: 'mm container create <title> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['work.container.create'], dashboard: true, examples: ['mm container create "Approval System"'] },
  { command: 'container', action: 'list', domain: 'work', summary: 'List containers.', usage: 'mm container list [--json]', readOnly: true, lockScope: null, roleTags: ['work.container.read'], dashboard: true, examples: ['mm container list'] },
  { command: 'container', action: 'show', domain: 'work', summary: 'Show a container.', usage: 'mm container show <id> [--json]', readOnly: true, lockScope: null, roleTags: ['work.container.read'], dashboard: true, examples: ['mm container show container_...'] },
  { command: 'container', action: 'update', domain: 'work', summary: 'Update a container.', usage: 'mm container update <id> <status> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['work.container.update'], dashboard: true, examples: ['mm container update container_... active'] },
  { command: 'container', action: 'archive', domain: 'work', summary: 'Archive a container.', usage: 'mm container archive <id> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['work.container.archive'], dashboard: true, examples: ['mm container archive container_...'] },
  { command: 'initiative', action: 'create', domain: 'work', summary: 'Create an initiative record.', usage: 'mm initiative create <title> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['work.initiative.create'], dashboard: true, examples: ['mm initiative create "Client dashboard"'] },
  { command: 'initiative', action: 'list', domain: 'work', summary: 'List initiatives.', usage: 'mm initiative list [--json]', readOnly: true, lockScope: null, roleTags: ['work.initiative.read'], dashboard: true, examples: ['mm initiative list'] },
  { command: 'initiative', action: 'show', domain: 'work', summary: 'Show an initiative.', usage: 'mm initiative show <id> [--json]', readOnly: true, lockScope: null, roleTags: ['work.initiative.read'], dashboard: true, examples: ['mm initiative show init_...'] },
  { command: 'initiative', action: 'update', domain: 'work', summary: 'Update an initiative.', usage: 'mm initiative update <id> <status> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['work.initiative.update'], dashboard: true, examples: ['mm initiative update init_... active'] },
  { command: 'initiative', action: 'archive', domain: 'work', summary: 'Archive an initiative.', usage: 'mm initiative archive <id> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['work.initiative.archive'], dashboard: true, examples: ['mm initiative archive init_...'] },

  { command: 'graph', action: 'add', domain: 'graph', summary: 'Add a typed graph edge.', usage: 'mm graph add <from> <type> <to> [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['graph.edge.create'], dashboard: true, examples: ['mm graph add issue_... blocks task_...'] },
  { command: 'graph', action: 'list', domain: 'graph', summary: 'List graph edges.', usage: 'mm graph list [--json]', readOnly: true, lockScope: null, roleTags: ['graph.edge.read'], dashboard: true, examples: ['mm graph list'] },
  { command: 'graph', action: 'validate', domain: 'graph', summary: 'Validate graph edges.', usage: 'mm graph validate [--json]', readOnly: true, lockScope: null, roleTags: ['graph.validate.read'], dashboard: true, examples: ['mm graph validate --json'] },
  { command: 'graph', action: 'rebuild', domain: 'graph', summary: 'Rebuild derived graph edges.', usage: 'mm graph rebuild [--json]', readOnly: false, lockScope: DEFAULT_LOCK_SCOPE, roleTags: ['graph.rebuild.write'], dashboard: false, examples: ['mm graph rebuild'] },
  { command: 'graph', action: 'neighborhood', domain: 'graph', summary: 'Show graph neighbors for an entity.', usage: 'mm graph neighborhood <id> [--json]', readOnly: true, lockScope: null, roleTags: ['graph.edge.read'], dashboard: true, examples: ['mm graph neighborhood issue_...'] },
];

const CONTRACT_BY_ID = new Map();
const CONTRACTS_BY_COMMAND = new Map();
for (const contract of CONTRACTS) {
  const normalized = {
    args: [],
    flags: [],
    lifecycleEffects: [],
    requiredEvidence: [],
    roleTags: [],
    examples: [],
    dashboard: false,
    ...contract,
    id: `${contract.command}.${contract.action}`,
  };
  if (CONTRACT_BY_ID.has(normalized.id)) throw new Error(`Duplicate subcommand contract: ${normalized.id}`);
  CONTRACT_BY_ID.set(normalized.id, normalized);
  const list = CONTRACTS_BY_COMMAND.get(normalized.command) || [];
  list.push(normalized);
  CONTRACTS_BY_COMMAND.set(normalized.command, list);
}

function clone(contract) {
  return contract ? {
    ...contract,
    args: [...(contract.args || [])],
    flags: [...(contract.flags || [])],
    lifecycleEffects: [...(contract.lifecycleEffects || [])],
    requiredEvidence: [...(contract.requiredEvidence || [])],
    roleTags: [...(contract.roleTags || [])],
    examples: [...(contract.examples || [])],
    matchFlags: [...(contract.matchFlags || [])],
  } : null;
}

export function listSubcommandContracts() {
  return CONTRACTS.map(contract => clone(CONTRACT_BY_ID.get(`${contract.command}.${contract.action}`)));
}

export function listSubcommandsForCommand(commandName) {
  return (CONTRACTS_BY_COMMAND.get(commandName) || []).map(clone);
}

export function getSubcommandContract(commandName, action) {
  return clone(CONTRACT_BY_ID.get(`${commandName}.${action}`));
}

export function listSubcommandsByAction(action) {
  return CONTRACTS.filter(contract => contract.action === action).map(contract => clone(CONTRACT_BY_ID.get(`${contract.command}.${contract.action}`)));
}

export function resolveSubcommandContract(commandName, argv = []) {
  const contracts = CONTRACTS_BY_COMMAND.get(commandName) || [];
  if (!contracts.length) return null;
  if (argv.includes('--help') || argv.includes('-h') || argv[1] === 'help') {
    return clone(contracts.find(contract => contract.action === 'help')) || null;
  }
  for (const contract of contracts) {
    if (contract.matchFlags?.some(flag => argv.includes(flag))) return clone(contract);
  }
  const candidate = argv[1] && !String(argv[1]).startsWith('-') ? argv[1] : null;
  if (candidate) {
    const exact = contracts.find(contract => contract.action === candidate);
    if (exact) return clone(exact);
  }
  const preferred = ['list', 'show', 'check', 'serve', 'status', 'run', 'file', 'query', 'entity', 'add'].find(action => contracts.some(contract => contract.action === action));
  return clone(contracts.find(contract => contract.action === preferred) || contracts[0]);
}

export function actionSuggestionHint(action) {
  const matches = listSubcommandsByAction(action);
  if (!matches.length) return '';
  const examples = matches.slice(0, 8).map(contract => `mm ${contract.command} ${contract.action}`).join(', ');
  return `Use one of: ${examples}${matches.length > 8 ? ', ...' : ''}`;
}

export function toolForSubcommandContract(contract) {
  if (!contract) return null;
  const prefix = `mm ${contract.command} ${contract.action}`;
  return contract.usage.startsWith(prefix) ? prefix : `mm ${contract.command}`;
}

export function toolsForRoleTags(roleTags = []) {
  const tags = new Set(roleTags);
  const tools = [];
  for (const contract of listSubcommandContracts()) {
    if ((contract.roleTags || []).some(tag => tags.has(tag))) {
      const tool = toolForSubcommandContract(contract);
      if (tool && !tools.includes(tool)) tools.push(tool);
    }
  }
  return tools;
}
