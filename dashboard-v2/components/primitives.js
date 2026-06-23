// Small reusable UI atoms shared across surfaces.
import { el } from "../lib/dom.js";
import * as L from "../lib/logic.js";

export function trustDots(rec) {
  return el("span", { class: "mm-dots" },
    L.dots(rec).map((d) => el("span", { class: "dot", title: d.title, style: { background: d.color } })));
}

export function statusPill(status) {
  const sc = L.statusColors(status);
  return el("span", { class: "mm-pill", style: { color: sc.color, background: sc.bg } }, L.pretty(status));
}

export function severityBadge(severity) {
  if (!severity) return null;
  const c = L.sigColor(L.D.sevTone(severity));
  return el("span", { class: "mm-sev", style: { color: c, "border-color": c } }, (severity || "").toUpperCase());
}

export function bar(percent) {
  return el("div", { class: "mm-bar" }, el("span", { style: { width: (percent || 0) + "%" } }));
}
