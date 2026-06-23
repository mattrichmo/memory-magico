// MemoryMagico dashboard — fixture snapshot + canonical records + lookup maps.
// Pure data and pure helpers only. All view logic lives in the DC logic class.

// ── color language ────────────────────────────────────────────────────────────
// Operational status colors, harmonised against the Spruce Compute forest shell.
export const SIGNAL = {
  emerald: "#2DB563", // good / fresh / complete   (Spark)
  sky:     "#4FA3D1", // active / in progress / live
  amber:   "#D9A441", // needs attention / stale / review
  rose:    "#CE6A5C", // blocked / high severity / dirty
  zinc:    "#6B7B6E", // unknown / idle             (Slate)
};

// status string -> pill tone
const TONE = {
  planned: "sky", active: "sky", in_progress: "sky", ready_for_agent: "sky", processing: "sky",
  done: "emerald", completed: "emerald", verified: "emerald", closed: "emerald", processed: "emerald", promoted_to_issue: "emerald",
  paused: "amber", needs_review: "amber", needs_verification: "amber", unreconciled: "amber", needs_research: "amber",
  blocked: "rose", rejected: "rose", cancelled: "rose",
  draft: "zinc", todo: "zinc", deferred: "zinc", duplicate: "zinc", archived: "zinc",
};
export const toneFor = (status) => TONE[(status || "").toLowerCase()] || "zinc";

const SEV = { p0: "rose", p1: "rose", p2: "amber", p3: "sky", critical: "rose", high: "rose", medium: "amber", low: "sky" };
export const sevTone = (s) => SEV[(s || "").toLowerCase()] || "zinc";

export const ROUTES = [
  { id: "home",      label: "Command Center", glyph: "◉" },
  { id: "sprint",    label: "Sprints",        glyph: "⊞" },
  { id: "phase",     label: "Phases",         glyph: "❘❘❘" },
  { id: "task",      label: "Tasks",          glyph: "▤" },
  { id: "issue",     label: "Issues",         glyph: "◇" },
  { id: "bug",       label: "Bugs",           glyph: "⊘" },
  { id: "discovery", label: "Discoveries",    glyph: "✦" },
  { id: "wiki",      label: "Wiki",           glyph: "❡" },
  { id: "raw",       label: "Raw",            glyph: "≋" },
];

export const KIND_GLYPH = {
  sprint: "⊞", phase: "❘❘❘", task: "▤", issue: "◇", bug: "⊘",
  discovery: "✦", wiki: "❡", raw: "≋",
};

const now = Date.parse("2026-06-23T14:08:00Z");
const ago = (h) => new Date(now - h * 3600 * 1000).toISOString();

// ── git ────────────────────────────────────────────────────────────────────────
export const gitStatus = {
  branch: "feat/dashboard-client",
  authoredDirty: 7,
  generatedDirty: 3,
  dirtyFiles: [
    { path: "dashboard/app.js", kind: "authored" },
    { path: "dashboard/styles.css", kind: "authored" },
    { path: "src/core/dashboard-data.mjs", kind: "authored" },
    { path: "memory/generated/dashboard.json", kind: "generated" },
  ],
};

// ── tasks (canonical) ───────────────────────────────────────────────────────────
export const tasks = [
  { id: "task_4a1", title: "Build typed API client for dashboard endpoints", status: "done", tone: "good",
    sprintId: "sprint_dash", sprintTitle: "Dashboard Client v2", phaseId: "phase_scaffold", phaseTitle: "Scaffold & contracts",
    description: "Typed fetch wrapper covering /api/dashboard, /api/entity/:kind/:id, list endpoints, with retry + fixture fallback.",
    updatedAt: ago(28), filesAffected: ["dashboard/api-client.ts", "dashboard/types.ts"], issueIds: [], issueTitles: [],
    verificationEvidence: [{ test: "npm run test:api", result: "pass", at: ago(27) }],
    acceptanceCriteria: ["All 9 list endpoints typed", "Fixture fallback under ?fixture=1"], verificationPlan: ["Unit test each endpoint shape"] },
  { id: "task_4a2", title: "Implement EntitySummary normaliser", status: "done", tone: "bad",
    sprintId: "sprint_dash", sprintTitle: "Dashboard Client v2", phaseId: "phase_scaffold", phaseTitle: "Scaffold & contracts",
    description: "Single normaliser matching normalizeObject(): id, title, path, status, meta, tags across all kinds.",
    updatedAt: ago(20), filesAffected: ["dashboard/normalize.ts"], issueIds: [], issueTitles: [],
    verificationEvidence: [],
    acceptanceCriteria: ["Handles all 9 kinds", "Stable meta line"], verificationPlan: ["Snapshot test per kind"] },
  { id: "task_4b1", title: "Right rail inspector shell + slide-in", status: "in_progress", tone: "live",
    sprintId: "sprint_dash", sprintTitle: "Dashboard Client v2", phaseId: "phase_rail", phaseTitle: "Inspector rail",
    description: "Aside[aria-label=Inspector] with kind badge, trust strip, field groups, copy actions, back/close history.",
    updatedAt: ago(3), filesAffected: ["dashboard/RightRail.tsx", "dashboard/FieldGroup.tsx"], issueIds: ["issue_rail_focus"], issueTitles: ["Rail steals focus on poll"],
    verificationEvidence: [],
    acceptanceCriteria: ["120ms slide-in honours reduced-motion", "Back history works"], verificationPlan: ["Manual: open 3 entities, back twice"] },
  { id: "task_4b2", title: "Wire /api/entity detail fetch + cache", status: "blocked", tone: "bad",
    sprintId: "sprint_dash", sprintTitle: "Dashboard Client v2", phaseId: "phase_rail", phaseTitle: "Inspector rail",
    description: "Detail cache keyed by kind:id; loading + error states render inside rail body.",
    updatedAt: ago(6), filesAffected: ["dashboard/detail-cache.ts"], issueIds: ["issue_entity_404"], issueTitles: ["entity/phase/:id returns 404"],
    verificationEvidence: [],
    acceptanceCriteria: ["No repeat fetch for same key", "Error state inline, not full-page"], verificationPlan: ["Throttle network, observe cache"] },
  { id: "task_4c1", title: "Home attention queue logic", status: "in_progress", tone: "live",
    sprintId: "sprint_dash", sprintTitle: "Dashboard Client v2", phaseId: "phase_home", phaseTitle: "Command center",
    description: "Aggregate blocked tasks, done-without-evidence, P0/P1 issues, unpromoted discoveries, unreconciled raw, stale index.",
    updatedAt: ago(2), filesAffected: ["dashboard/attention.ts"], issueIds: [], issueTitles: [],
    verificationEvidence: [],
    acceptanceCriteria: ["Ordered by risk", "Each row opens rail"], verificationPlan: ["Compare against CLI mm safe --json"] },
  { id: "task_5a1", title: "Search index rebuild on wiki link", status: "todo", tone: "idle",
    sprintId: "sprint_search", sprintTitle: "Semantic Search", phaseId: "phase_index", phaseTitle: "Index pipeline",
    description: "Trigger incremental reindex when a wiki link is created so backlinks stay fresh.",
    updatedAt: ago(48), filesAffected: ["src/core/search-index.mjs"], issueIds: [], issueTitles: [],
    verificationEvidence: [], acceptanceCriteria: ["builtAt advances", "chunks recount"], verificationPlan: ["mm index rebuild --check"] },
];

// ── phases (canonical) ───────────────────────────────────────────────────────────
export const phases = [
  { id: "phase_scaffold", title: "Scaffold & contracts", number: 1, status: "completed", tone: "good",
    sprintId: "sprint_dash", sprintTitle: "Dashboard Client v2",
    successGates: ["Typed client compiles", "Normaliser snapshot tests pass"],
    progress: { taskCount: 2, doneCount: 2, percent: 100 },
    taskIds: ["task_4a1", "task_4a2"] },
  { id: "phase_rail", title: "Inspector rail", number: 2, status: "active", tone: "live",
    sprintId: "sprint_dash", sprintTitle: "Dashboard Client v2",
    successGates: ["Rail loads canonical detail", "Reduced-motion honoured", "Copy actions verified"],
    progress: { taskCount: 2, doneCount: 0, percent: 25 },
    taskIds: ["task_4b1", "task_4b2"] },
  { id: "phase_home", title: "Command center", number: 3, status: "active", tone: "live",
    sprintId: "sprint_dash", sprintTitle: "Dashboard Client v2",
    successGates: ["Metrics match CLI", "Attention queue parity with mm safe"],
    progress: { taskCount: 1, doneCount: 0, percent: 40 },
    taskIds: ["task_4c1"] },
  { id: "phase_index", title: "Index pipeline", number: 1, status: "planned", tone: "idle",
    sprintId: "sprint_search", sprintTitle: "Semantic Search",
    successGates: [],
    progress: { taskCount: 1, doneCount: 0, percent: 0 },
    taskIds: ["task_5a1"] },
];

// ── issues (canonical, incl. bugs) ─────────────────────────────────────────────────
export const issues = [
  { id: "issue_entity_404", kind: "issue", title: "entity/phase/:id returns 404 for nested phases", status: "blocked",
    issueType: "bug", severity: "p0", confidence: "high", risk: "Rail cannot load canonical phase detail; phases only exist nested in sprint payload.",
    impact: "Phase page detail is broken in the new client.", summary: "No direct phase entity route exists.",
    proposedFix: "Add GET /api/entity/phase/:id resolving from sprint.phases, or expose /api/phases.",
    reproductionSteps: ["Open Phases route", "Click any phase row", "Rail logs 404 from /api/entity/phase/:id"],
    verificationPlan: ["Add route", "Rail loads phase detail", "Snapshot the response"],
    filesAffected: ["src/commands/dashboard.mjs", "src/core/dashboard-data.mjs"],
    acceptanceCriteria: ["GET /api/entity/phase/:id returns ok:true", "Rail renders phase fields"],
    sourceDiscoveryIds: ["disc_phase_gap"], sourceRawItemIds: [],
    dependencies: { blockedByIssueIds: [], blocksIssueIds: [], relatedIssueIds: ["issue_rail_focus"] },
    implementation: { assignee: "agent:claude", branchName: "fix/phase-entity-route", pullRequestUrls: [], commitShas: [] },
    paths: { self: "memory/issues/issue_entity_404.yaml" }, createdAt: ago(30), updatedAt: ago(6) },
  { id: "issue_rail_focus", kind: "issue", title: "Rail steals focus from search on 60s poll", status: "needs_verification",
    issueType: "bug", severity: "p2", confidence: "medium", risk: "Cursor jumps mid-typing when poll re-renders the rail.",
    impact: "Search input loses focus every 60 seconds.", summary: "Poll re-render remounts rail subtree.",
    proposedFix: "Memoise rail; preserve focus via ref after poll merge.",
    reproductionSteps: ["Focus search", "Wait for 60s poll", "Observe cursor leaves input"],
    verificationPlan: ["Type during poll", "Focus retained"],
    filesAffected: ["dashboard/app.js"], acceptanceCriteria: ["Focus preserved across poll"],
    sourceDiscoveryIds: [], sourceRawItemIds: ["raw_focus_report"],
    dependencies: { blockedByIssueIds: [], blocksIssueIds: [], relatedIssueIds: ["issue_entity_404"] },
    implementation: { assignee: "agent:claude", branchName: "fix/rail-focus", pullRequestUrls: ["https://github.com/mm/mm/pull/214"], commitShas: ["a1c9f02"] },
    paths: { self: "memory/issues/issue_rail_focus.yaml" }, createdAt: ago(22), updatedAt: ago(3) },
  { id: "issue_search_kind", kind: "issue", title: "Search ignores kind filter on non-home routes", status: "ready_for_agent",
    issueType: "enhancement", severity: "p1", confidence: "high", risk: "Route-local search returns cross-kind matches.",
    impact: "Filtering Tasks surfaces issues with matching text.", summary: "kind param dropped before filter.",
    proposedFix: "Pass active route kind into local filter predicate.",
    verificationPlan: ["Search 'rail' on Tasks", "Only task rows shown"],
    filesAffected: ["dashboard/app.js"], acceptanceCriteria: ["Filter scoped to active kind"],
    sourceDiscoveryIds: [], sourceRawItemIds: [],
    dependencies: { blockedByIssueIds: [], blocksIssueIds: [], relatedIssueIds: [] },
    implementation: { assignee: "", branchName: "", pullRequestUrls: [], commitShas: [] },
    paths: { self: "memory/issues/issue_search_kind.yaml" }, createdAt: ago(40), updatedAt: ago(12) },
  { id: "issue_trust_stale", kind: "issue", title: "Trust strip index dot never goes amber on stale index", status: "open",
    issueType: "bug", severity: "p2", confidence: "medium", risk: "Stale index not surfaced; users trust outdated search.",
    impact: "Index signal stays emerald even when builtAt is old.", summary: "Stale threshold compared against wrong field.",
    proposedFix: "Compare summary.search.builtAt against generatedAt with 24h threshold.",
    reproductionSteps: ["Let index go stale", "Observe index dot stays green"],
    verificationPlan: ["Force stale", "Dot turns amber"],
    filesAffected: ["dashboard/TrustStrip.tsx"], acceptanceCriteria: ["Amber when stale > 24h"],
    sourceDiscoveryIds: ["disc_stale_index"], sourceRawItemIds: [],
    dependencies: { blockedByIssueIds: [], blocksIssueIds: [], relatedIssueIds: [] },
    implementation: { assignee: "", branchName: "", pullRequestUrls: [], commitShas: [] },
    paths: { self: "memory/issues/issue_trust_stale.yaml" }, createdAt: ago(55), updatedAt: ago(18) },
  { id: "issue_a11y_focus", kind: "issue", title: "Nav buttons missing visible focus ring", status: "verified",
    issueType: "enhancement", severity: "p3", confidence: "high", risk: "Keyboard users cannot see focused route.",
    impact: "Fails WCAG 2.4.7.", summary: "outline:none applied globally.",
    proposedFix: "Add :focus-visible ring in Spark on all interactive elements.",
    verificationPlan: ["Tab through nav", "Ring visible"],
    filesAffected: ["dashboard/styles.css"], acceptanceCriteria: ["Visible focus on all buttons + inputs"],
    sourceDiscoveryIds: [], sourceRawItemIds: [],
    dependencies: { blockedByIssueIds: [], blocksIssueIds: [], relatedIssueIds: [] },
    implementation: { assignee: "agent:claude", branchName: "fix/focus-ring", pullRequestUrls: ["https://github.com/mm/mm/pull/209"], commitShas: ["77be1d4", "0c2aa19"] },
    paths: { self: "memory/issues/issue_a11y_focus.yaml" }, createdAt: ago(80), updatedAt: ago(36), closedAt: ago(36) },
  { id: "issue_poll_thrash", kind: "issue", title: "60s poll re-fetches all list endpoints unconditionally", status: "needs_review",
    issueType: "performance", severity: "p2", confidence: "medium", risk: "Network thrash on large memory stores.",
    impact: "Five list endpoints hit every minute even when idle.", summary: "No ETag / conditional fetch.",
    proposedFix: "Only refetch /api/dashboard on poll; lazy-load list endpoints per route.",
    verificationPlan: ["Observe network over 3 polls"],
    filesAffected: ["dashboard/app.js"], acceptanceCriteria: ["Idle poll = 1 request"],
    sourceDiscoveryIds: [], sourceRawItemIds: [],
    dependencies: { blockedByIssueIds: [], blocksIssueIds: [], relatedIssueIds: [] },
    implementation: { assignee: "", branchName: "", pullRequestUrls: [], commitShas: [] },
    paths: { self: "memory/issues/issue_poll_thrash.yaml" }, createdAt: ago(60), updatedAt: ago(24) },
];

// ── discoveries ───────────────────────────────────────────────────────────────────
export const discoveries = [
  { id: "disc_phase_gap", kind: "discovery", title: "Phases have no canonical entity endpoint", summary: "Phase detail is only reachable via nested sprint payload; the rail expects /api/entity/phase/:id.",
    sourceType: "code_audit", sourceRawItemIds: [], status: "promoted_to_issue", recommendedAction: "promote", risk: "medium", severity: "p1",
    confidence: "high", issueType: "bug", filesAffected: ["src/commands/dashboard.mjs"], relatedContainers: ["dashboard"],
    relatedDiscoveries: [], promotedIssueId: "issue_entity_404",
    paths: { self: "memory/discoveries/disc_phase_gap.yaml" }, createdAt: ago(34), updatedAt: ago(30) },
  { id: "disc_stale_index", kind: "discovery", title: "Stale-index detection compares the wrong timestamp", summary: "Trust strip reads builtAt vs now() instead of vs generatedAt, so it never flags staleness.",
    sourceType: "code_audit", sourceRawItemIds: [], status: "promoted_to_issue", recommendedAction: "promote", risk: "low", severity: "p2",
    confidence: "medium", issueType: "bug", filesAffected: ["dashboard/TrustStrip.tsx"], relatedContainers: ["dashboard"],
    relatedDiscoveries: [], promotedIssueId: "issue_trust_stale",
    paths: { self: "memory/discoveries/disc_stale_index.yaml" }, createdAt: ago(58), updatedAt: ago(55) },
  { id: "disc_graph_unwired", kind: "discovery", title: "/api/graph exists but no Graph route is wired", summary: "Relationship edges are queryable but unreachable from the UI. Candidate future page.",
    sourceType: "code_audit", sourceRawItemIds: [], status: "needs_research", recommendedAction: "investigate", risk: "low", severity: "p3",
    confidence: "medium", issueType: "enhancement", filesAffected: ["src/commands/dashboard.mjs"], relatedContainers: ["dashboard"],
    relatedDiscoveries: [], promotedIssueId: "",
    paths: { self: "memory/discoveries/disc_graph_unwired.yaml" }, createdAt: ago(46), updatedAt: ago(44) },
  { id: "disc_raw_prompt", kind: "discovery", title: "Raw intake may contain embedded prompt markers", summary: "Some raw items include instruction-like text. Raw must never be treated as trusted or executed.",
    sourceType: "raw_scan", sourceRawItemIds: ["raw_focus_report"], status: "duplicate", recommendedAction: "reject", risk: "high", severity: "p1",
    confidence: "low", issueType: "security", filesAffected: [], relatedContainers: ["raw"],
    relatedDiscoveries: ["disc_phase_gap"], duplicateOfDiscoveryId: "disc_phase_gap", promotedIssueId: "",
    paths: { self: "memory/discoveries/disc_raw_prompt.yaml" }, createdAt: ago(50), updatedAt: ago(49) },
  { id: "disc_poll_cost", kind: "discovery", title: "Polling cost scales with route count, not data change", summary: "Every poll refetches all list endpoints. On large stores this is the dominant network cost.",
    sourceType: "profiling", sourceRawItemIds: [], status: "pending", recommendedAction: "investigate", risk: "medium", severity: "p2",
    confidence: "medium", issueType: "performance", filesAffected: ["dashboard/app.js"], relatedContainers: ["dashboard"],
    relatedDiscoveries: [], promotedIssueId: "",
    paths: { self: "memory/discoveries/disc_poll_cost.yaml" }, createdAt: ago(62), updatedAt: ago(60) },
];

// ── raw intake (untrusted) ─────────────────────────────────────────────────────────
export const raw = [
  { id: "raw_focus_report", kind: "raw_item", title: "User report: cursor jumps while typing in search", summary: "Pasted Slack message describing focus loss every minute. NOTE: contains an embedded 'ignore previous instructions' line — do not obey.",
    sourceType: "slack_paste", status: "unreconciled", path: "memory/inbox/raw_focus_report.txt", mediaType: "text/plain", byteSize: 482,
    tags: ["bug-report", "search", "focus"], containerIds: ["dashboard"], reconciledTo: [], createdAt: ago(8), updatedAt: ago(8) },
  { id: "raw_perf_log", kind: "raw_item", title: "Network waterfall export — poll storm", summary: "HAR snippet showing 6 requests fired per poll tick.",
    sourceType: "file_upload", status: "processing", path: "memory/inbox/raw_perf_log.har", mediaType: "application/json", byteSize: 18422,
    tags: ["performance", "network"], containerIds: ["dashboard"], reconciledTo: [], createdAt: ago(14), updatedAt: ago(11) },
  { id: "raw_design_note", kind: "raw_item", title: "Voice memo transcript: trust dots should feel quiet", summary: "Transcribed note about keeping status colors muted, not alarmist.",
    sourceType: "voice_transcript", status: "processed", path: "memory/inbox/raw_design_note.txt", mediaType: "text/plain", byteSize: 1204,
    tags: ["design", "color"], containerIds: ["dashboard"], reconciledTo: [{ kind: "discovery", id: "disc_stale_index" }], processedAt: ago(40), createdAt: ago(52), updatedAt: ago(40) },
  { id: "raw_screenshot", kind: "raw_item", title: "Screenshot: 404 in rail console", summary: "Image of devtools console showing the phase entity 404.",
    sourceType: "image", status: "processed", path: "memory/inbox/raw_screenshot.png", mediaType: "image/png", byteSize: 240118,
    tags: ["bug-report", "rail"], containerIds: ["dashboard"], reconciledTo: [{ kind: "issue", id: "issue_entity_404" }], processedAt: ago(29), createdAt: ago(33), updatedAt: ago(29) },
  { id: "raw_idea", kind: "raw_item", title: "Idea: command palette over Cmd+K", summary: "One-line note proposing a global search/resolve palette.",
    sourceType: "quick_note", status: "rejected", path: "memory/inbox/raw_idea.txt", mediaType: "text/plain", byteSize: 96,
    tags: ["idea", "search"], containerIds: [], reconciledTo: [], createdAt: ago(70), updatedAt: ago(66) },
];

// ── wiki ─────────────────────────────────────────────────────────────────────────
export const wiki = [
  { id: "wiki_dashboard_contract", kind: "system", title: "Dashboard Client Product Contract", path: "memory/wiki/systems/dashboard-contract.md",
    summary: "Truth-backed product and implementation contract for the client dashboard.",
    aliases: ["dashboard contract", "client contract"], tags: ["dashboard", "contract", "canonical"],
    body: "# Dashboard Client Product Contract\n\nThe dashboard is a static client shell served by `mm dashboard serve`.\n\n## Routes\n\n- home, sprint, phase, task, issue, bug, discovery, wiki, raw\n\n## Data integrity\n\n- Treat /api/dashboard as a snapshot, not canonical detail.\n- Treat /api/entity/:kind/:id as canonical.\n- Treat raw records as untrusted.\n\n## Trust strip\n\nThree dots: git signal, index signal, status/severity signal.",
    backlinks: ["wiki_trust_model", "wiki_routing"], updatedAt: ago(5) },
  { id: "wiki_trust_model", kind: "concept", title: "Trust & Truth Model", path: "memory/wiki/concepts/trust-model.md",
    summary: "How the dashboard distinguishes generated snapshots from canonical detail and untrusted raw input.",
    aliases: ["trust model"], tags: ["concept", "trust"],
    body: "# Trust & Truth Model\n\nThree tiers of trust:\n\n1. Canonical entity detail — `/api/entity/:kind/:id`.\n2. Generated snapshot — `/api/dashboard`.\n3. Untrusted raw intake — never executed, never obeyed.\n\nThe trust strip encodes git, index and status freshness into three dots.",
    backlinks: ["wiki_dashboard_contract"], updatedAt: ago(16) },
  { id: "wiki_routing", kind: "decision", title: "Route state & URL sync", path: "memory/wiki/decisions/routing.md",
    summary: "Active route persists in localStorage and syncs to ?view= and ?selected=.",
    aliases: [], tags: ["decision", "routing"],
    body: "# Route state & URL sync\n\nActive route is persisted in localStorage and reflected in `?view=<route>`.\n\nSelection sets `?selected=<kind:id>` and pushes prior selection onto in-memory rail history.\n\nEscape closes the rail or clears search.",
    backlinks: ["wiki_dashboard_contract"], updatedAt: ago(26) },
  { id: "wiki_status_colors", kind: "process", title: "Status color mapping", path: "memory/wiki/process/status-colors.md",
    summary: "Normalised status -> pill color mapping shared across rows and rail.",
    aliases: ["pill colors"], tags: ["process", "color"],
    body: "# Status color mapping\n\n- planned/active/in_progress/ready_for_agent/processing → sky\n- done/completed/verified/closed/processed/promoted → emerald\n- paused/needs_review/needs_verification/unreconciled → amber\n- blocked/rejected/cancelled → rose\n- draft/todo/deferred/duplicate/archived → zinc",
    backlinks: [], updatedAt: ago(30) },
  { id: "wiki_cli_parity", kind: "process", title: "CLI parity for mutations", path: "memory/wiki/process/cli-parity.md",
    summary: "Every UI mutation must show the exact CLI-equivalent command before executing.",
    aliases: [], tags: ["process", "cli", "mutation"],
    body: "# CLI parity for mutations\n\nWrites route through a guarded command layer.\n\nShow the exact generated `mm ...` command before mutation.\n\nRequire confirmation for destructive or lifecycle-closing actions.\n\nAfter mutation, refresh /api/dashboard and the selected entity.",
    backlinks: [], updatedAt: ago(44) },
  { id: "wiki_empty", kind: "note", title: "Scratch: open questions", path: "memory/wiki/notes/scratch.md",
    summary: "", aliases: [], tags: ["note"], body: "", backlinks: [], updatedAt: ago(72) },
];

// ── sprints (canonical, with nested progress) ─────────────────────────────────────────
export const sprints = [
  { id: "sprint_dash", title: "Dashboard Client v2", status: "active", tone: "live",
    goal: "Ship a polished, truth-backed client dashboard on the existing runtime.",
    description: "Replace the static shell with a typed client: app shell, list pages, inspector rail, and a command center.",
    updatedAt: ago(2), containerLabels: ["dashboard", "frontend"],
    phaseIds: ["phase_scaffold", "phase_rail", "phase_home"],
    issueSummaries: [
      { id: "issue_entity_404", title: "entity/phase/:id returns 404", status: "blocked", severity: "p0" },
      { id: "issue_rail_focus", title: "Rail steals focus on poll", status: "needs_verification", severity: "p2" },
      { id: "issue_search_kind", title: "Search ignores kind filter", status: "ready_for_agent", severity: "p1" },
    ],
    progress: { taskCount: 5, phaseCount: 3, doneCount: 2, activeCount: 2, blockedCount: 1, percent: 46 },
    paths: { self: "memory/sprints/sprint_dash.yaml" } },
  { id: "sprint_search", title: "Semantic Search", status: "planned", tone: "idle",
    goal: "Build vector + lexical search across wiki and entities with explainable results.",
    description: "Index pipeline, query API, and a future Search/Resolve surface.",
    updatedAt: ago(48), containerLabels: ["search", "index"],
    phaseIds: ["phase_index"],
    issueSummaries: [],
    progress: { taskCount: 1, phaseCount: 1, doneCount: 0, activeCount: 0, blockedCount: 0, percent: 0 },
    paths: { self: "memory/sprints/sprint_search.yaml" } },
  { id: "sprint_graph", title: "Relationship Graph", status: "completed", tone: "good",
    goal: "Model and validate relationship edges between canonical entities.",
    description: "Graph build, neighborhood queries, orphan + contradiction detection.",
    updatedAt: ago(120), containerLabels: ["graph"],
    phaseIds: [],
    issueSummaries: [
      { id: "issue_a11y_focus", title: "Nav focus ring", status: "verified", severity: "p3" },
    ],
    progress: { taskCount: 6, phaseCount: 2, doneCount: 6, activeCount: 0, blockedCount: 0, percent: 100 },
    paths: { self: "memory/sprints/sprint_graph.yaml" } },
];

// ── activity feed ──────────────────────────────────────────────────────────────────
export const recentActivity = [
  { at: ago(2),  entityType: "task",      entityId: "task_4c1",  title: "Home attention queue logic", event: "status_change", status: "in_progress", note: "Wired blocked + unpromoted aggregation", commits: ["b22d10a"] },
  { at: ago(3),  entityType: "issue",     entityId: "issue_rail_focus", title: "Rail steals focus on poll", event: "linked_pr", status: "needs_verification", note: "PR #214 opened", commits: ["a1c9f02"] },
  { at: ago(6),  entityType: "task",      entityId: "task_4b2",  title: "Wire entity detail fetch", event: "blocked", status: "blocked", note: "Blocked by phase entity 404", commits: [] },
  { at: ago(8),  entityType: "raw",       entityId: "raw_focus_report", title: "Cursor jumps while typing", event: "ingested", status: "unreconciled", note: "From Slack paste", commits: [] },
  { at: ago(20), entityType: "task",      entityId: "task_4a2",  title: "EntitySummary normaliser", event: "completed", status: "done", note: "Done without verification evidence", commits: ["9f31c0e"] },
  { at: ago(30), entityType: "discovery", entityId: "disc_phase_gap", title: "Phases have no entity endpoint", event: "promoted", status: "promoted_to_issue", note: "→ issue_entity_404", commits: [] },
];

// ── summary snapshot ─────────────────────────────────────────────────────────────────
export const summary = {
  sprints: { total: 3, active: 1, planned: 1, completed: 1 },
  phases: { total: 4, completed: 1, active: 2 },
  tasks: { total: 6, done: 2, blocked: 1, inProgress: 2 },
  issues: { total: 6, open: 5, bySeverity: { p0: 1, p1: 2, p2: 3, p3: 0 }, byStatus: { blocked: 1, needs_verification: 1, ready_for_agent: 1, open: 1, verified: 1, needs_review: 1 } },
  containers: { total: 5, byStatus: { active: 4, archived: 1 } },
  discoveries: { total: 5, promoted: 2, pending: 1, byStatus: { promoted_to_issue: 2, needs_research: 1, duplicate: 1, pending: 1 } },
  raw: { total: 5, unresolved: 2, processed: 2, rejected: 1 },
  comments: { total: 14 },
  relationships: { total: 38 },
  wiki: { pages: 6 },
  search: { ready: true, builtAt: ago(40), pages: 6, chunks: 214, mode: "hybrid", vectorDims: 768, indexed: true },
};

export const generatedAt = ago(0.2);
