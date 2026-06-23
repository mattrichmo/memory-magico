// Pure view logic ported out of the DCLogic class.
// Reads the fixture and derives colors, meta strings, relationships, queues.
import * as D from "../data.js";

export { D };

// ── index ───────────────────────────────────────────────────────────────────
export const byId = {};
const add = (kind, arr) => arr.forEach((r) => { byId[r.id] = { kind, rec: r }; });
add("sprint", D.sprints); add("phase", D.phases); add("task", D.tasks);
add("issue", D.issues); add("discovery", D.discoveries);
add("wiki", D.wiki); add("raw", D.raw);

export const bugs = D.issues.filter((i) => i.issueType === "bug" || i.kind === "bug" || i.type === "bug");

export function getRecord(kind, id) {
  if (kind === "bug") { const r = D.issues.find((i) => i.id === id); return r ? { kind: "bug", rec: r } : null; }
  return byId[id] || null;
}

// ── canonical child→parent relationships (per DESIGN_NOTES.md) ────────────────
// Arrays like sprint.phaseIds / phase.taskIds are convenience/derived; the
// canonical edges are phase.sprintId and task.phaseId. Derive drill-down here.
export const phasesOfSprint = (sprintId) => D.phases.filter((p) => p.sprintId === sprintId);
export const tasksOfPhase = (phaseId) => D.tasks.filter((t) => t.phaseId === phaseId);
export const tasksOfSprint = (sprintId) => D.tasks.filter((t) => t.sprintId === sprintId);
export const issuesOfTask = (taskId) => { const t = byId[taskId]; return t ? D.issues.filter((i) => (t.rec.issueIds || []).includes(i.id)) : []; };
export const tasksForIssue = (issueId) => D.tasks.filter((t) => (t.issueIds || []).includes(issueId));

// ── time + text ──────────────────────────────────────────────────────────────
export function rel(iso) {
  if (!iso) return "";
  const base = Date.parse(D.generatedAt);
  const h = Math.round((base - Date.parse(iso)) / 3600000);
  if (h < 1) return "now";
  if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}
export const pretty = (s) => (s || "").replace(/_/g, " ");

// ── color language ─────────────────────────────────────────────────────────────
export const sigColor = (name) => D.SIGNAL[name] || D.SIGNAL.zinc;

const BG_MAP = {
  emerald: "rgba(45,181,99,0.14)", sky: "rgba(79,163,209,0.16)",
  amber: "rgba(217,164,65,0.16)", rose: "rgba(206,106,92,0.16)", zinc: "rgba(107,123,110,0.16)",
};
export function statusColors(status) {
  const tone = D.toneFor(status);
  return { color: sigColor(tone), bg: BG_MAP[tone] || BG_MAP.zinc, tone };
}

// ── trust dots ───────────────────────────────────────────────────────────────
function gitColor(rec) {
  const paths = [].concat(rec.filesAffected || [], rec.path ? [rec.path] : []);
  const dirty = D.gitStatus.dirtyFiles;
  let hit = null;
  for (const p of paths) { const m = dirty.find((d) => d.path === p); if (m) { hit = m; if (m.kind === "authored") break; } }
  if (!hit) return { color: sigColor("emerald"), title: "git: clean" };
  return hit.kind === "authored"
    ? { color: sigColor("rose"), title: "git: authored dirty" }
    : { color: sigColor("amber"), title: "git: generated dirty" };
}
function indexColor(rec) {
  const built = Date.parse(D.summary.search.builtAt);
  const upd = Date.parse(rec.updatedAt || rec.createdAt || D.generatedAt);
  if (!D.summary.search.indexed) return { color: sigColor("zinc"), title: "index: off" };
  return upd > built
    ? { color: sigColor("amber"), title: "index: stale (updated after build)" }
    : { color: sigColor("emerald"), title: "index: fresh" };
}
function statusDot(rec) {
  const tone = rec.severity ? D.sevTone(rec.severity) : D.toneFor(rec.status);
  const label = rec.severity ? "severity: " + rec.severity : "status: " + pretty(rec.status);
  return { color: sigColor(tone), title: label };
}
export const dots = (rec) => [gitColor(rec), indexColor(rec), statusDot(rec)];
export { gitColor, indexColor };

// ── per-kind meta line ───────────────────────────────────────────────────────
export function meta(kind, r) {
  switch (kind) {
    case "sprint": return r.progress.percent + "%  ·  " + r.progress.doneCount + "/" + r.progress.taskCount + " tasks  ·  " + r.progress.phaseCount + " phases";
    case "phase": return "Phase " + (r.number ?? "–") + "  ·  " + r.sprintTitle + "  ·  " + r.progress.percent + "%";
    case "task": return r.sprintTitle + "  ›  " + r.phaseTitle;
    case "issue": case "bug": return (r.severity || "").toUpperCase() + "  ·  " + r.issueType + "  ·  " + r.confidence + " conf";
    case "discovery": return r.recommendedAction + "  ·  " + r.confidence + " conf  ·  " + r.sourceType;
    case "wiki": return r.kind + "  ·  " + (r.path || "").split("/").pop();
    case "raw": return r.sourceType + "  ·  " + (r.byteSize || 0) + " b";
    default: return r.id;
  }
}

// ── collections + search ──────────────────────────────────────────────────────
export function collection(route) {
  switch (route) {
    case "sprint": return D.sprints.map((r) => ["sprint", r]);
    case "phase": return D.phases.map((r) => ["phase", r]);
    case "task": return D.tasks.map((r) => ["task", r]);
    case "issue": return D.issues.map((r) => ["issue", r]);
    case "bug": return bugs.map((r) => ["bug", r]);
    case "discovery": return D.discoveries.map((r) => ["discovery", r]);
    case "wiki": return D.wiki.map((r) => ["wiki", r]);
    case "raw": return D.raw.map((r) => ["raw", r]);
    default: return [];
  }
}
export function matches(kind, r, q) {
  if (!q) return true;
  q = q.toLowerCase();
  const hay = [r.id, r.title, r.path, r.status, meta(kind, r), (r.tags || []).join(" ")].join(" ").toLowerCase();
  return hay.includes(q);
}

// ── attention queue ──────────────────────────────────────────────────────────
export function attention() {
  const out = [];
  const push = (kind, r, reason, tone, glyph) => out.push({ kind, r, reason, tone, glyph });
  D.tasks.filter((t) => t.status === "blocked").forEach((t) => push("task", t, "blocked task", "rose", "▤"));
  D.tasks.filter((t) => t.status === "done" && (!t.verificationEvidence || !t.verificationEvidence.length)).forEach((t) => push("task", t, "done · no verification evidence", "amber", "▤"));
  D.issues.filter((i) => ["p0", "p1"].includes((i.severity || "").toLowerCase()) && i.status !== "verified").forEach((i) => push(i.issueType === "bug" ? "bug" : "issue", i, (i.severity || "").toUpperCase() + " · " + pretty(i.status), "rose", i.issueType === "bug" ? "⊘" : "◇"));
  D.issues.filter((i) => i.status === "needs_verification").forEach((i) => push("issue", i, "needs verification", "amber", "◇"));
  D.discoveries.filter((d) => !["promoted_to_issue", "rejected", "duplicate"].includes(d.status)).forEach((d) => push("discovery", d, "discovery not promoted", "amber", "✦"));
  D.raw.filter((x) => ["unreconciled", "processing"].includes(x.status)).forEach((x) => push("raw", x, "raw · " + pretty(x.status), "amber", "≋"));
  const seen = new Set(); const uniq = [];
  for (const a of out) { if (seen.has(a.r.id)) continue; seen.add(a.r.id); uniq.push(a); }
  const rank = { rose: 0, amber: 1, sky: 2, zinc: 3 };
  uniq.sort((a, b) => rank[a.tone] - rank[b.tone]);
  return uniq;
}

// ── home metrics ─────────────────────────────────────────────────────────────
export function homeMetrics() {
  const blockedTasks = D.tasks.filter((t) => t.status === "blocked").length;
  const blockedIssues = D.issues.filter((i) => i.status === "blocked").length;
  const builtAt = Date.parse(D.summary.search.builtAt);
  const stale = [].concat(D.sprints, D.phases, D.tasks, D.issues, D.discoveries, D.wiki, D.raw)
    .filter((r) => Date.parse(r.updatedAt || r.createdAt || D.generatedAt) > builtAt).length;
  return [
    { label: "Authored dirty", value: D.gitStatus.authoredDirty, tone: "rose", note: "uncommitted source files" },
    { label: "Generated dirty", value: D.gitStatus.generatedDirty, tone: "amber", note: "regenerate to sync" },
    { label: "Index stale", value: stale, tone: stale ? "amber" : "emerald", note: "edited after last build" },
    { label: "Raw unresolved", value: D.summary.raw.unresolved, tone: "amber", note: "awaiting reconciliation" },
    { label: "Blockers", value: blockedTasks + blockedIssues, tone: "rose", note: "blocked tasks + issues" },
  ];
}

// ── task check state (for drill-down checklists) ─────────────────────────────
export function taskCheck(status) {
  const s = (status || "").toLowerCase();
  if (["done", "completed", "verified", "closed"].includes(s)) return { glyph: "☑", tone: "emerald" };
  if (s === "blocked") return { glyph: "▣", tone: "rose" };
  if (["in_progress", "active", "ready_for_agent"].includes(s)) return { glyph: "◐", tone: "sky" };
  return { glyph: "☐", tone: "zinc" };
}

// ── cli command for an entity ────────────────────────────────────────────────
export function cliCmd(kind, r) {
  if (kind === "raw") return "mm raw show " + r.id;
  if (kind === "wiki") return "mm resolve " + r.id + " --json";
  if (kind === "bug") return "mm issue show " + r.id;
  return "mm " + kind + " show " + r.id;
}
