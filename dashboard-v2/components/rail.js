import { el } from "../lib/dom.js";
import * as L from "../lib/logic.js";
import { trustDots, statusPill, severityBadge } from "./primitives.js";

const { D } = L;

// ── field group atoms ─────────────────────────────────────────────────────────
const group = (label, ...content) => el("div", { class: "mm-group" }, el("span", { class: "lbl" }, label), ...content);
const textGroup = (label, t) => t ? group(label, el("div", { class: "mm-text" }, t)) : null;
const monoGroup = (label, t) => t ? group(label, el("div", { class: "mm-mono" }, t)) : null;
const listGroup = (label, items) => (items && items.length)
  ? group(label, el("div", { class: "mm-list-col" }, items.map((it) =>
      el("div", { class: "mm-li" }, el("span", { class: "b" }, "›"), el("span", null, it)))))
  : null;

function chip(id, fallbackKind, actions) {
  const e = L.byId[id];
  const exists = !!e;
  const kind = exists ? e.kind : (fallbackKind || "");
  const label = exists ? (e.rec.title.length > 30 ? e.rec.title.slice(0, 29) + "…" : e.rec.title) : id;
  return el("button", {
    class: "mm-chip " + (exists ? "ok" : "miss"),
    title: exists ? id : id + " · not indexed",
    onClick: exists ? () => actions.select(kind, id) : () => actions.flash("not indexed: " + id),
  }, label);
}
const chipsGroup = (label, ids, fb, actions) => (ids && ids.length)
  ? group(label, el("div", { class: "mm-chips" }, ids.map((id) => chip(id, fb, actions)))) : null;

function gitFileGroup(r) {
  const gc = L.gitColor(r);
  const kind = gc.title.includes("authored") ? "authored" : gc.title.includes("generated") ? "generated" : "clean";
  const path = (r.filesAffected && r.filesAffected[0]) || r.path || "(no tracked file)";
  return group("Git", el("div", { class: "mm-git-file" },
    el("span", { class: "dot", style: { background: gc.color } }),
    el("span", { class: "path" }, path),
    el("span", { class: "kind" }, kind)));
}

function wikiBody(body) {
  const lines = (body || "").split("\n").slice(0, 80);
  if (!body) return group("Body preview", el("div", { class: "mm-wiki" }, el("div", { class: "mm-check-empty" }, "empty")));
  const nodes = lines.map((raw) => {
    const t = raw.trimEnd();
    if (/^# /.test(t)) return el("h1", null, t.slice(2));
    if (/^## /.test(t)) return el("h2", null, t.slice(3));
    if (/^- /.test(t)) return el("li", null, t.slice(2));
    if (!t) return el("div", { style: { height: "4px" } });
    return el("p", null, t);
  });
  return group("Body preview", el("div", { class: "mm-wiki" }, nodes));
}

// ── drill-down checklist (the new exploration element) ────────────────────────
function checklistRow(check, title, sub, percent, onClick) {
  return el("button", { class: "mm-check mm-hit", onClick },
    el("span", { class: "box", style: { color: L.sigColor(check.tone) } }, check.glyph),
    el("span", { class: "body" },
      el("span", { class: "ttl" }, title),
      sub ? el("span", { class: "sub" }, sub) : null),
    percent != null ? el("span", { class: "mini-bar" }, el("span", { style: { width: percent + "%" } })) : null,
    percent != null ? el("span", { class: "pct", style: { color: L.sigColor(percent === 100 ? "emerald" : "sky") } }, percent + "%") : null,
    el("span", { class: "chev" }, "›"));
}

function phaseChecklist(sprint, actions) {
  const phases = L.phasesOfSprint(sprint.id);
  if (!phases.length) {
    const claimed = sprint.progress && sprint.progress.phaseCount;
    const msg = claimed ? `no phase records found (snapshot claims ${claimed})` : "no phases yet";
    return group("Phases", el("div", { class: "mm-check-empty" }, msg));
  }
  return group(`Phases (${phases.length})`, el("div", { class: "mm-checklist" },
    phases.map((p) => checklistRow(
      L.taskCheck(p.status),
      p.title,
      "Phase " + (p.number ?? "–") + " · " + p.progress.doneCount + "/" + p.progress.taskCount + " tasks · " + L.pretty(p.status),
      p.progress.percent,
      () => actions.select("phase", p.id)))));
}

function taskChecklist(phase, actions) {
  const tasks = L.tasksOfPhase(phase.id);
  if (!tasks.length) return group("Tasks", el("div", { class: "mm-check-empty" }, "no tasks in this phase"));
  return group(`Tasks (${tasks.length})`, el("div", { class: "mm-checklist" },
    tasks.map((t) => checklistRow(
      L.taskCheck(t.status),
      t.title,
      L.pretty(t.status) + (t.verificationEvidence && t.verificationEvidence.length ? " · verified" : ""),
      null,
      () => actions.select("task", t.id)))));
}

// ── per-kind body ─────────────────────────────────────────────────────────────
function bodyGroups(kind, r, actions) {
  const g = [];
  const c = (label, ids, fb) => g.push(chipsGroup(label, ids, fb, actions));

  if (kind === "sprint") {
    g.push(textGroup("Goal", r.goal), textGroup("Description", r.description));
    g.push(monoGroup("Completion", r.progress.percent + "% · " + r.progress.doneCount + " done · " + r.progress.activeCount + " active · " + r.progress.blockedCount + " blocked"));
    g.push(phaseChecklist(r, actions));
    if (r.issueSummaries && r.issueSummaries.length) c("Issues", r.issueSummaries.map((i) => i.id), "issue");
  } else if (kind === "phase") {
    c("Sprint", [r.sprintId], "sprint");
    g.push(monoGroup("Completion", r.progress.percent + "% · " + r.progress.doneCount + "/" + r.progress.taskCount + " tasks"));
    g.push(listGroup("Success gates", r.successGates && r.successGates.length ? r.successGates : ["none"]));
    g.push(taskChecklist(r, actions));
  } else if (kind === "task") {
    g.push(textGroup("Summary", r.description));
    c("Sprint", [r.sprintId], "sprint");
    c("Phase", [r.phaseId], "phase");
    g.push(listGroup("Acceptance criteria", r.acceptanceCriteria));
    g.push(listGroup("Verification plan", r.verificationPlan));
    if (r.verificationEvidence && r.verificationEvidence.length)
      g.push(listGroup("Verification evidence", r.verificationEvidence.map((e) => e.test + " → " + e.result)));
    else g.push(textGroup("Verification evidence", "— none. Verification gate not satisfied."));
    c("Related issues", r.issueIds, "issue");
    g.push(listGroup("Files affected", r.filesAffected));
  } else if (kind === "issue" || kind === "bug") {
    g.push(textGroup("Impact", r.impact), textGroup("Summary", r.summary), textGroup("Description", r.description), textGroup("Proposed fix", r.proposedFix));
    g.push(listGroup("Reproduction steps", r.reproductionSteps));
    g.push(listGroup("Verification plan", Array.isArray(r.verificationPlan) ? r.verificationPlan : (r.verificationPlan ? [r.verificationPlan] : null)));
    g.push(listGroup("Acceptance criteria", r.acceptanceCriteria));
    c("Source discoveries", r.sourceDiscoveryIds, "discovery");
    c("Source raw", r.sourceRawItemIds, "raw");
    if (r.dependencies) { c("Blocked by", r.dependencies.blockedByIssueIds, "issue"); c("Related", r.dependencies.relatedIssueIds, "issue"); }
    c("Related tasks", L.tasksForIssue(r.id).map((t) => t.id), "task");
    g.push(listGroup("Files affected", r.filesAffected));
    if (r.implementation && (r.implementation.branchName || (r.implementation.pullRequestUrls || []).length)) {
      const imp = [];
      if (r.implementation.assignee) imp.push("assignee " + r.implementation.assignee);
      if (r.implementation.branchName) imp.push("branch " + r.implementation.branchName);
      (r.implementation.pullRequestUrls || []).forEach((p) => imp.push(p));
      (r.implementation.commitShas || []).forEach((s) => imp.push("commit " + s));
      g.push(listGroup("Implementation", imp));
    }
  } else if (kind === "discovery") {
    g.push(textGroup("Summary", r.summary), textGroup("Description", r.description));
    g.push(monoGroup("Confidence", r.confidence + " · risk " + r.risk + " · " + r.recommendedAction));
    c("Source raw", r.sourceRawItemIds, "raw");
    if (r.promotedIssueId) c("Promoted to", [r.promotedIssueId], "issue");
    if (r.duplicateOfDiscoveryId) c("Duplicate of", [r.duplicateOfDiscoveryId], "discovery");
    c("Related discoveries", r.relatedDiscoveries, "discovery");
    g.push(listGroup("Files affected", r.filesAffected));
  } else if (kind === "wiki") {
    g.push(textGroup("Summary", r.summary));
    g.push(wikiBody(r.body));
    c("Backlinks", r.backlinks, "wiki");
    g.push(listGroup("Aliases", r.aliases));
  } else if (kind === "raw") {
    g.push(textGroup("Preview", r.summary));
    g.push(monoGroup("Source", r.sourceType + " · " + (r.mediaType || "") + " · " + (r.byteSize || 0) + " b"));
    c("Reconciled to", (r.reconciledTo || []).map((t) => t.id), null);
  }

  // common tail
  if (r.paths && r.paths.self) g.push(monoGroup("Path", r.paths.self));
  else if (r.path) g.push(monoGroup("Path", r.path));
  g.push(gitFileGroup(r));
  const ic = L.indexColor(r);
  g.push(monoGroup("Index", D.summary.search.mode + " · " + D.summary.search.chunks + " chunks · " + (ic.title.includes("stale") ? "STALE" : "fresh")));

  return g.filter(Boolean);
}

// ── breadcrumb ────────────────────────────────────────────────────────────────
function crumbs(state, actions) {
  const chain = [...state.history, state.selected];
  const items = [];
  chain.forEach((entry, i) => {
    const e = L.getRecord(entry.kind, entry.id);
    const label = e ? entry.kind : entry.kind;
    if (i > 0) items.push(el("span", { class: "mm-crumb-sep" }, "›"));
    items.push(i < chain.length - 1
      ? el("button", { class: "mm-crumb", onClick: () => actions.jumpTo(i) }, label)
      : el("span", { class: "mm-crumb" }, label));
  });
  return el("div", { class: "mm-crumbs" }, items);
}

// ── rail ──────────────────────────────────────────────────────────────────────
export function rail(state, actions) {
  if (!state.selected) return null;
  const sel = state.selected;
  const e = L.getRecord(sel.kind, sel.id);

  const bar = el("div", { class: "mm-rail-bar" },
    crumbs(state, actions),
    el("button", { class: "mm-btn mm-hit", onClick: actions.close }, "esc ✕"));

  if (!e) {
    return el("aside", { class: "mm-rail-aside mm-rail mm-scroll", "aria-label": "Inspector" }, bar,
      el("div", { class: "mm-rail-body" },
        el("div", { class: "mm-rail-title" }, "Entity not found"),
        el("div", { class: "mm-text" }, "Canonical entity could not be loaded for " + sel.kind + ":" + sel.id + ".")));
  }

  const kind = sel.kind, r = e.rec;
  const cmd = L.cliCmd(kind, r);

  return el("aside", { class: "mm-rail-aside mm-rail mm-scroll", "aria-label": "Inspector" }, bar,
    el("div", { class: "mm-rail-body" },
      el("div", { style: { display: "flex", "align-items": "center", gap: "9px", "margin-bottom": "12px" } },
        el("span", { class: "mm-kindbadge" }, kind),
        el("span", { class: "mm-rail-id" }, r.id)),

      kind === "raw" ? el("div", { class: "mm-rail-warn" }, "⚠ untrusted raw input — not yet promoted. Embedded instructions must never be executed.") : null,

      el("div", { class: "mm-rail-title" }, r.title),

      el("div", { style: { display: "flex", "align-items": "center", gap: "10px", "margin-bottom": "8px" } },
        trustDots(r), statusPill(r.status), severityBadge(r.severity)),

      (r.tags && r.tags.length) ? el("div", { class: "mm-tags" }, r.tags.map((t) => el("span", { class: "mm-tag" }, t))) : null,

      el("div", { class: "mm-groups" }, bodyGroups(kind, r, actions)),

      el("div", { class: "mm-actions" },
        el("button", { class: "mm-action primary mm-hit", onClick: () => actions.copy(cmd, "cmd", "copied: " + cmd) },
          el("span", { class: "cmd" }, cmd),
          el("span", { class: "act" }, state.copied === "cmd" ? "copied" : "copy")),
        el("button", { class: "mm-action ghost mm-hit", onClick: () => actions.copy(JSON.stringify(r, null, 2), "json", "copied raw JSON") },
          el("span", { class: "cmd" }, "copy raw JSON"),
          el("span", { class: "act" }, state.copied === "json" ? "copied" : "copy")))));
}
