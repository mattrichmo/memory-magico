import { el } from "../lib/dom.js";
import * as L from "../lib/logic.js";
import { trustDots, bar } from "./primitives.js";

const { D } = L;

function metricCard(m) {
  const color = L.sigColor(m.tone);
  return el("div", { class: "mm-metric" },
    el("div", { class: "head" },
      el("span", { class: "dot", style: { background: color } }),
      el("span", { class: "lbl" }, m.label)),
    el("div", { class: "val", style: { color } }, m.value),
    el("div", { class: "note" }, m.note));
}

function activeSprintCard(actions) {
  const as = D.sprints.find((s) => s.status === "active") || D.sprints[0];
  const p = as.progress;
  const stat = (val, label, color) => el("div", null,
    el("span", { class: "mm-stat", style: { color } }, val),
    el("span", { class: "mm-stat-lbl" }, label));
  return el("button", { class: "mm-active-sprint mm-hit", onClick: () => actions.select("sprint", as.id) },
    el("div", { style: { display: "flex", "align-items": "center", gap: "9px", "margin-bottom": "6px" } },
      trustDots(as),
      el("span", { class: "id" }, as.id)),
    el("div", { class: "title" }, as.title),
    el("div", { class: "goal" }, as.goal),
    el("div", { class: "mm-bar", style: { "margin-bottom": "14px" } }, el("span", { style: { width: p.percent + "%" } })),
    el("div", { style: { display: "flex", gap: "22px" } },
      stat(p.doneCount, "done", "var(--emerald)"),
      stat(p.blockedCount, "blocked", "var(--rose)"),
      stat(p.taskCount, "tasks", "var(--ink-mid)")));
}

function activityFeed(actions) {
  return el("div", { class: "mm-feed" },
    D.recentActivity.map((a) => el("button", {
      class: "mm-feed-row mm-hit",
      onClick: () => { const e = L.byId[a.entityId]; e ? actions.select(e.kind, a.entityId) : actions.flash("not indexed: " + a.entityId); },
    },
      el("span", { class: "when" }, L.rel(a.at)),
      el("span", { class: "dot", style: { background: L.sigColor(D.toneFor(a.status)) } }),
      el("span", { style: { flex: "1", "min-width": "0" } },
        el("span", { class: "ttl" }, a.title),
        el("span", { class: "note" }, L.pretty(a.event) + " · " + a.note)))));
}

function attentionQueue(actions) {
  const att = L.attention();
  return el("div", null,
    el("div", { class: "mm-att-head" },
      el("span", { class: "mm-eyebrow" }, "Attention Queue"),
      el("span", { class: "mm-att-count" }, att.length + " need action")),
    el("div", { class: "mm-att-list" },
      att.map((a) => {
        const color = L.sigColor(a.tone);
        const tag = a.tone === "rose" ? "urgent" : a.tone === "amber" ? "review" : "queued";
        return el("button", { class: "mm-att mm-hit", style: { "border-left-color": color }, onClick: () => actions.select(a.kind, a.r.id) },
          el("span", { class: "glyph", style: { color } }, a.glyph),
          el("span", { style: { flex: "1", "min-width": "0" } },
            el("span", { class: "ttl" }, a.r.title),
            el("span", { class: "reason" }, a.reason)),
          el("span", { class: "tag", style: { color, "border-color": color } }, tag));
      })));
}

export function home(state, actions) {
  return el("div", { class: "mm-home" },
    el("div", { class: "mm-metrics" }, L.homeMetrics().map(metricCard)),
    el("div", { class: "mm-home-grid" },
      el("div", null,
        el("div", { class: "mm-eyebrow", style: { "margin-bottom": "10px" } }, "Active Sprint"),
        activeSprintCard(actions),
        el("div", { class: "mm-eyebrow", style: { margin: "22px 0 10px" } }, "Recent Activity"),
        activityFeed(actions)),
      attentionQueue(actions)));
}
