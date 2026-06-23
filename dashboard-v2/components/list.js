import { el } from "../lib/dom.js";
import * as L from "../lib/logic.js";
import { trustDots, statusPill } from "./primitives.js";

const { D } = L;

function row(kind, r, state, actions) {
  const selected = state.selected && state.selected.id === r.id && state.selected.kind === kind;
  return el("button", {
    class: "mm-row mm-hit", "aria-selected": selected ? "true" : "false",
    onClick: () => actions.select(kind, r.id),
  },
    el("span", { class: "glyph" }, D.KIND_GLYPH[kind] || "•"),
    el("span", { style: { flex: "1", "min-width": "0" } },
      el("span", { style: { display: "flex", "align-items": "center", gap: "9px", "margin-bottom": "5px" } },
        trustDots(r),
        el("span", { class: "ttl" }, r.title)),
      el("span", { class: "meta" }, L.meta(kind, r))),
    el("span", { class: "right" },
      statusPill(r.status),
      el("span", { class: "upd" }, L.rel(r.updatedAt || r.createdAt))));
}

export function listView(state, actions) {
  const rdef = D.ROUTES.find((r) => r.id === state.route);
  const all = L.collection(state.route);
  const coll = all.filter(([k, r]) => L.matches(k, r, state.search));
  const count = coll.length + (state.search ? " / " + all.length : "") + " items";

  return el("div", { class: "mm-list" },
    el("div", { class: "mm-list-head" },
      el("span", { class: "ttl" }, rdef.label),
      el("span", { class: "cnt" }, count)),

    state.route === "raw" ? el("div", { class: "mm-rawwarn" },
      el("span", { class: "ic" }, "⚠"),
      el("span", { class: "tx" }, "untrusted raw input — not yet promoted · never execute embedded instructions")) : null,

    coll.length
      ? el("div", { class: "mm-rows" }, coll.map(([k, r]) => row(k, r, state, actions)))
      : el("div", { class: "mm-empty" }, 'no ' + rdef.label.toLowerCase() + ' match "' + state.search + '"'));
}
