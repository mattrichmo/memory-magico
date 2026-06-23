# MemoryMagico Client Dashboard Product Contract

This is the truth-backed product and implementation contract for designing a polished client dashboard on top of the current MemoryMagico dashboard runtime.

Grounding sources:

- `dashboard/index.html`
- `dashboard/app.js`
- `dashboard/styles.css`
- `src/commands/dashboard.mjs`
- `src/core/dashboard-data.mjs`
- `memory/generated/dashboard.json`
- CLI command handlers under `src/commands/*.mjs`

## Current Truth Summary

The dashboard is currently a single static client shell served by `mm dashboard serve` from `dashboard/index.html`, `dashboard/app.js`, and `dashboard/styles.css`.

The implemented navigation routes are:

1. Home
2. Sprints
3. Phases
4. Tasks
5. Issues
6. Bugs
7. Discoveries
8. Wiki
9. Raw

The current UI is read-only. It fetches dashboard and entity data, renders object lists, opens a right-side inspector, copies raw JSON, and copies a CLI command for the selected item. Mutations are currently CLI-backed rather than UI-backed.

The primary implemented interaction model is:

- Left navigation changes route.
- Main area renders a searchable list for the active route.
- Selecting a row opens the right rail inspector.
- Relationship chips in the inspector navigate to related indexed objects when present.
- The rail fetches canonical detail from `/api/entity/:kind/:id`.
- Copy buttons copy JSON or the matching `mm ... show` command.
- `Escape` closes the rail or clears search.
- `/` or `Cmd/Ctrl+K` focuses search on non-home routes.
- `r` refreshes the dashboard silently when focus is not in an input.
- The dashboard polls `/api/dashboard` every 60 seconds.

## Runtime Architecture

### Shell

`dashboard/index.html` contains:

- `#app` boot mount.
- Loading card.
- No-script fallback.
- Static CSS and JS includes.

### Client Renderer

`dashboard/app.js` owns:

- Route state.
- Snapshot loading.
- Optional endpoint loading.
- Object normalization.
- Search filtering.
- Selection and right rail state.
- Entity detail cache.
- Clipboard interactions.
- URL query synchronization.
- Fixture fallback mode.
- Keyboard shortcuts.
- 60 second polling.

### Styling

`dashboard/styles.css` defines:

- Dark app shell.
- Fixed left navigation.
- Scrollable main content.
- Right rail inspector.
- Metric cards.
- Object rows.
- Status pills.
- Trust dots.
- Toasts.
- Loading and error panels.
- Responsive collapse below 820px and 560px.

## API Contracts

### `GET /api/dashboard`

Source: `buildDashboardData()` in `src/core/dashboard-data.mjs`.

This is the main snapshot contract.

```ts
type DashboardPayload = {
  generatedAt: string
  summary: DashboardSummary
  focus: DashboardFocus
  indices: {
    sprintSummaryCount: number
    taskSummaryCount: number
  }
}
```

```ts
type DashboardSummary = {
  sprints: {
    total: number
    active: number
    planned: number
    completed: number
  }
  phases: {
    total: number
    completed: number
    active: number
  }
  tasks: {
    total: number
    done: number
    blocked: number
    inProgress: number
  }
  issues: {
    total: number
    open: number
    bySeverity: Record<string, number>
    byStatus: Record<string, number>
  }
  containers: {
    total: number
    byStatus: Record<string, number>
  }
  discoveries: {
    total: number
    promoted: number
    pending: number
    byStatus: Record<string, number>
    recent: DiscoverySummary[]
  }
  raw: {
    total: number
    unresolved: number
    processed: number
    rejected: number
    recent: RawSummary[]
  }
  comments: {
    total: number
  }
  relationships: {
    total: number
  }
  wiki: {
    pages: number
  }
  search: {
    ready: boolean
    builtAt: string
    pages: number
    chunks: number
    mode: string
    vectorDims: number
    indexed: boolean
  }
}
```

```ts
type DashboardFocus = {
  sprints: SprintCard[]
  featuredSprints: SprintCard[]
  recentSprints: SprintCard[]
  recentActivity: ActivityEvent[]
  tasks: TaskCard[]
}
```

### `GET /api/issues`

Returns canonical issue records.

```ts
type IssueListResponse = {
  ok: true
  items: IssueRecord[]
}
```

### `GET /api/raw`

Returns raw intake records from `memory/inbox/raw-items.jsonl`.

```ts
type RawListResponse = {
  ok: true
  items: RawItem[]
}
```

### `GET /api/discoveries`

Returns canonical discovery records.

```ts
type DiscoveryListResponse = {
  ok: true
  items: DiscoveryRecord[]
}
```

### `GET /api/wiki`

Returns wiki page index rows from scanned markdown pages.

```ts
type WikiListResponse = {
  ok: true
  pages: WikiPageIndexRow[]
}
```

### `GET /api/git/status`

Returns Git state from `src/core/git.mjs`.

The dashboard currently uses this for:

- Branch label in the sidebar.
- Authored dirty count.
- Generated dirty count.
- Dirty file trust signals.

### `GET /api/entity/:kind/:id`

Returns canonical entity detail for the right rail.

Implemented kind mapping in the client:

- `bug` maps to `issue`
- `wiki` maps to `wiki`
- `raw` maps to `raw`
- Concept/decision/system/project/process/source/synthesis/note kinds map to `wiki`
- Other kinds use their own kind name

```ts
type EntityResponse<T> = {
  ok: true
  entity: T
}
```

### Additional Available Endpoints Not Yet Rendered As Top-Level Pages

These are implemented in `src/commands/dashboard.mjs` and can support future surfaces:

- `GET /api/health`
- `GET /api/graph`
- `GET /api/graph?node=<id>`
- `GET /api/search?q=<query>&limit=<n>&mode=<mode>&kind=<kind>`
- `GET /api/resolve?q=<query>&limit=<n>&kind=<kind>`
- `GET /api/git/log?path=<path>&limit=<n>`
- `GET /api/git/diff?path=<path>&memory=1`

## Shared Object Shapes

### Sprint Card

Built from canonical sprint, phase, task, issue, and container records.

```ts
type SprintCard = {
  id: string
  title: string
  description: string
  goal: string
  status: string
  tone: 'good' | 'bad' | 'live' | 'idle' | string
  updatedAt: string
  containerLabels: string[]
  issueSummaries: {
    id: string
    title: string
    status: string
    severity: string
  }[]
  progress: {
    taskCount: number
    phaseCount: number
    doneCount: number
    activeCount: number
    blockedCount: number
    percent: number
  }
  phases: PhaseCard[]
}
```

### Phase Card

Nested inside `SprintCard.phases`. The current dashboard derives the Phases page from these nested phase cards.

```ts
type PhaseCard = {
  id: string
  title: string
  number: number | null
  status: string
  tone: string
  successGates: string[]
  progress: {
    taskCount: number
    doneCount: number
    percent: number
  }
  tasks: {
    id: string
    title: string
    status: string
    tone: string
    filesAffected: number
    issueIds: string[]
  }[]
}
```

### Task Card

Built from canonical task records plus sprint, phase, and issue labels.

```ts
type TaskCard = {
  id: string
  title: string
  description: string
  status: string
  tone: string
  updatedAt: string
  sprintId: string
  sprintTitle: string
  phaseId: string
  phaseTitle: string
  filesAffected: string[]
  issueIds: string[]
  issueTitles: string[]
}
```

### Activity Event

Built from sprint, phase, and task history arrays.

```ts
type ActivityEvent = {
  at: string
  entityType: 'memory_event' | string
  entityId: string
  title: string
  event: string
  status: string
  note: string
  commits: string[]
}
```

### Issue Record

Loaded from `/api/issues` when available. Important fields used or expected by the dashboard renderer:

```ts
type IssueRecord = {
  id: string
  kind: 'issue'
  title: string
  description?: string
  summary?: string
  status: string
  issueType: string
  severity: string
  confidence: string
  risk?: string
  impact?: string
  proposedFix?: string
  verificationPlan?: string[] | string
  reproductionSteps?: string[]
  sourceDiscoveryIds?: string[]
  sourceRawItemIds?: string[]
  sourceRefs?: unknown[]
  filesAffected?: string[]
  acceptanceCriteria?: string[]
  verificationEvidence?: unknown[]
  dependencies?: {
    blockedByIssueIds?: string[]
    blocksIssueIds?: string[]
    relatedIssueIds?: string[]
  }
  implementation?: {
    assignee?: string
    branchName?: string
    assignedAgentMode?: string
    pullRequestUrls?: string[]
    commitShas?: string[]
  }
  github?: Record<string, unknown>
  paths?: {
    self?: string
    wiki?: string
  }
  createdAt: string
  updatedAt: string
  closedAt?: string
}
```

### Bug Record

The Bugs route is not a separate backend entity. It is derived from Issues where one of these is true:

- `issue.issueType === 'bug'`
- `issue.kind === 'bug'`
- `issue.type === 'bug'`

The client normalizes bugs as issue records with `kind: 'bug'`, then loads canonical detail through `/api/entity/issue/:id`.

### Discovery Record

Loaded from `/api/discoveries`, or falls back to `summary.discoveries.recent`.

```ts
type DiscoveryRecord = {
  id: string
  kind: 'discovery'
  title: string
  summary: string
  description?: string
  sourceType: string
  sourceRawItemIds: string[]
  status: string
  recommendedAction: string
  risk: string
  severity: string
  confidence: string
  issueType: string
  filesAffected: string[]
  relatedContainers: string[]
  relatedDiscoveries: string[]
  duplicateOfDiscoveryId?: string
  foldedIntoIssueId?: string
  promotedIssueId?: string
  paths?: {
    self?: string
    wiki?: string
    source?: string
  }
  createdAt: string
  updatedAt: string
}
```

### Raw Item

Loaded from `/api/raw`, or falls back to `summary.raw.recent`.

```ts
type RawItem = {
  id: string
  kind: 'raw_item' | 'raw'
  title: string
  summary: string
  sourceType: string
  status: 'unreconciled' | 'processing' | 'processed' | 'rejected' | 'duplicate' | 'archived' | string
  path: string
  sourceRef?: string
  mediaType?: string
  byteSize?: number
  tags: string[]
  containerIds: string[]
  reconciledTo: unknown[]
  createdAt: string
  updatedAt: string
  processedAt?: string
}
```

### Wiki Page Index Row

Loaded from `/api/wiki`.

```ts
type WikiPageIndexRow = {
  id: string
  kind: string
  title: string
  path: string
  summary?: string
  aliases?: string[]
  tags?: string[]
  sourceRefs?: unknown[]
  updatedAt?: string
}
```

### Relationship Edge

Loaded from `/api/graph` or `/api/graph?node=<id>`.

```ts
type RelationshipEdge = {
  id: string
  kind: 'relationship'
  from: {
    id: string
    kind: string
    path?: string
  }
  to: {
    id: string
    kind: string
    path?: string
  }
  type: string
  strength: 'weak' | 'medium' | 'strong' | string
  summary?: string
  evidence: unknown[]
  createdAt: string
  createdBy: string
}
```

## Shared Components Needed

### App Shell

Purpose: Owns the fixed dashboard layout.

Anatomy:

- Sidebar navigation.
- Main content outlet.
- Optional right rail.
- Toast layer.

States:

- Loading.
- API unavailable.
- Fixture mode.
- Data loaded.
- Detail selected.

### Sidebar Navigation

Purpose: Route switching and high-level counts.

Props:

- `activeRoute`
- `routes`
- `counts`
- `branch`
- `mode`
- `version`

Interactions:

- Click route -> set active route, clear search, clear selected entity, update URL.
- Persist active route in local storage.

Micro-interactions:

- Active route background.
- Hover row highlight.
- Count changes on refresh.

### Search Row

Purpose: Filter current route list locally.

Props:

- `routeLabel`
- `value`

Interactions:

- Input filters list immediately.
- `Escape` clears search.
- `/` or `Cmd/Ctrl+K` focuses the input.

Micro-interactions:

- Preserve cursor after re-render.
- Placeholder changes by route.
- Empty-state text includes the active search term.

### Object List

Purpose: Route-level object collection.

Props:

- `kind`
- `objects`
- `search`

Interactions:

- Click object row -> select entity and open rail.

Micro-interactions:

- Selected row background.
- Hover background.
- Title truncation.
- Trust strip/status pill update after poll.

### Object Card

Purpose: Uniform list row for all entity kinds.

Required fields:

- Icon.
- Title.
- Trust strip.
- Status pill.
- Meta line.

Optional fields:

- Count.
- Severity.
- Updated time.
- Associated sprint/phase/issue labels.

### Trust Strip

Purpose: Three-dot compact truth signal.

Current implemented signals:

1. Git signal.
2. Index signal.
3. Status/severity/confidence signal.

Signal colors:

- Emerald: good/fresh/complete.
- Sky: active/in progress/live.
- Amber: needs attention/stale/review.
- Rose: blocked/high severity/dirty.
- Zinc: unknown/idle.

### Status Pill

Purpose: Normalize statuses into readable badges.

Current color mapping:

- `planned`, `active`, `in_progress`, `ready_for_agent`, `processing`: blue/sky.
- `done`, `completed`, `verified`, `closed`, `processed`, `promoted_to_issue`: green/emerald.
- `paused`, `needs_review`, `needs_verification`, `unreconciled`, `needs_research`: amber.
- `blocked`, `rejected`, `cancelled`: rose.
- `draft`, `todo`, `deferred`, `duplicate`, `archived`: zinc.

### Metric Card

Purpose: Home route summary values.

Current home metrics:

- Git authored dirty files.
- Git generated dirty files.
- Index stale count.
- Raw inbox unresolved count.
- Blockers.

### Active Sprint Card

Purpose: Show the current most important sprint.

Selection rule:

- First active sprint if one exists.
- Otherwise first sprint in normalized sprint list.

Fields:

- Sprint title.
- Goal/description.
- Done count.
- Blocked count.
- Verified count.
- Trust strip.

Interaction:

- Click opens the sprint in the right rail.

### Attention Queue

Purpose: Home route risk/action list.

Current inclusion rules:

- Blocked tasks.
- Done tasks without verification evidence.
- P0/P1 issues.
- Issues with `needs_verification` or `blocked`.
- Bug issues.
- Raw items with `unreconciled` or `processing`.
- Discoveries not promoted.
- Objects with stale index metadata.

Interaction:

- Click row opens entity in the right rail.

### Right Rail Inspector

Purpose: Canonical entity detail view.

Shared anatomy:

- Top actions: back, close.
- Kind badge.
- Title.
- Trust strip.
- Status/severity/priority row.
- Tags.
- Kind-specific detail fields.
- Path field when present.
- Git field.
- Index field.
- Copy raw JSON button.
- Copy CLI command button.

States:

- Loading canonical entity.
- Canonical load error.
- Raw warning for raw items.
- Selected entity.
- Back history available/unavailable.

Interactions:

- Back returns to previous selected entity.
- Close clears selection.
- Relationship chips navigate when target object exists in the current index.
- Copy raw JSON copies normalized object from current client state.
- Copy CLI command copies the correct read command.

Micro-interactions:

- Rail slides in with `railIn`.
- Copy buttons switch to copied labels.
- Toast appears for 1.2 seconds.
- Missing relationship chips render as disabled-looking missing chips.

### Field Group

Purpose: Right rail detail sections.

Variants:

- Text block.
- Mono value.
- List.
- Chip row.
- Rendered wiki body.
- Git block.
- Index block.

### Raw Warning

Purpose: Make untrusted raw intake visibly distinct.

Current text:

- `untrusted raw input - not yet promoted`

### Error Panel

Purpose: API unavailable state.

Actions:

- Retry.
- Load fixture.
- Copy serve command.

## Page Contracts

### 1. Home

Current route key: `home`.

Purpose: Command center for project state and what needs attention.

Primary data sources:

- `summary.raw.unresolved`
- `summary.search`
- optional `/api/git/status`
- normalized `state.data.sprint`
- normalized `state.data.task`
- normalized `state.data.issue`
- normalized `state.data.bug`
- normalized `state.data.discovery`
- normalized `state.data.raw`

Surfaces:

- Page title: `Command Center`.
- Subtitle: `What's actually true right now, not just what's stored.`
- Metric grid.
- Active sprint card.
- Attention queue.

Components:

- MetricCard.
- ActiveSprintCard.
- AttentionQueue.
- AttentionRow.
- TrustStrip.
- StatusPill.

Interactions:

- Click active sprint -> open right rail.
- Click attention row -> open right rail.
- Press `r` -> silent refresh.
- Poll every 60 seconds.

Micro-interactions:

- Metric color changes by risk.
- Active sprint hover border/background.
- Attention row hover background.
- Toast if copying from right rail.

CRUD options:

- Current UI: read-only only.
- Safe future actions:
  - Run `mm safe --json`.
  - Run `mm index rebuild`.
  - Run `mm raw list`.
  - Run `mm task update <id> in_progress`.
  - Run `mm issue update <id> ready_for_agent`.

Dashboard contract notes:

- Home must not rely only on `summary`; it also needs normalized object arrays for attention queue logic.
- `gitStatus` is optional but needed for authored/generated dirty counts.

### 2. Sprints

Current route key: `sprint`.

Purpose: Show sprint execution slices and progress.

Primary data source:

- `focus.sprints`
- `focus.featuredSprints`
- `focus.recentSprints`

Normalized client collection:

```ts
state.data.sprint: SprintCard[]
```

Surfaces:

- List header with count.
- Search input.
- Sprint object rows.
- Right rail sprint detail.

Components:

- ObjectList.
- ObjectCard.
- TrustStrip.
- StatusPill.
- RightRail.
- ProgressSummary.
- RelationshipChip.

Interactions:

- Click sprint row -> open rail.
- Search by ID/title/path/status/meta/tags.
- Rail chips navigate to phases, tasks, issues, and discoveries when indexed.
- Copy command -> `mm sprint show <id>`.

Micro-interactions:

- Selected row highlight.
- Status/tone color.
- Rail loading warning while canonical entity loads.

Current CRUD commands:

- `mm sprint create <title> [--goal "..."] [--initiative-ids a,b] [--issue-ids a,b] [--container-ids a,b]`
- `mm sprint compose <title> --issue-ids issue_a,issue_b [--phase-title "..."] [--goal "..."]`
- `mm sprint update <id> <status> [--goal "..."] [--note "..."]`
- `mm sprint list`
- `mm sprint show <id>`

Design requirements:

- Sprints should show progress as both counts and visual percentage.
- Surface blocked count separately from incomplete count.
- Show linked issues as severity-aware compact chips.
- Show phase timeline only when phases exist.

### 3. Phases

Current route key: `phase`.

Purpose: Show sprint phases derived from sprint cards.

Primary data source:

- `focus.sprints[].phases`

Normalized client collection:

```ts
state.data.phase: PhaseCard[]
```

Surfaces:

- List header with count.
- Search input.
- Phase object rows.
- Right rail phase detail.

Components:

- ObjectList.
- ObjectCard.
- PhaseProgressBar.
- SuccessGateList.
- RelationshipChip.
- RightRail.

Interactions:

- Click phase row -> open rail.
- Search by phase title/status/sprint title.
- Rail chips navigate to sprint and tasks when indexed.
- Copy command -> `mm phase show <id>`.

Micro-interactions:

- Phase number should remain visible even when title truncates.
- Success gates should show empty state as `none`, matching current rail behavior.
- Missing task chips should be visibly distinct from valid chips.

Current CRUD commands:

- `mm phase create <title> --sprint-id <sprint_id> [--number N] [--issue-ids a,b]`
- `mm phase update <id> <status> [--task-ids a,b] [--note "..."]`
- `mm phase list`
- `mm phase show <id>`

Design requirements:

- Phase page is currently limited by nested sprint payload. A richer client dashboard should also support a direct phase list endpoint or use `/api/entity/phase/:id` for canonical detail.
- Completion should require and display success gates.

### 4. Tasks

Current route key: `task`.

Purpose: Show executable work items.

Primary data sources:

- `focus.tasks`
- nested `focus.sprints[].phases[].tasks`

Normalized client collection:

```ts
state.data.task: TaskCard[]
```

Surfaces:

- List header with count.
- Search input.
- Task object rows.
- Right rail task detail.

Components:

- ObjectList.
- ObjectCard.
- StatusPill.
- TrustStrip.
- AcceptanceCriteriaList.
- VerificationPlanList.
- VerificationEvidenceList.
- FilesAffectedList.
- RelationshipChip.

Interactions:

- Click task row -> open rail.
- Search by task ID/title/status/sprint/phase/issue tags.
- Rail chips navigate to sprint, phase, blockers, and related issues when indexed.
- Copy command -> `mm task show <id>`.

Micro-interactions:

- Done without evidence should appear in Home attention queue.
- Blocked tasks should use rose status emphasis.
- File lists should truncate long paths but preserve full value in copy/raw JSON.

Current CRUD commands:

- `mm task create <title> --sprint-id <sprint_id> [--phase-id <phase_id>] [--issue-ids a,b]`
- `mm task update <id> <status> [--issue-ids a,b] [--note "..."]`
- `mm task complete <id> --test "npm test" --result "pass" [--evidence path] [--commits sha1,sha2]`
- `mm task list`
- `mm task show <id>`

Design requirements:

- A client dashboard should make the verification gate explicit before exposing a complete action.
- Task complete should require at least one verification evidence input.
- `in_progress` should not hide acceptance criteria or verification plan.

### 5. Issues

Current route key: `issue`.

Purpose: Show canonical issue tracker records.

Primary data source:

- `/api/issues`

Fallback:

- `focus.issues` if present, but current `buildDashboardData()` does not emit `focus.issues`.

Normalized client collection:

```ts
state.data.issue: IssueRecord[]
```

Surfaces:

- List header with count.
- Search input.
- Issue object rows.
- Right rail issue detail.

Components:

- ObjectList.
- ObjectCard.
- SeverityPill.
- ConfidencePill.
- RiskBlock.
- AcceptanceCriteriaList.
- VerificationPlanList.
- SourceRefs.
- RelatedTaskChips.
- GitHubLinkGroup.

Interactions:

- Click issue row -> open rail.
- Search by issue ID/title/status/severity/meta/tags.
- Rail chips navigate to related tasks, source discoveries, and raw items when indexed.
- Copy command -> `mm issue show <id>`.

Micro-interactions:

- P0/P1 issues should be attention-queue candidates.
- `needs_verification` and `blocked` should be attention-queue candidates.
- Severity should remain visible in row and rail header.

Current CRUD commands:

- `mm issue create <title> [--description "..."] [--container-ids a,b] [--source-discovery-ids a,b]`
- `mm issue update <id> <status> [--description "..."] [--note "..."]`
- `mm issue close <id>`
- `mm issue link-pr <id> <pr-url>`
- `mm issue verify <id>`
- `mm issue block <id> [--status <status>]`
- `mm issue unblock <id> [--status <status>]`
- `mm issue list`
- `mm issue show <id>`

Design requirements:

- Create issue flow should expose risk, acceptance criteria, verification plan, severity, confidence, source discovery/raw links, files affected, and dependencies.
- Ready-for-agent flow should enforce the same gates as CLI guards.
- Verify flow should collect test, result, evidence, commits, and PR URL.

### 6. Bugs

Current route key: `bug`.

Purpose: Filter issue records down to bug issues.

Primary data source:

- Derived from `state.data.issue`.

Bug derivation:

```ts
issue.issueType === 'bug' || issue.kind === 'bug' || issue.type === 'bug'
```

Normalized client collection:

```ts
state.data.bug: IssueRecordWithKindBug[]
```

Surfaces:

- List header with count.
- Search input.
- Bug object rows.
- Right rail issue detail with bug treatment.

Components:

- ObjectList.
- ObjectCard.
- SeverityPill.
- ReproductionStepsList.
- ProposedFixBlock.
- VerificationPlanBlock.

Interactions:

- Click bug row -> open rail.
- Rail detail loads through `/api/entity/issue/:id`, not `/api/entity/bug/:id`.
- Copy command -> `mm issue show <id>`.

Micro-interactions:

- Bug icon and rose color for high-severity bugs.
- P0/P1 bug rows should feel urgent without overwhelming the list.

Current CRUD commands:

- Same as Issues.
- Create bugs with `mm issue create "..." --issue-type bug`.

Design requirements:

- Bug creation should prioritize reproduction, observed behavior, expected behavior, files affected, severity, and verification.
- Bug list should support severity and status filtering in a future UI.

### 7. Discoveries

Current route key: `discovery`.

Purpose: Show research/audit findings before or after promotion to issues.

Primary data source:

- `/api/discoveries`

Fallback:

- `summary.discoveries.recent`

Normalized client collection:

```ts
state.data.discovery: DiscoveryRecord[]
```

Surfaces:

- List header with count.
- Search input.
- Discovery object rows.
- Right rail discovery detail.

Components:

- ObjectList.
- ObjectCard.
- RecommendedActionPill.
- ConfidencePill.
- SourceRawChips.
- PromotedIssueChip.
- FilesAffectedList.

Interactions:

- Click discovery row -> open rail.
- Rail chips navigate to source raw items, related tasks, and promoted issue when indexed.
- Copy command -> `mm discovery show <id>`.

Micro-interactions:

- Discoveries not promoted are attention-queue candidates.
- Promoted discoveries should clearly show target issue.

Current CRUD commands:

- `mm discovery create <title> [--summary "..."] [--container-id <id>] [--source-raw-item-ids a,b]`
- `mm discovery update <id> <status> [--recommended-action <action>]`
- `mm discovery list`
- `mm discovery show <id>`

Design requirements:

- Promote-to-issue should be a first-class future action, backed by `mm issue create` and `mm discovery update --promoted-issue-id`.
- Duplicate and folded states need visual distinction from rejected states.

### 8. Wiki

Current route key: `wiki`.

Purpose: Show canonical markdown/YAML knowledge pages.

Primary data source:

- `/api/wiki`

Detail source:

- `/api/entity/wiki/:id`

Normalized client collection:

```ts
state.data.wiki: WikiPageIndexRow[]
```

Surfaces:

- List header with count.
- Search input.
- Wiki object rows.
- Right rail wiki detail.

Components:

- ObjectList.
- ObjectCard.
- WikiKindBadge.
- TagRow.
- MarkdownPreview.
- BacklinkChips.
- SourceRefChips.

Interactions:

- Click wiki row -> open rail.
- Right rail renders a simple markdown preview for up to 80 lines.
- Copy command -> `mm resolve <id> --json`.

Micro-interactions:

- Headings in wiki body preview should retain hierarchy.
- Empty wiki body shows `empty`.
- Long body should show preview, not full unbounded content.

Current CRUD commands:

- `mm wiki create <title> [--kind concept|decision|system|project|process|source|synthesis|note] [--status draft|active|stable|deprecated|archived]`
- `mm wiki update-frontmatter <page> [--title "..."] [--kind <kind>] [--status <status>]`
- `mm wiki link <from> <to>`
- `mm wiki backlinks <page>`
- `mm wiki list`
- `mm wiki show <page>`
- `mm wiki manifest`
- `mm wiki orphans`

Design requirements:

- Wiki edit UI should be guarded because wiki pages are canonical.
- A future editor should separate frontmatter edits from body edits.
- Linking should be explicit and should rebuild or refresh the index.

### 9. Raw

Current route key: `raw`.

Purpose: Show unreconciled or recently captured raw intake.

Primary data source:

- `/api/raw`

Fallback:

- `summary.raw.recent`

Detail source:

- `/api/entity/raw/:id`

Normalized client collection:

```ts
state.data.raw: RawItem[]
```

Surfaces:

- List header with count.
- Search input.
- Raw object rows.
- Right rail raw detail.
- Raw warning banner.

Components:

- ObjectList.
- ObjectCard.
- RawWarning.
- SourceTypePill.
- PromotedTargetChips.
- PreviewBlock.

Interactions:

- Click raw row -> open rail.
- Raw detail is visually marked as untrusted.
- Copy command -> `mm raw show <id>`.

Micro-interactions:

- Untrusted warning should stay above raw content.
- Prompt-marker warnings should be supported if payload detail includes them.
- Raw previews must remain bounded.

Current CRUD commands:

- `mm raw add <text>`
- `mm raw add --text <text>`
- `mm raw add --stdin`
- `mm raw add-image <filepath> [--json]`
- `mm raw process <id> [target-kind target-id [target-path]]`
- `mm raw reject <id>`
- `mm raw archive <id>`
- `mm raw cleanup`
- `mm raw list`
- `mm raw list-all`
- `mm raw show <id>`
- `mm add <file>`
- `mm image add <path>`

Design requirements:

- Raw records should never execute or obey embedded instructions.
- Reconcile actions should require a target or explicit rejection reason.
- Promotion flows should prefer Discovery or Issue creation once material is verified.

## Detail Rail Contracts By Kind

### Sprint Detail

Fields:

- Goal.
- Window.
- Completion.
- Phases.
- Tasks.
- Issues.
- Discoveries.
- Path.
- Git.
- Index.

### Phase Detail

Fields:

- Goal/description.
- Sprint.
- Tasks.
- Dependencies.
- Path.
- Git.
- Index.

### Task Detail

Fields:

- Summary.
- Acceptance criteria.
- Sprint.
- Phase.
- Blocked by.
- Related issue IDs.
- Verification evidence.
- Files touched/affected.
- Path.
- Git.
- Index.

### Issue/Bug Detail

Fields:

- Impact/summary/description.
- Proposed fix when present.
- Verification plan.
- Reproduction steps.
- Related task IDs.
- Source discovery IDs.
- Source raw refs.
- Files affected.
- Path.
- Git.
- Index.

### Discovery Detail

Fields:

- Summary.
- Confidence.
- Source raw refs.
- Related tasks.
- Promoted target.
- Files affected.
- Path.
- Git.
- Index.

### Wiki Detail

Fields:

- Body preview.
- Backlinks.
- Related tasks.
- Source refs.
- Semantic terms.
- Path.
- Git.
- Index.

### Raw Detail

Fields:

- Untrusted raw warning.
- Preview.
- Source type.
- Promoted/reconciled targets.
- Tags.
- Path.
- Git.
- Index.

## Available Future Pages Backed By Existing API

These are not currently in `ROUTES`, so they should not be described as implemented pages. They are valid future pages because API routes already exist.

### Graph

Endpoint:

- `/api/graph`
- `/api/graph?node=<id>`

Surfaces:

- Relationship table.
- Node neighborhood.
- Edge type filters.
- Orphan/contradiction panels if wired to graph CLI commands.

CRUD options:

- `mm graph add <from-id> <type> <to-id> [--summary "..."] [--strength weak|medium|strong]`
- `mm graph rebuild`
- `mm graph validate`
- `mm graph neighborhood <id>`
- `mm graph orphans`
- `mm graph contradictions`

### Search And Resolve

Endpoints:

- `/api/search?q=<query>&limit=<n>&mode=<mode>&kind=<kind>`
- `/api/resolve?q=<query>&limit=<n>&kind=<kind>`

Surfaces:

- Global command palette.
- Result list.
- Explainable search metadata if API is expanded.
- Deep link into right rail.

CRUD options:

- Read-only.
- Useful commands: `mm search`, `mm resolve`, `mm context`.

### Git

Endpoints:

- `/api/git/status`
- `/api/git/log?path=<path>&limit=<n>`
- `/api/git/diff?path=<path>&memory=1`

Surfaces:

- Worktree status.
- Authored vs generated dirty files.
- File-scoped log.
- File-scoped diff.

CRUD options:

- Current dashboard API is read-only for Git.
- Mutating Git actions should remain outside dashboard unless explicitly designed with confirmation.

### System / Health

Endpoint:

- `/api/health`

Surfaces:

- Memory roots.
- API status.
- Dashboard generated time.
- Search/index readiness from `/api/dashboard.summary.search`.

CRUD options:

- `mm doctor`
- `mm lint --json`
- `mm audit --json`
- `mm fsck --json`
- `mm safe --json`
- `mm index rebuild`
- `mm dashboard build`

## CRUD Matrix

Current dashboard UI action level:

- Create: not implemented in UI.
- Read: implemented.
- Update: not implemented in UI.
- Delete/archive/reject: not implemented in UI.
- Verify/complete: not implemented in UI.
- Copy command: implemented.

Recommended client mutation model:

1. Keep dashboard reads API-backed.
2. Route writes through CLI-equivalent command endpoints or a server action layer with the same guards.
3. Show exact generated command before mutation.
4. Require confirmation for destructive or lifecycle-closing actions.
5. After mutation, refresh `/api/dashboard` and selected `/api/entity/:kind/:id`.

| Domain | Read | Create | Update | Complete / Verify | Archive / Reject | Compose / Link |
|---|---|---|---|---|---|---|
| Sprint | `mm sprint list/show` | `mm sprint create` | `mm sprint update` | status `completed` via update | status `cancelled` via update | `mm sprint compose` |
| Phase | `mm phase list/show` | `mm phase create` | `mm phase update` | status `completed` via update | status `cancelled` via update | link via `--task-ids` / `--issue-ids` |
| Task | `mm task list/show` | `mm task create` | `mm task update` | `mm task complete` | status `cancelled` via update | link via `--issue-ids` |
| Issue | `mm issue list/show` | `mm issue create` | `mm issue update`, block, unblock | `mm issue verify` | `mm issue close` | `mm issue link-pr` |
| Discovery | `mm discovery list/show` | `mm discovery create` | `mm discovery update` | promote via issue create + discovery update | duplicate/rejected statuses | source raw links |
| Wiki | `mm wiki list/show/manifest/backlinks` | `mm wiki create` | `mm wiki update-frontmatter`, `mm wiki link` | n/a | archived status | wiki links |
| Raw | `mm raw list/show/list-all` | `mm raw add`, `mm add`, `mm image add` | process to target | n/a | `mm raw reject`, `mm raw archive` | `mm raw process` |
| Comment | `mm comment list/show` | `mm comment add` | not implemented | n/a | not implemented | target entity link |
| Graph | `mm graph list/show/neighborhood` | `mm graph add` | rebuild via `mm graph rebuild` | validate via `mm graph validate` | not implemented | relationship edges |
| Container | `mm container list/show` | `mm container create` | `mm container update` | n/a | `mm container archive` | contains domain grouping |
| Initiative | `mm initiative list/show` | `mm initiative create` | `mm initiative update` | status `shipped` via update | status `cancelled` / `parked` | sprint/issue links |

## Interaction Model

### Navigation

- Route buttons are left-aligned and count-backed.
- Route selection resets search and selected entity.
- Active route is persisted in `localStorage`.
- URL query is updated with `?view=<route>`.

### Search

- Route-local.
- Client-side only.
- Searches ID, title, path, status, meta line, and tags.
- Search is hidden on Home.

### Selection

- Any object card, active sprint card, attention row, or relationship chip can select an object.
- Selection opens right rail and sets `?selected=<kind:id>`.
- Selecting a different object pushes previous key into in-memory rail history.

### Detail Loading

- Rail first shows normalized row object.
- Then calls `/api/entity/:kind/:id`.
- Detail cache avoids repeat loads for the same selected key.
- Loading and error states appear inside the rail body.

### Copy

- Copy raw JSON copies current normalized object, not necessarily the entire canonical record if canonical detail failed.
- Copy command returns:
  - Raw: `mm raw show <id>`
  - Wiki: `mm resolve <id> --json`
  - Bug: `mm issue show <id>`
  - Other: `mm <kind> show <id>`

### Refresh

- Automatic refresh every 60 seconds.
- Keyboard `r` triggers silent refresh.
- Error panel retry triggers full load.

## Micro-Interaction Requirements

- Route hover: subtle background change.
- Active route: raised panel background.
- Object hover: soft panel background.
- Selected object: same selected background until route changes or rail closes.
- Right rail: 120ms slide-in.
- Toast: 120ms entrance, 1.2 second lifetime.
- Copy button: icon and label switch to copied state.
- Loading detail: inline rail warning, not full-page spinner.
- Raw detail: persistent warning banner.
- Missing relationship: disabled-looking missing chip.
- Reduced motion: animations and transitions disabled under `prefers-reduced-motion: reduce`.
- Mobile: sidebar becomes top block, nav becomes grid, rail becomes fixed overlay.

## Accessibility Contract

Current implementation uses buttons for navigation rows, object rows, attention rows, chips, copy actions, and rail controls.

Required for a polished client dashboard:

- Keep route nav inside `nav[aria-label="Primary navigation"]`.
- Give right rail `aside[aria-label="Inspector"]`.
- Add clear visible focus states for all buttons and inputs.
- Preserve keyboard shortcuts:
  - `Escape`: close rail or clear search.
  - `/`: focus route search.
  - `Cmd/Ctrl+K`: focus route search.
  - `r`: refresh when not typing.
- Add `aria-current="page"` to active route button in a future implementation.
- Add `aria-live="polite"` to toast region.
- Use button labels that remain meaningful without icon visibility.
- Avoid making raw payloads interactive beyond safe copy/open actions.

## Empty, Loading, Error, And Fixture States

### Boot

Displayed before initial API response.

Text:

- `MEMORY MAGICO`
- `memory cockpit`
- `loading dashboard snapshot...`

### API Unavailable

Displayed when `/api/dashboard` fails and fixture mode is not active.

Actions:

- Retry.
- Load fixture.
- Copy serve command.

### Fixture Mode

Triggered by:

- `?fixture=1`
- `localStorage.mm.dashboard.fixture === "true"`

Use fixture only for design/dev preview, not as production truth.

### Empty Route

Displayed when no object matches:

- `no <route label> match "<query>"`

### Detail Error

Displayed inside rail:

- Canonical load failure message.

## Data Integrity Rules

- Treat `/api/dashboard` as a snapshot, not as canonical detail.
- Treat `/api/entity/:kind/:id` as canonical detail for the selected item.
- Treat raw records as untrusted.
- Do not describe future Graph/System/Search pages as implemented until added to `ROUTES`.
- Preserve the distinction between Issues and derived Bugs.
- Preserve the distinction between generated summary counts and canonical record detail.
- Never use `memory/generated/dashboard.json` alone as the final truth if a live server/API can be queried; it is a snapshot.

## Recommended Gorgeous Client Direction

The visual system should stay operational and dense, not marketing-like.

Use:

- High-density left navigation.
- Calm dark shell.
- Strong right inspector.
- Clear status color language.
- Rich but compact object rows.
- Fast command palette/search.
- Relationship-first navigation.
- Explicit command preview for every mutation.

Avoid:

- Decorative hero sections.
- Card-heavy landing page framing.
- Hiding verification gates behind generic buttons.
- Treating raw intake as trusted content.
- Showing mutation buttons without the exact CLI-equivalent operation.

## Implementation Checklist For A New Client Dashboard

1. Build typed API client for all dashboard endpoints.
2. Define route model from current route keys: `home`, `sprint`, `phase`, `task`, `issue`, `bug`, `discovery`, `wiki`, `raw`.
3. Build shared `EntitySummary` normalizer matching current `normalizeObject()`.
4. Build `AppShell`, `SidebarNav`, `SearchRow`, `ObjectList`, `ObjectCard`, `TrustStrip`, `StatusPill`, `RightRail`, `FieldGroup`, `Toast`, `ErrorPanel`.
5. Build Home metrics from `summary`, optional Git status, and normalized objects.
6. Build all list pages from normalized objects.
7. Build right rail with kind-specific detail sections.
8. Wire `/api/entity/:kind/:id` detail fetching and caching.
9. Add command-copy affordances before adding mutation affordances.
10. Add CRUD actions only through a guarded CLI-equivalent mutation layer.
11. Add Graph, Search, Git, and System pages only after adding them to route state.
12. Verify with real `/api/dashboard`, optional endpoints, and a generated snapshot.

