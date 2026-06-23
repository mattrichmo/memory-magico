# Memory Magico Dashboard v2

A polished, dependency-free rebuild of the Claude Design prototype
(`scratch/MemoryMagico Client Dashboard/`). Same design language, lifted out of a
single 766-line `.dc.html` file (proprietary `x-dc` runtime) into plain
HTML/CSS/JS components — no framework, no build step.

## Run

```sh
cd dashboard-v2
python3 -m http.server 8777
# open http://localhost:8777
```

ES modules + `import()` require an HTTP origin — opening `index.html` from
`file://` will fail (null-origin CORS).

## Layout

```
index.html            shell + fonts + boot state
styles.css            design tokens (CSS vars) + every component class
data.js               fixture snapshot (verbatim from the prototype)
main.js               state, actions, targeted re-renders, keyboard, URL sync
lib/
  dom.js              el() / mount() / frag() — the only DOM helpers
  logic.js            pure view logic: colors, trust dots, meta, attention,
                      relationships, drill-down derivation
components/
  sidebar.js          nav + git signal
  header.js           page title + search input
  home.js             metrics, active sprint, activity feed, attention queue
  list.js             route list rows
  rail.js             inspector + sprint→phase→task drill-down checklist
  primitives.js       trustDots / statusPill / severityBadge / bar
```

## Design decisions

- **No full re-render on keystroke.** The search input lives in the `header`
  region, which is only rebuilt on route change. Typing re-renders only the
  content region, so focus + caret survive (this is literally `issue_rail_focus`
  in the fixture — easy to reintroduce with a naive store).
- **Drill-down derives from child→parent fields** (`phase.sprintId`,
  `task.phaseId`) per `DESIGN_NOTES.md`, not the convenience arrays. Empty/drift
  states are shown honestly (e.g. `sprint_graph` claims 2 phases but has none).
- **The new exploration element:** clicking a sprint opens the rail with an
  expandable **Phases** checklist (progress + status). Click a phase → the rail
  drills into its **Tasks** checklist; click a task → task detail. A breadcrumb
  grows as you descend; click any crumb (or `b` / `esc`) to walk back up.

## Keyboard

`/` or `Cmd/Ctrl-K` focus search · `Esc` close rail / clear search ·
`b` back up the drill chain · `r` refresh toast.

## Pointing at the real API

`data.js` is a static fixture. To go live, replace its exports with fetches
against `mm dashboard serve` (`/api/dashboard`, `/api/entity/:kind/:id`, …) per
`dashboard/client-dashboard-product-contract.md`. Nothing in `lib/` or
`components/` imports the fixture directly except through `logic.js`, so that is
the single seam to swap.
