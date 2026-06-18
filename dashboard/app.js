(() => {
  'use strict';

  const VERSION = '0.5.0-quarter-style-static';
  const POLL_MS = 60_000;
  const MAX_PREVIEW = 18_000;
  const params = new URLSearchParams(window.location.search);
  const API_BASE = (params.get('api') || '').replace(/\/$/, '');
  const USE_FIXTURE = params.get('fixture') === '1' || localStorage.getItem('mm.dashboard.fixture') === 'true';

  const COLORS = {
    sky: 'sky', violet: 'violet', emerald: 'emerald', amber: 'amber', rose: 'rose', zinc: 'zinc'
  };

  const KIND_META = {
    home: { label: 'Home', icon: 'home', color: 'zinc' },
    sprint: { label: 'Sprints', icon: 'layers', color: 'sky' },
    phase: { label: 'Phases', icon: 'listChecks', color: 'violet' },
    task: { label: 'Tasks', icon: 'circleDot', color: 'emerald' },
    issue: { label: 'Issues', icon: 'alertTriangle', color: 'amber' },
    bug: { label: 'Bugs', icon: 'bug', color: 'rose' },
    discovery: { label: 'Discoveries', icon: 'lightbulb', color: 'amber' },
    wiki: { label: 'Wiki', icon: 'bookOpen', color: 'sky' },
    raw: { label: 'Raw', icon: 'inbox', color: 'zinc' }
  };

  const ROUTES = ['home', 'sprint', 'phase', 'task', 'issue', 'bug', 'discovery', 'wiki', 'raw'];

  const STATUS_COLOR = {
    planned: 'sky', active: 'sky', paused: 'amber', completed: 'emerald', cancelled: 'zinc',
    todo: 'zinc', in_progress: 'sky', blocked: 'rose', done: 'emerald',
    draft: 'zinc', ready_for_agent: 'sky', needs_review: 'amber', needs_verification: 'amber', verified: 'emerald', closed: 'emerald', deferred: 'zinc',
    P0: 'rose', P1: 'rose', P2: 'amber', P3: 'zinc', P4: 'zinc',
    unreconciled: 'amber', processing: 'sky', processed: 'emerald', rejected: 'rose', duplicate: 'zinc', archived: 'zinc',
    needs_research: 'amber', promoted_to_issue: 'emerald', folded_into_issue: 'emerald', resolved_by_existing_code: 'emerald',
    fresh: 'emerald', stale: 'amber', missing: 'rose', unknown: 'zinc'
  };

  const state = {
    source: 'loading',
    loadError: '',
    snapshot: null,
    data: emptyData(),
    index: new Map(),
    active: params.get('view') || localStorage.getItem('mm.dashboard.active') || 'home',
    selectedKey: params.get('selected') || '',
    history: [],
    search: '',
    copied: '',
    toast: '',
    focusSearch: false,
    gitStatus: null,
    endpointLog: [],
    poll: null
  };

  const fixture = makeFixture();

  function emptyData() {
    return { sprint: [], phase: [], task: [], issue: [], bug: [], discovery: [], wiki: [], raw: [] };
  }

  function $(id) { return document.getElementById(id); }
  function endpoint(path) { return `${API_BASE}${path}`; }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function attr(value) { return esc(value); }
  function arr(value) { return Array.isArray(value) ? value : value ? [value] : []; }
  function n(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
  function label(value) { return String(value ?? '').replace(/_/g, ' '); }
  function compact(text, limit = 160) {
    const s = String(text || '').trim();
    return s.length > limit ? `${s.slice(0, limit - 1)}…` : s;
  }
  function titleOf(obj) { return obj?.title || obj?.name || obj?.summary || obj?.id || 'Untitled'; }
  function idOf(obj) { return obj?.id || obj?.path || titleOf(obj); }
  function keyOf(obj) { return `${obj.kind}:${idOf(obj)}`; }
  function nowIso() { return new Date().toISOString(); }
  function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
  }

  const icons = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V21h5v-6h4v6h5V10.5"/>',
    layers: '<path d="m12 3 9 4.8-9 4.8-9-4.8L12 3Z"/><path d="m3 12 9 4.8 9-4.8"/><path d="m3 16.5 9 4.5 9-4.5"/>',
    listChecks: '<path d="m3 7 2 2 4-4"/><path d="M11 7h10"/><path d="m3 15 2 2 4-4"/><path d="M11 15h10"/>',
    circleDot: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1"/>',
    alertTriangle: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5"/><path d="M12 18h.01"/>',
    bug: '<path d="M8 6h8"/><path d="M9 6V4"/><path d="M15 6V4"/><rect x="7" y="8" width="10" height="12" rx="5"/><path d="M3 13h4"/><path d="M17 13h4"/><path d="M4 19l4-2"/><path d="m20 19-4-2"/>',
    lightbulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M8 14a6 6 0 1 1 8 0c-.8.7-1 1.4-1 2H9c0-.6-.2-1.3-1-2Z"/>',
    bookOpen: '<path d="M2 5h7a4 4 0 0 1 4 4v12a4 4 0 0 0-4-4H2V5Z"/><path d="M22 5h-7a4 4 0 0 0-4 4v12a4 4 0 0 1 4-4h7V5Z"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5 5h14l3 7v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7l3-7Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    gitBranch: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v5a5 5 0 0 0 5 5h5"/><path d="M6 8v10"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    terminal: '<path d="m4 17 6-5-6-5"/><path d="M12 19h8"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>'
  };

  function icon(name, cls = '') {
    return `<svg class="icon ${attr(cls)}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.circleDot}</svg>`;
  }

  async function readJson(path) {
    const started = performance.now();
    try {
      const res = await fetch(endpoint(path), { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const ms = Math.round(performance.now() - started);
      if (!res.ok) {
        logEndpoint(path, false, ms, `${res.status} ${res.statusText}`);
        return { ok: false, status: res.status, error: `${res.status} ${res.statusText}` };
      }
      const data = await res.json();
      logEndpoint(path, true, ms, 'ok');
      return { ok: true, status: res.status, data };
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      const error = err instanceof Error ? err.message : String(err);
      logEndpoint(path, false, ms, error);
      return { ok: false, status: 0, error };
    }
  }

  function logEndpoint(path, ok, ms, note) {
    state.endpointLog.unshift({ path, ok, ms, note, at: nowIso() });
    state.endpointLog = state.endpointLog.slice(0, 20);
  }

  async function loadDashboard({ silent = false } = {}) {
    if (!silent) {
      state.source = 'loading';
      renderBoot();
    }
    const result = await readJson('/api/dashboard');
    if (result.ok && result.data) {
      state.snapshot = result.data;
      state.source = 'api';
      state.loadError = '';
      rebuildData();
      render();
      loadOptionalEndpoints();
    } else if (USE_FIXTURE) {
      state.snapshot = JSON.parse(JSON.stringify(fixture.snapshot));
      state.source = 'fixture';
      state.loadError = result.error || '';
      rebuildData(fixture.optionals);
      render();
    } else {
      state.snapshot = null;
      state.source = 'unavailable';
      state.loadError = result.error || 'Unable to load /api/dashboard';
      render();
    }
  }

  async function loadOptionalEndpoints() {
    const [issues, raw, discoveries, wiki, git] = await Promise.all([
      readJson('/api/issues'),
      readJson('/api/raw'),
      readJson('/api/discoveries'),
      readJson('/api/wiki'),
      readJson('/api/git/status')
    ]);
    const optionals = {};
    if (issues.ok) optionals.issues = normalizeListResponse(issues.data, ['issues']);
    if (raw.ok) optionals.raw = normalizeListResponse(raw.data, ['raw', 'items']);
    if (discoveries.ok) optionals.discoveries = normalizeListResponse(discoveries.data, ['discoveries', 'items']);
    if (wiki.ok) optionals.wiki = normalizeListResponse(wiki.data, ['wiki', 'pages', 'items']);
    if (git.ok) state.gitStatus = git.data;
    rebuildData(optionals);
    render();
  }

  function normalizeListResponse(value, keys = []) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    for (const key of [...keys, 'items', 'results', 'data']) {
      if (Array.isArray(value[key])) return value[key];
    }
    return [];
  }

  function rebuildData(optionals = {}) {
    const snapshot = state.snapshot || {};
    const focus = snapshot.focus || {};
    const summary = snapshot.summary || {};
    const data = emptyData();

    const sprintMap = new Map();
    for (const source of [focus.sprints, focus.featuredSprints, focus.recentSprints]) {
      for (const sprint of arr(source)) sprintMap.set(idOf(sprint), normalizeObject(sprint, 'sprint'));
    }
    data.sprint = [...sprintMap.values()];

    const phaseMap = new Map();
    const taskMap = new Map();
    for (const sprint of data.sprint) {
      for (const phase of arr(sprint.phases)) {
        const normPhase = normalizeObject({ ...phase, sprintId: sprint.id || phase.sprintId, sprintTitle: sprint.title || phase.sprintTitle }, 'phase');
        phaseMap.set(idOf(normPhase), normPhase);
        for (const task of arr(phase.tasks)) {
          const normTask = normalizeObject({ ...task, sprintId: sprint.id || task.sprintId, sprintTitle: sprint.title || task.sprintTitle, phaseId: normPhase.id || task.phaseId, phaseTitle: normPhase.title || task.phaseTitle }, 'task');
          taskMap.set(idOf(normTask), normTask);
        }
      }
    }
    for (const task of arr(focus.tasks)) taskMap.set(idOf(task), normalizeObject(task, 'task'));
    data.phase = [...phaseMap.values()];
    data.task = [...taskMap.values()];

    const issues = optionals.issues || arr(focus.issues);
    data.issue = issues.map(x => normalizeObject(x, 'issue'));
    data.bug = data.issue.filter(isBugIssue).map(x => normalizeObject({ ...x, kind: 'bug' }, 'bug'));

    const discoveries = optionals.discoveries || arr(summary.discoveries?.recent || focus.discoveries);
    data.discovery = discoveries.map(x => normalizeObject(x, 'discovery'));

    const raw = optionals.raw || arr(summary.raw?.recent || focus.raw);
    data.raw = raw.map(x => normalizeObject(x, 'raw'));

    const wiki = optionals.wiki || arr(focus.wiki || focus.pages);
    data.wiki = wiki.map(x => normalizeObject(x, 'wiki'));

    state.data = data;
    rebuildIndex();
    restoreSelection();
  }

  function normalizeObject(input, kind) {
    const obj = { ...(input || {}) };
    obj.kind = kind;
    obj.id ||= obj.objectId || obj.slug || obj.path || obj.title || `${kind}_${Math.random().toString(36).slice(2)}`;
    if (kind === 'bug') obj.kind = 'bug';
    if (kind === 'raw' && obj.kind !== 'raw') obj.kind = 'raw';
    if (kind === 'wiki' && obj.kind !== 'wiki') obj.kind = 'wiki';
    obj.title ||= titleOf(obj);
    obj.status ||= obj.lifecycle || obj.ingestionStatus || obj.fixStatus || obj.freshness || '';
    if (kind === 'task' && obj.status === 'active') obj.status = 'in_progress';
    if (kind === 'raw' && !obj.status) obj.status = obj.processed ? 'processed' : 'unreconciled';
    return obj;
  }

  function rebuildIndex() {
    const index = new Map();
    for (const kind of Object.keys(state.data)) {
      for (const obj of state.data[kind]) index.set(keyOf(obj), obj);
    }
    state.index = index;
  }

  function restoreSelection() {
    if (!state.selectedKey) return;
    if (!state.index.has(state.selectedKey)) {
      const id = state.selectedKey.split(':').pop();
      const found = findById(id);
      state.selectedKey = found ? keyOf(found) : '';
    }
  }

  function isBugIssue(issue) {
    return String(issue.issueType || issue.kind || '').toLowerCase() === 'bug' || String(issue.type || '').toLowerCase() === 'bug';
  }

  function renderBoot() {
    const root = $('app');
    root.className = 'boot-shell';
    root.innerHTML = `<div class="boot-card"><div class="boot-title">MEMORY MAGICO</div><div class="boot-subtitle">memory cockpit</div><div class="boot-line"></div><div class="boot-status">loading dashboard snapshot...</div></div>`;
  }

  function render() {
    const root = $('app');
    if (!root) return;
    root.className = '';
    if (!state.snapshot) {
      root.innerHTML = renderUnavailable();
      bindPostRender();
      return;
    }
    const selected = selectedObject();
    root.innerHTML = `
      <div class="app">
        ${renderSidebar()}
        <main class="main">
          ${state.active === 'home' ? '' : renderSearchRow()}
          <div class="content">${state.active === 'home' ? renderHome() : renderListView(state.active)}</div>
        </main>
        ${selected ? renderRightRail(selected) : ''}
      </div>
      ${state.toast ? `<div class="toast">${esc(state.toast)}</div>` : ''}
    `;
    bindPostRender();
  }

  function renderUnavailable() {
    return `<div class="app"><main class="main"><div class="error-panel">
      <h1>Dashboard API unavailable</h1>
      <p>This static dashboard expects <code>GET /api/dashboard</code> from the local Memory Magico server.</p>
      <p class="field-value mono">${esc(state.loadError || '')}</p>
      <div class="error-actions">
        <button data-action="refresh">retry</button>
        <button data-action="fixture">load fixture</button>
        <button data-copy="mm dashboard serve --host 127.0.0.1 --port 4317">copy serve command</button>
      </div>
    </div></main></div>`;
  }

  function renderSidebar() {
    const branch = gitBranch();
    return `<nav class="sidebar" aria-label="Primary navigation">
      <div class="brand"><div class="brand-title">MEMORY MAGICO</div><div class="brand-subtitle">memory cockpit</div></div>
      <div class="nav-scroll">
        ${navButton('home')}
        <div class="nav-separator"></div>
        ${['sprint','phase','task','issue','bug','discovery','wiki','raw'].map(navButton).join('')}
      </div>
      <div class="sidebar-footer">branch: ${esc(branch)}<br/>mode: read-only<br/>v${esc(VERSION)}</div>
    </nav>`;
  }

  function navButton(route) {
    const meta = KIND_META[route];
    const count = route === 'home' ? '' : state.data[route]?.length || summaryCount(route);
    const active = state.active === route ? 'is-active' : '';
    return `<button class="nav-button ${active}" data-route="${attr(route)}">
      <span class="nav-label-wrap">${icon(meta.icon, state.active === route ? meta.color : '')}<span class="nav-label">${esc(meta.label)}</span></span>
      <span class="nav-count">${count ? esc(count) : ''}</span>
    </button>`;
  }

  function summaryCount(route) {
    const s = state.snapshot?.summary || {};
    if (route === 'sprint') return s.sprints?.total || 0;
    if (route === 'phase') return s.phases?.total || 0;
    if (route === 'task') return s.tasks?.total || 0;
    if (route === 'issue') return s.issues?.total || 0;
    if (route === 'bug') return s.issues?.byType?.bug || s.issues?.bugs || 0;
    if (route === 'discovery') return s.discoveries?.total || 0;
    if (route === 'wiki') return s.wiki?.pages || 0;
    if (route === 'raw') return s.raw?.total || 0;
    return 0;
  }

  function renderSearchRow() {
    const meta = KIND_META[state.active] || KIND_META.task;
    return `<div class="search-row">
      ${icon('search')}
      <input id="searchInput" class="search-input" value="${attr(state.search)}" placeholder="search ${esc(meta.label.toLowerCase())}..." autocomplete="off" />
    </div>`;
  }

  function renderListView(kind) {
    const meta = KIND_META[kind] || KIND_META.task;
    const objects = filterObjects(state.data[kind] || [], state.search);
    return `<section class="object-list">
      <div class="list-head">
        <div class="list-title">${icon(meta.icon, meta.color)}<h1>${esc(meta.label)}</h1><span class="count">${objects.length}</span></div>
        <span class="readonly-pill">read-only</span>
      </div>
      ${objects.length ? objects.map(renderObjectCard).join('') : `<div class="empty">no ${esc(meta.label.toLowerCase())} match${state.search ? ` "${esc(state.search)}"` : ''}</div>`}
    </section>`;
  }

  function filterObjects(objects, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return objects;
    return objects.filter(obj => [obj.id, obj.title, obj.path, obj.status, metaLine(obj), JSON.stringify(obj.tags || [])].join(' ').toLowerCase().includes(q));
  }

  function renderObjectCard(obj) {
    const meta = KIND_META[obj.kind] || KIND_META.task;
    const selected = keyOf(obj) === state.selectedKey ? 'is-selected' : '';
    return `<button class="object-card ${selected}" data-select="${attr(keyOf(obj))}">
      <div class="object-row">
        <div class="object-title-wrap">${icon(meta.icon, meta.color)}<span class="object-title">${esc(titleOf(obj))}</span></div>
        <div class="object-actions">${renderTrustStrip(obj)}${obj.status ? renderStatusPill(obj.status) : ''}</div>
      </div>
      <span class="meta-line">${esc(metaLine(obj))}</span>
    </button>`;
  }

  function renderHome() {
    const all = allObjects();
    const dirty = gitDirtyCount(all);
    const stale = indexStaleCount(all);
    const rawOpen = state.snapshot?.summary?.raw?.unresolved ?? state.data.raw.filter(x => ['unreconciled','processing'].includes(x.status)).length;
    const blockers = state.data.task.filter(x => x.status === 'blocked').length + state.data.bug.filter(x => severityColor(x) === 'rose').length;
    const cards = [
      { label: 'git', value: dirty, unit: 'dirty objects', color: dirty ? 'rose' : 'emerald' },
      { label: 'index', value: stale, unit: 'stale', color: stale ? 'amber' : 'emerald' },
      { label: 'raw inbox', value: rawOpen, unit: 'unprocessed', color: rawOpen ? 'amber' : 'emerald' },
      { label: 'blockers', value: blockers, unit: 'needs attention', color: blockers ? 'rose' : 'emerald' }
    ];
    const activeSprint = state.data.sprint.find(x => x.status === 'active') || state.data.sprint[0];
    const attention = attentionQueue();
    return `<div class="home">
      <h1>Command Center</h1>
      <div class="home-subtitle">What's actually true right now, not just what's stored.</div>
      <div class="metrics">${cards.map(c => `<div class="metric-card"><div class="metric-label"><span class="dot ${attr(c.color)}"></span>${esc(c.label)}</div><div class="metric-value">${esc(c.value)}</div><div class="metric-unit">${esc(c.unit)}</div></div>`).join('')}</div>
      ${activeSprint ? renderActiveSprint(activeSprint) : ''}
      <div class="section-label">Attention queue (${attention.length})</div>
      <div class="attention-list">${attention.length ? attention.map(renderAttentionRow).join('') : '<div class="empty">nothing needs attention</div>'}</div>
    </div>`;
  }

  function renderActiveSprint(sprint) {
    const p = sprint.progress || sprint.completion || {};
    const done = p.doneCount ?? p.done ?? 0;
    const total = p.taskCount ?? p.total ?? arr(sprint.taskIds).length ?? 0;
    const blocked = p.blockedCount ?? p.blocked ?? 0;
    const verified = p.verified ?? p.verifiedCount ?? arr(sprint.verificationEvidence).length ?? 0;
    return `<button class="active-sprint" data-select="${attr(keyOf(sprint))}">
      <div class="sprint-overline"><span>active sprint</span>${renderTrustStrip(sprint)}</div>
      <div class="sprint-name">${esc(titleOf(sprint))}</div>
      <div class="sprint-goal">${esc(compact(sprint.goal || sprint.description || metaLine(sprint), 220))}</div>
      <div class="sprint-stats">${esc(done)}/${esc(total)} done · ${esc(blocked)} blocked · ${esc(verified)} verified</div>
    </button>`;
  }

  function attentionQueue() {
    const rows = [];
    for (const t of state.data.task) {
      if (t.status === 'blocked') rows.push({ obj: t, reason: 'blocked' });
      else if (t.status === 'done' && !arr(t.verificationEvidence).length) rows.push({ obj: t, reason: 'done, unverified' });
    }
    for (const i of state.data.issue) {
      if (['P0','P1'].includes(String(i.severity || '').toUpperCase())) rows.push({ obj: i, reason: `${i.severity} issue` });
      else if (['needs_verification','blocked'].includes(i.status)) rows.push({ obj: i, reason: label(i.status) });
    }
    for (const b of state.data.bug) rows.push({ obj: b, reason: b.severity || 'bug' });
    for (const r of state.data.raw) if (['unreconciled','processing'].includes(r.status)) rows.push({ obj: r, reason: 'raw inbox' });
    for (const d of state.data.discovery) if (!String(d.status || '').includes('promoted')) rows.push({ obj: d, reason: d.status || 'pending' });
    for (const o of allObjects()) if (o.index?.stale) rows.push({ obj: o, reason: 'index stale' });
    return dedupeRows(rows).slice(0, 12);
  }

  function dedupeRows(rows) {
    const seen = new Set();
    return rows.filter(row => {
      const key = keyOf(row.obj) + row.reason;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderAttentionRow(row) {
    const obj = row.obj;
    const meta = KIND_META[obj.kind] || KIND_META.task;
    return `<button class="attention-row" data-select="${attr(keyOf(obj))}">
      <span class="attention-left">${icon(meta.icon, meta.color)}<span class="attention-title">${esc(titleOf(obj))}</span></span>
      <span class="attention-reason">${esc(row.reason)}</span>
    </button>`;
  }

  function selectedObject() { return state.selectedKey ? state.index.get(state.selectedKey) : null; }

  function renderRightRail(obj) {
    const meta = KIND_META[obj.kind] || KIND_META.task;
    return `<aside class="right-rail" aria-label="Inspector">
      <div class="rail-top">
        <button class="rail-button" data-action="back" ${state.history.length ? '' : 'disabled'}>${icon('chevronLeft')} back</button>
        <button class="rail-close" data-action="close">${icon('x')}</button>
      </div>
      <div class="rail-head">
        <div class="rail-head-row"><span class="kind-badge color-${attr(meta.color)}">${icon(meta.icon, meta.color)} ${esc(obj.kind)}</span>${renderTrustStrip(obj, 'lg')}</div>
        <h2 class="rail-title">${esc(titleOf(obj))}</h2>
        <div class="rail-status-row">${obj.status ? renderStatusPill(obj.status) : ''}${obj.priority ? `<span class="field-value mono">priority ${esc(obj.priority)}</span>` : ''}${obj.severity ? `<span class="field-value mono">severity ${esc(obj.severity)}</span>` : ''}</div>
        ${arr(obj.tags).length ? `<div class="tag-row">${arr(obj.tags).map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="rail-body">
        ${obj.kind === 'raw' ? `<div class="raw-warning">${icon('shield')} untrusted raw input — not yet promoted</div>` : ''}
        ${renderKindDetail(obj)}
        ${obj.path ? renderField('path', `<div class="field-value mono">${esc(obj.path)}</div>`) : ''}
        ${renderField('git', renderGitBlock(obj))}
        ${obj.index !== undefined || obj.indexed !== undefined ? renderField('index', renderIndexBlock(obj.index || obj)) : ''}
      </div>
      <div class="rail-actions">
        <button class="action-button" data-copy-json="${attr(keyOf(obj))}">${icon(state.copied === `json:${keyOf(obj)}` ? 'check' : 'copy')} ${state.copied === `json:${keyOf(obj)}` ? 'copied raw json' : 'copy raw json'}</button>
        <button class="action-button secondary" data-copy="${attr(cliCommand(obj))}">${icon(state.copied === `cmd:${keyOf(obj)}` ? 'check' : 'terminal')} ${state.copied === `cmd:${keyOf(obj)}` ? 'copied command' : esc(cliCommand(obj))}</button>
      </div>
    </aside>`;
  }

  function renderKindDetail(obj) {
    if (obj.kind === 'sprint') {
      return [
        renderField('goal', textBlock(obj.goal || obj.description)),
        renderField('window', `<div class="field-value mono">${esc(obj.startDate || '—')} → ${esc(obj.endDate || '—')}</div>`),
        renderField('completion', `<div class="field-value mono">${completionText(obj)}</div>`),
        chipRow('phases', obj.phaseIds || state.data.phase.filter(x => x.sprintId === obj.id).map(x => x.id)),
        chipRow('tasks', obj.taskIds || state.data.task.filter(x => x.sprintId === obj.id).map(x => x.id)),
        chipRow('issues', obj.issueIds),
        chipRow('discoveries', obj.discoveryIds)
      ].join('');
    }
    if (obj.kind === 'phase') {
      return [renderField('goal', textBlock(obj.goal || obj.description)), chipRow('sprint', obj.sprintId ? [obj.sprintId] : []), chipRow('tasks', obj.taskIds || state.data.task.filter(x => x.phaseId === obj.id).map(x => x.id)), chipRow('depends on', obj.dependsOn || obj.dependencies)].join('');
    }
    if (obj.kind === 'task') {
      return [
        renderField('summary', textBlock(obj.summary || obj.description || metaLine(obj))),
        listField('acceptance criteria', obj.acceptanceCriteria),
        chipRow('sprint', obj.sprintId ? [obj.sprintId] : []),
        chipRow('phase', obj.phaseId ? [obj.phaseId] : []),
        chipRow('blocked by', obj.blockedBy),
        chipRow('related', obj.related || obj.issueIds),
        listField('evidence', obj.verificationEvidence, x => typeof x === 'object' ? `${x.result || ''} ${x.type || ''}: ${x.summary || x.id || ''}` : x),
        listField('files touched', obj.filesTouched || obj.filesAffected || obj.affectedFiles)
      ].join('');
    }
    if (obj.kind === 'issue' || obj.kind === 'bug') {
      return [
        renderField('impact', textBlock(obj.impact || obj.summary || obj.description)),
        obj.proposedFix ? renderField('proposed fix', textBlock(obj.proposedFix)) : '',
        obj.verificationPlan ? renderField('verification plan', textBlock(obj.verificationPlan)) : '',
        listField('reproduction', obj.reproductionSteps),
        chipRow('related task', obj.relatedTask ? [obj.relatedTask] : obj.relatedTaskIds || obj.taskIds),
        chipRow('source discoveries', obj.sourceDiscoveryIds),
        chipRow('source raw', obj.sourceRawItemIds || obj.sourceRefs),
        listField('files affected', obj.filesAffected || obj.affectedFiles)
      ].join('');
    }
    if (obj.kind === 'discovery') {
      return [renderField('summary', textBlock(obj.summary || obj.recommendedAction)), renderField('confidence', `<div class="field-value mono">${esc(obj.confidence || '—')}</div>`), chipRow('source', obj.sourceRawItemIds || obj.sourceRefs), chipRow('related tasks', obj.relatedTasks || obj.taskIds), chipRow('promoted to', arr(obj.promotedTo).concat(arr(obj.promotedIssueId), arr(obj.foldedIntoIssueId)).filter(Boolean)), listField('files affected', obj.filesAffected || obj.affectedFiles)].join('');
    }
    if (obj.kind === 'wiki') {
      return [renderField('body', renderWikiBody(obj.body || obj.content || obj.summary || '')), chipRow('backlinks', obj.backlinks), chipRow('related tasks', obj.relatedTasks || obj.taskIds), chipRow('source refs', obj.sourceRefs), listField('semantic terms', obj.semanticTerms)].join('');
    }
    if (obj.kind === 'raw') {
      return [renderField('preview', textBlock(obj.preview || obj.summary || obj.content || '')), renderField('source type', `<div class="field-value mono">${esc(obj.sourceType || '—')}</div>`), chipRow('promoted to', obj.promotedTo || obj.reconciledTo), listField('tags', obj.tags)].join('');
    }
    return renderField('summary', textBlock(metaLine(obj)));
  }

  function renderField(labelText, html) {
    if (!html) return '';
    return `<div class="field"><div class="field-label">${esc(labelText)}</div>${html}</div>`;
  }
  function textBlock(text) { return `<p class="field-value">${esc(text || '—')}</p>`; }
  function listField(labelText, values, mapper = x => x) {
    const list = arr(values).filter(Boolean);
    if (!list.length) return renderField(`${labelText} (0)`, '<span class="field-value mono">none</span>');
    return renderField(`${labelText} (${list.length})`, `<div class="field-value"><ul>${list.map(x => `<li>${esc(mapper(x))}</li>`).join('')}</ul></div>`);
  }
  function chipRow(labelText, ids) {
    const list = arr(ids).filter(Boolean);
    if (!list.length) return renderField(`${labelText} (0)`, '<span class="field-value mono">none</span>');
    return renderField(`${labelText} (${list.length})`, `<div class="chip-row">${list.map(renderChip).join('')}</div>`);
  }
  function renderChip(id) {
    const obj = findById(id);
    if (!obj) return `<span class="missing-chip">${icon('x')} ${esc(id)} missing</span>`;
    const meta = KIND_META[obj.kind] || KIND_META.task;
    return `<button class="chip" data-select="${attr(keyOf(obj))}">${icon(meta.icon, meta.color)}<span class="chip-title">${esc(titleOf(obj))}</span></button>`;
  }
  function renderWikiBody(text) {
    const source = String(text || '').trim();
    if (!source) return '<span class="field-value mono">empty</span>';
    const lines = source.split(/\r?\n/).slice(0, 80);
    const html = lines.map(line => {
      const t = line.trim();
      if (!t) return '';
      if (t.startsWith('## ')) return `<h3 class="field-value">${esc(t.slice(3))}</h3>`;
      if (t.startsWith('# ')) return `<h2 class="field-value">${esc(t.slice(2))}</h2>`;
      if (t.startsWith('- ')) return `<div class="field-value">• ${esc(t.slice(2))}</div>`;
      return `<p class="field-value">${esc(t)}</p>`;
    }).join('');
    return `<div>${html}</div>`;
  }

  function renderTrustStrip(obj, size = 'sm') {
    const signals = [gitSignal(obj), indexSignal(obj), statusSignal(obj)];
    return `<span class="trust-strip ${size === 'lg' ? 'lg' : ''}">${signals.map(s => `<span class="dot ${attr(s.color)}" title="${attr(s.title)}"></span>`).join('')}</span>`;
  }
  function renderStatusPill(status) {
    const color = STATUS_COLOR[status] || STATUS_COLOR[String(status).toUpperCase()] || 'zinc';
    return `<span class="status-pill ${attr(color)}">${esc(label(status))}</span>`;
  }
  function gitSignal(obj) {
    const git = obj.git;
    if (git) return git.isDirty ? { color: 'rose', title: `git: dirty (${arr(git.changedFiles).length} files)` } : { color: 'emerald', title: 'git: clean' };
    if (obj.path && dirtyFiles().some(f => f === obj.path || f.endsWith(obj.path) || obj.path.endsWith(f))) return { color: 'rose', title: 'git: dirty' };
    return { color: 'zinc', title: 'git: unknown' };
  }
  function indexSignal(obj) {
    const idx = obj.index || obj;
    if (idx.indexed === false) return { color: 'zinc', title: 'index: not indexed' };
    if (idx.stale) return { color: 'amber', title: 'index: stale' };
    if (idx.indexed || idx.chunkCount || idx.lastIndexedAt) return { color: 'emerald', title: 'index: fresh' };
    return { color: 'zinc', title: 'index: unknown' };
  }
  function statusSignal(obj) {
    if (obj.kind === 'bug') return { color: severityColor(obj), title: obj.severity || obj.status || 'bug' };
    if (obj.kind === 'discovery') return { color: String(obj.confidence).toLowerCase() === 'high' || String(obj.status).includes('promoted') ? 'emerald' : 'amber', title: obj.confidence || obj.status || 'discovery' };
    if (obj.kind === 'wiki') return { color: obj.freshness === 'fresh' ? 'emerald' : obj.freshness === 'stale' ? 'rose' : 'zinc', title: obj.freshness || 'wiki' };
    const color = STATUS_COLOR[obj.status] || 'zinc';
    return { color, title: obj.status || 'unknown' };
  }
  function severityColor(obj) {
    const sev = String(obj.severity || obj.priority || '').toUpperCase();
    if (['P0','P1','CRITICAL','HIGH'].includes(sev)) return 'rose';
    if (['P2','MEDIUM'].includes(sev)) return 'amber';
    return STATUS_COLOR[obj.status] || 'zinc';
  }

  function renderGitBlock(obj) {
    const git = obj.git;
    if (!git) {
      const dirty = obj.path && dirtyFiles().some(f => f === obj.path || f.endsWith(obj.path) || obj.path.endsWith(f));
      return `<div class="git-block"><div class="git-line">${icon('gitBranch')}<span>${esc(gitBranch())}</span><span class="dot ${dirty ? 'rose' : 'zinc'}"></span><span>${dirty ? 'dirty' : 'unknown'}</span></div></div>`;
    }
    return `<div class="git-block">
      <div class="git-line">${icon('gitBranch')}<span>${esc(git.branch || gitBranch())}</span><span class="dot ${git.isDirty ? 'rose' : 'emerald'}"></span><span class="color-${git.isDirty ? 'rose' : 'emerald'}">${git.isDirty ? 'dirty' : 'clean'}</span></div>
      ${git.lastCommit ? `<div>${esc(git.lastCommit.hash || '')} · ${esc(git.lastCommit.subject || '')} · ${esc(git.lastCommit.date || '')}</div>` : ''}
      ${arr(git.changedFiles).length ? `<div class="file-list">${arr(git.changedFiles).map(f => `<div>${esc(f)}</div>`).join('')}</div>` : ''}
    </div>`;
  }
  function renderIndexBlock(index) {
    if (!index) return '<span class="field-value mono">not indexed</span>';
    const stale = !!index.stale;
    const chunks = index.chunkCount ?? index.chunks ?? 0;
    return `<div class="index-block"><div class="index-line">${icon('database')}<span class="dot ${stale ? 'amber' : 'emerald'}"></span><span class="color-${stale ? 'amber' : 'emerald'}">${stale ? 'stale' : 'fresh'}</span><span>· ${esc(chunks)} chunks</span></div>${index.lastIndexedAt ? `<div>last indexed ${esc(index.lastIndexedAt)}</div>` : ''}</div>`;
  }

  function completionText(obj) {
    const p = obj.progress || obj.completion || {};
    const done = p.doneCount ?? p.done ?? 0;
    const total = p.taskCount ?? p.total ?? arr(obj.taskIds).length ?? 0;
    const blocked = p.blockedCount ?? p.blocked ?? 0;
    const verified = p.verified ?? p.verifiedCount ?? 0;
    return `${done}/${total} done · ${blocked} blocked · ${verified} verified`;
  }

  function metaLine(obj) {
    if (!obj) return '';
    if (obj.kind === 'sprint' || obj.kind === 'phase') return obj.goal || obj.description || obj.summary || '';
    if (obj.kind === 'task') return obj.summary || obj.description || [obj.taskType, obj.priority ? `priority ${obj.priority}` : '', obj.sprintTitle].filter(Boolean).join(' · ');
    if (obj.kind === 'issue') return obj.impact || obj.summary || obj.description || obj.proposedFix || '';
    if (obj.kind === 'bug') return [obj.severity, obj.bugClass || obj.issueType, obj.summary].filter(Boolean).join(' · ');
    if (obj.kind === 'discovery') return obj.summary || obj.recommendedAction || '';
    if (obj.kind === 'wiki') return [obj.wikiKind, obj.freshness, arr(obj.tags).join(', ')].filter(Boolean).join(' · ');
    if (obj.kind === 'raw') return obj.preview || obj.summary || [obj.sourceType, obj.sourceRef].filter(Boolean).join(' · ');
    return obj.summary || obj.description || '';
  }

  function cliCommand(obj) {
    const id = idOf(obj);
    if (obj.kind === 'raw') return `mm raw show ${id}`;
    if (obj.kind === 'wiki') return `mm resolve ${id} --json`;
    if (obj.kind === 'bug') return `mm issue show ${id}`;
    return `mm ${obj.kind} show ${id}`;
  }

  function findById(id) {
    const needle = String(id || '');
    for (const kind of ['sprint','phase','task','bug','issue','discovery','wiki','raw']) {
      const found = state.data[kind].find(x => String(x.id) === needle || String(x.path) === needle || keyOf(x) === needle);
      if (found) return found;
    }
    return null;
  }
  function allObjects() { return Object.values(state.data).flat(); }
  function gitBranch() { return state.gitStatus?.branch || state.gitStatus?.currentBranch || 'main'; }
  function dirtyFiles() {
    const g = state.gitStatus || {};
    return arr(g.dirtyFiles || g.changedFiles || g.unstaged || g.files).map(x => typeof x === 'string' ? x : x.path || x.file || '').filter(Boolean);
  }
  function gitDirtyCount(all = allObjects()) {
    const files = dirtyFiles();
    if (files.length) return files.length;
    return all.filter(x => x.git?.isDirty).length;
  }
  function indexStaleCount(all = allObjects()) {
    const objectCount = all.filter(x => x.index?.stale || x.stale).length;
    const search = state.snapshot?.summary?.search;
    return objectCount + (search?.stale || search?.missing ? 1 : 0);
  }

  function selectKey(key, pushHistory = true) {
    if (!state.index.has(key)) return;
    if (pushHistory && state.selectedKey && state.selectedKey !== key) state.history.push(state.selectedKey);
    state.selectedKey = key;
    const obj = state.index.get(key);
    state.active = obj.kind;
    state.search = '';
    localStorage.setItem('mm.dashboard.active', state.active);
    updateUrl();
    render();
  }
  function goBack() {
    if (!state.history.length) return;
    const key = state.history.pop();
    selectKey(key, false);
  }
  function closeRail() {
    state.selectedKey = '';
    state.history = [];
    updateUrl();
    render();
  }
  function setRoute(route) {
    state.active = route;
    state.search = '';
    state.selectedKey = '';
    state.history = [];
    localStorage.setItem('mm.dashboard.active', route);
    updateUrl();
    render();
  }
  function updateUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('view', state.active);
    if (state.selectedKey) url.searchParams.set('selected', state.selectedKey);
    else url.searchParams.delete('selected');
    if (USE_FIXTURE) url.searchParams.set('fixture', '1');
    history.replaceState(null, '', url);
  }

  function copyText(text, note = 'copied') {
    const done = () => {
      state.toast = note;
      render();
      setTimeout(() => { state.toast = ''; render(); }, 1200);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  }

  function bindPostRender() {
    const search = $('searchInput');
    if (search) {
      search.addEventListener('input', e => { state.search = e.target.value; state.focusSearch = true; render(); });
      search.addEventListener('keydown', e => { if (e.key === 'Escape') { state.search = ''; state.focusSearch = true; render(); } });
      if (state.focusSearch) {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
        state.focusSearch = false;
      }
    }
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-route],[data-select],[data-action],[data-copy],[data-copy-json]');
    if (!target) return;
    if (target.dataset.route) { setRoute(target.dataset.route); return; }
    if (target.dataset.select) { selectKey(target.dataset.select); return; }
    if (target.dataset.copy) { copyText(target.dataset.copy, 'copied command'); return; }
    if (target.dataset.copyJson) {
      const obj = state.index.get(target.dataset.copyJson);
      if (obj) {
        state.copied = `json:${keyOf(obj)}`;
        copyText(JSON.stringify(obj, null, 2), 'copied raw json');
        setTimeout(() => { state.copied = ''; render(); }, 1000);
      }
      return;
    }
    const action = target.dataset.action;
    if (action === 'back') goBack();
    if (action === 'close') closeRail();
    if (action === 'refresh') loadDashboard();
    if (action === 'fixture') { localStorage.setItem('mm.dashboard.fixture', 'true'); window.location.search = '?fixture=1'; }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (state.selectedKey) closeRail();
      else if (state.search) { state.search = ''; render(); }
    }
    if ((event.key === '/' || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey))) && state.active !== 'home') {
      event.preventDefault();
      const input = $('searchInput'); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
    if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey && document.activeElement?.tagName !== 'INPUT') {
      loadDashboard({ silent: true });
    }
  });

  function makeFixture() {
    const now = nowIso();
    const issues = [
      { id: 'issue-1', kind: 'issue', title: "Right rail doesn't reflect live git state", status: 'in_progress', issueType: 'workflow', severity: 'P1', confidence: 'confirmed', impact: "Cards can show clean seconds after a tracked file changed on disk, so the cockpit lies about what's safe to ship.", proposedFix: 'Poll git status and update trust dots without a full reload.', relatedTask: 'task-2', sourceDiscoveryIds: ['discovery-1'], path: 'memory/issues/issue-1.md', git: { branch: 'main', isDirty: false, lastCommit: { hash: '7c1a902', subject: 'file issue: stale git state', date: '2026-06-14' }, changedFiles: [] } },
      { id: 'bug-1', kind: 'issue', title: 'Clicking a phase link does nothing', status: 'blocked', issueType: 'bug', severity: 'P0', confidence: 'needs_reproduction', impact: 'Phase chips render as plain text instead of relationship controls.', reproductionSteps: ['Open any task with a phaseId', 'Click the phase chip in the right rail', 'Nothing happens'], proposedFix: 'Route chip clicks through the object index.', relatedTaskIds: ['task-3'], path: 'memory/issues/bug-1.md' }
    ];
    const snapshot = {
      generatedAt: now,
      indices: { sprintSummaryCount: 1, taskSummaryCount: 3 },
      summary: {
        sprints: { total: 1, active: 1, planned: 0, completed: 0 },
        phases: { total: 2, completed: 0, active: 1 },
        tasks: { total: 3, done: 1, blocked: 1, inProgress: 1 },
        issues: { total: 2, open: 2, bySeverity: { P0: 1, P1: 1 }, byStatus: { in_progress: 1, blocked: 1 } },
        discoveries: { total: 1, promoted: 0, pending: 1, byStatus: { needs_research: 1 }, recent: [
          { id: 'discovery-1', kind: 'discovery', title: 'One generic rail renderer beats eight bespoke detail pages', status: 'needs_research', discoveryType: 'pattern', confidence: 'high', summary: 'A single right rail renderer can branch on object kind and keep navigation in one place.', sourceRawItemIds: ['raw-1'], relatedTasks: ['task-3'], promotedTo: ['task-3'], path: 'memory/work/discoveries/discovery-1.md', git: { branch: 'main', isDirty: false, lastCommit: { hash: '5e2b310', subject: 'log discovery: rail pattern', date: '2026-06-13' }, changedFiles: [] } }
        ] },
        raw: { total: 1, unresolved: 1, processed: 0, rejected: 0, recent: [
          { id: 'raw-1', kind: 'raw', title: 'Note: should the rail show agent run history?', status: 'unreconciled', sourceType: 'user_note', summary: 'Was reviewing task-3 and wondered if the right rail should surface which agent last touched the object and what command it ran.', promotedTo: ['discovery-1'], path: 'memory/inbox/raw-items.jsonl' }
        ] },
        relationships: { total: 8 },
        wiki: { pages: 1 },
        search: { ready: true, builtAt: now, pages: 1, chunks: 142, mode: 'hybrid', vectorDims: 2048, indexed: true, stale: false, missing: false }
      },
      focus: {
        sprints: [{
          id: 'sprint-18', kind: 'sprint', title: 'Dashboard Rebuild', status: 'active', goal: 'Replace the broken viewer with a cockpit that shows trust state, not just files.', startDate: '2026-06-10', endDate: '2026-06-24', phaseIds: ['phase-1','phase-2'], taskIds: ['task-1','task-2','task-3'], issueIds: ['issue-1'], discoveryIds: ['discovery-1'], completion: { total: 3, done: 1, blocked: 1, verified: 1 }, tags: ['dashboard','ui'], path: 'memory/work/sprints/sprint-18.md', git: { branch: 'main', isDirty: true, lastCommit: { hash: 'a3f91c2', subject: 'wire right rail to task list', date: '2026-06-16' }, changedFiles: ['dashboard/app.js','dashboard/styles.css'] }, index: { indexed: true, stale: false, chunkCount: 142, lastIndexedAt: now }, phases: [
            { id: 'phase-1', kind: 'phase', title: 'Read-only shell + right rail', status: 'active', goal: 'Stand up the shell and the right rail so every object kind can be inspected by clicking it.', taskIds: ['task-1','task-2'], dependsOn: [], git: { branch: 'main', isDirty: true, lastCommit: { hash: 'a3f91c2', subject: 'wire right rail to task list', date: '2026-06-16' }, changedFiles: ['dashboard/app.js'] }, index: { indexed: true, stale: false, chunkCount: 38, lastIndexedAt: now }, tasks: [
              { id: 'task-1', kind: 'task', title: 'Build right rail component', status: 'done', taskType: 'implementation', priority: 'P1', acceptanceCriteria: ['Selecting any object opens the rail', 'Rail shows metadata, relationships, git, index'], verificationEvidence: [{ id: 'evidence-1', type: 'manual-review', summary: 'Clicked through all 8 kinds', result: 'pass' }], filesTouched: ['dashboard/app.js'], git: { branch: 'main', isDirty: false, lastCommit: { hash: '9b7f001', subject: 'add right rail base component', date: '2026-06-15' }, changedFiles: [] }, index: { indexed: true, stale: false, chunkCount: 6, lastIndexedAt: now } },
              { id: 'task-2', kind: 'task', title: 'Wire live git status into cards', status: 'in_progress', taskType: 'implementation', priority: 'P1', blockedBy: ['bug-1'], acceptanceCriteria: ['Every card shows dirty/clean state', 'Trust strip updates on selection'], verificationEvidence: [], filesTouched: ['dashboard/app.js'], git: { branch: 'main', isDirty: true, lastCommit: { hash: 'a3f91c2', subject: 'wire right rail to task list', date: '2026-06-16' }, changedFiles: ['dashboard/app.js'] }, index: { indexed: true, stale: false, chunkCount: 4, lastIndexedAt: now } }
            ] },
            { id: 'phase-2', kind: 'phase', title: 'Relationship navigation', status: 'planned', goal: 'Make every relationship a link. Clicking a phase, task, or bug opens it.', taskIds: ['task-3'], dependsOn: ['phase-1'], git: { branch: 'main', isDirty: false, lastCommit: { hash: 'd12e4aa', subject: 'scaffold phase board', date: '2026-06-12' }, changedFiles: [] }, index: { indexed: true, stale: true, chunkCount: 9, lastIndexedAt: now }, tasks: [
              { id: 'task-3', kind: 'task', title: 'Make relationship pills clickable', status: 'blocked', taskType: 'implementation', priority: 'P0', blockedBy: ['bug-1'], related: ['discovery-1'], acceptanceCriteria: ['Clicking a phase/task/bug chip navigates to it', 'Back button supports nav history'], verificationEvidence: [], filesTouched: [], git: { branch: 'main', isDirty: false, lastCommit: { hash: 'd12e4aa', subject: 'scaffold phase board', date: '2026-06-12' }, changedFiles: [] }, index: { indexed: true, stale: true, chunkCount: 0, lastIndexedAt: now } }
            ] }
          ]
        }],
        featuredSprints: [],
        recentSprints: [],
        recentActivity: []
      }
    };
    return { snapshot, optionals: { issues, wiki: [
      { id: 'wiki-1', kind: 'wiki', title: 'Dashboard Architecture', status: 'fresh', wikiKind: 'system', freshness: 'fresh', tags: ['architecture','ui'], backlinks: ['sprint-18'], relatedTasks: ['task-1','task-3'], body: '# Why this exists\nMost dashboards show files. This one shows whether the files can be trusted.\n\n## The three zones\nLeft sidebar is navigation and counts. Main panel is the list for the object kind. Right rail is the inspector.\n\n## The trust strip\nEvery card carries three dots: git state, index freshness, and object status.', path: 'memory/wiki/dashboard-architecture.md', index: { indexed: true, stale: false, chunkCount: 5, lastIndexedAt: now } }
    ], git: { branch: 'main', dirtyFiles: ['dashboard/app.js','dashboard/styles.css'] } } };
  }

  loadDashboard();
  state.poll = setInterval(() => loadDashboard({ silent: true }), POLL_MS);
})();
