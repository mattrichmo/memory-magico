import { el } from "../lib/dom.js";
import * as L from "../lib/logic.js";

const { D } = L;

function brandMark() {
  return el("div", { class: "mm-brand-mark" },
    el("span", { style: { "grid-column": "3", background: "var(--emerald)" } }),
    el("span", { style: { "grid-column": "2/5", height: "3px", "align-self": "center", background: "var(--emerald)", opacity: ".7" } }),
    el("span", { style: { "grid-column": "1/6", height: "3px", "align-self": "center", background: "var(--emerald)", opacity: ".45" } }),
    el("span", { style: { "grid-column": "3", background: "#1A5C35" } }));
}

export function sidebar(state, actions) {
  const counts = {
    sprint: D.sprints.length, phase: D.phases.length, task: D.tasks.length,
    issue: D.issues.length, bug: L.bugs.length, discovery: D.discoveries.length,
    wiki: D.wiki.length, raw: D.raw.length, home: "",
  };

  return el("nav", { class: "mm-sidebar mm-scroll", "aria-label": "Primary navigation" },
    el("div", { class: "mm-brand" }, brandMark(),
      el("div", { class: "mm-brand-name", html: "Memory<br>Magico" })),

    el("div", { class: "mm-branch" },
      el("span", { class: "mm-pulse" }),
      el("span", { class: "mm-branch-name" }, D.gitStatus.branch)),

    el("div", { class: "mm-gitline" },
      el("div", null, el("span", { class: "num", style: { color: "var(--rose)" } }, D.gitStatus.authoredDirty),
        el("span", { class: "lbl" }, "authored")),
      el("div", null, el("span", { class: "num", style: { color: "var(--amber)" } }, D.gitStatus.generatedDirty),
        el("span", { class: "lbl" }, "generated"))),

    el("div", { class: "mm-nav-list" },
      D.ROUTES.map((r) => {
        const on = r.id === state.route;
        return el("button", {
          class: "mm-nav mm-hit", "aria-current": on ? "page" : "false",
          onClick: () => actions.go(r.id),
        },
          el("span", { class: "glyph" }, r.glyph),
          el("span", { class: "label" }, r.label),
          el("span", { class: "count" }, counts[r.id] === "" ? "" : counts[r.id]));
      })),

    el("div", { class: "mm-foot", html: "mm dashboard serve<br>snapshot · " + L.rel(D.generatedAt) }));
}
