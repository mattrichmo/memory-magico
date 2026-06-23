// App orchestrator: state, actions, targeted re-renders, keyboard, URL sync.
// No framework. Each region re-renders independently so typing in search never
// rebuilds the input (focus + caret survive).
import { mount } from "./lib/dom.js";
import * as L from "./lib/logic.js";
import { sidebar } from "./components/sidebar.js";
import { header } from "./components/header.js";
import { home } from "./components/home.js";
import { listView } from "./components/list.js";
import { rail } from "./components/rail.js";

const { D } = L;

const state = {
  route: "home",
  search: "",
  selected: null,   // { kind, id }
  history: [],      // prior selections, for breadcrumb / back
  toast: "",
  copied: "",       // "cmd" | "json"
};

// region nodes (created once)
const regions = {};
let searchInput = null;
let toastTimer = null, copyTimer = null;

// ── targeted renders ──────────────────────────────────────────────────────────
const renderSidebar = () => mount(regions.sidebar, sidebar(state, actions));
const renderHeader = () => mount(regions.header, header(state, actions));
const renderContent = () => mount(regions.content, state.route === "home" ? home(state, actions) : listView(state, actions));
const renderRail = () => mount(regions.rail, rail(state, actions));
const renderToast = () => mount(regions.toast, state.toast
  ? Object.assign(document.createElement("div"), { className: "mm-toast", textContent: state.toast, role: "status" })
  : null);

// ── url sync ──────────────────────────────────────────────────────────────────
function syncUrl() {
  try {
    const u = new URL(location.href);
    u.searchParams.set("view", state.route);
    if (state.selected) u.searchParams.set("selected", state.selected.kind + ":" + state.selected.id);
    else u.searchParams.delete("selected");
    history.replaceState(null, "", u);
    localStorage.setItem("mm.route", state.route);
  } catch (e) { /* file:// or private mode */ }
}

// ── actions ───────────────────────────────────────────────────────────────────
const actions = {
  go(route) {
    state.route = route; state.search = ""; state.selected = null; state.history = [];
    renderSidebar(); renderHeader(); renderContent(); renderRail(); syncUrl();
  },
  setSearch(q) {
    state.search = q;
    renderContent(); // header (with the input) is untouched → focus kept
  },
  select(kind, id) {
    if (!kind || !id) return;
    if (state.selected) state.history = [...state.history, state.selected];
    state.selected = { kind, id }; state.copied = "";
    renderRail(); renderContent(); syncUrl();
  },
  jumpTo(index) {
    const chain = [...state.history, state.selected];
    state.selected = chain[index]; state.history = chain.slice(0, index); state.copied = "";
    renderRail(); renderContent(); syncUrl();
  },
  back() {
    if (!state.history.length) return;
    const h = [...state.history]; state.selected = h.pop(); state.history = h; state.copied = "";
    renderRail(); renderContent(); syncUrl();
  },
  close() {
    state.selected = null; state.history = []; state.copied = "";
    renderRail(); renderContent(); syncUrl();
  },
  flash(msg) {
    state.toast = msg; renderToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = ""; renderToast(); }, 1400);
  },
  copy(text, which, label) {
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {}
    state.copied = which; renderRail(); actions.flash(label);
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { state.copied = ""; renderRail(); }, 1400);
  },
  registerSearch(node) { searchInput = node; },
};

// ── keyboard ──────────────────────────────────────────────────────────────────
function onKey(e) {
  const typing = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "");
  if (e.key === "Escape") {
    if (state.selected) { e.preventDefault(); actions.close(); }
    else if (state.search) { actions.go(state.route); }
    return;
  }
  if (!typing && (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"))) {
    if (state.route !== "home" && searchInput) { e.preventDefault(); searchInput.focus(); }
    else if ((e.metaKey || e.ctrlKey)) e.preventDefault();
    return;
  }
  if (!typing && state.selected && e.key.toLowerCase() === "b") { e.preventDefault(); actions.back(); return; }
  if (!typing && e.key === "r") { actions.flash("snapshot refreshed"); }
}

// ── boot ──────────────────────────────────────────────────────────────────────
function boot() {
  const root = document.getElementById("app");
  root.className = "mm-app mm-scroll";
  root.replaceChildren();

  regions.sidebar = document.createElement("div"); regions.sidebar.style.display = "contents";
  const main = document.createElement("main"); main.className = "mm-main";
  regions.header = document.createElement("div");
  regions.content = document.createElement("div"); regions.content.className = "mm-content mm-scroll";
  main.append(regions.header, regions.content);
  regions.rail = document.createElement("div");
  regions.toast = document.createElement("div");
  root.append(regions.sidebar, main, regions.rail, regions.toast);

  // restore route + selection from URL / storage
  try {
    const params = new URLSearchParams(location.search);
    const v = params.get("view") || localStorage.getItem("mm.route") || "home";
    if (D.ROUTES.some((r) => r.id === v)) state.route = v;
    const selRaw = params.get("selected");
    if (selRaw && selRaw.includes(":")) {
      const [kind, id] = selRaw.split(":");
      if (L.getRecord(kind, id)) state.selected = { kind, id };
    }
  } catch (e) {}

  renderSidebar(); renderHeader(); renderContent(); renderRail(); renderToast();
  document.addEventListener("keydown", onKey);
}

boot();
