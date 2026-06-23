import { el } from "../lib/dom.js";
import * as L from "../lib/logic.js";

const { D } = L;

// The header is rebuilt only on route change — never on a search keystroke —
// so the search input keeps focus + caret while typing (avoids issue_rail_focus).
export function header(state, actions) {
  const isHome = state.route === "home";
  const rdef = D.ROUTES.find((r) => r.id === state.route);
  const title = isHome ? "Command Center" : rdef.label;
  const subtitle = isHome
    ? "What's actually true right now, not just what's stored."
    : "Canonical " + rdef.label.toLowerCase() + " from the live snapshot.";

  const search = isHome ? null : el("div", { class: "mm-search" },
    el("span", { class: "icon" }, "⌕"),
    el("input", {
      class: "mm-input", type: "text", value: state.search,
      placeholder: "Search " + rdef.label.toLowerCase() + "…",
      ref: (n) => { actions.registerSearch(n); },
      onInput: (e) => actions.setSearch(e.target.value),
    }),
    el("span", { class: "kbd" }, "/"));

  return el("header", { class: "mm-header" },
    el("div", null,
      el("div", { class: "mm-title" }, title),
      el("div", { class: "mm-subtitle" }, subtitle)),
    search);
}
