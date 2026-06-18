const VIEWS = {
  overview: {
    title: 'Overview',
    subtitle: 'Wiki pages, work items, raw intake, search health, and recent memory activity.',
  },
  sprints: {
    title: 'Sprints',
    subtitle: 'Workstreams with phase progress, task counts, blocked work, and status.',
  },
  tasks: {
    title: 'Tasks',
    subtitle: 'Task state by sprint, including open, done, and blocked counts.',
  },
  issues: {
    title: 'Issues',
    subtitle: 'Open issue state by severity and status.',
  },
  inbox: {
    title: 'Inbox',
    subtitle: 'Raw memory notes waiting for routing, processing, or rejection.',
  },
  discoveries: {
    title: 'Discoveries',
    subtitle: 'Findings before issue promotion, wiki folding, or sprint assignment.',
  },
  activity: {
    title: 'Activity',
    subtitle: 'Recent memory events across sprint, phase, task, issue, inbox, and discovery records.',
  },
  system: {
    title: 'System',
    subtitle: 'API mode, refresh state, and the latest normalized dashboard payload.',
  },
};

const els = {
  navLinks: [...document.querySelectorAll('[data-route]')],
  routeButtons: [...document.querySelectorAll('[data-route-button]')],
  views: [...document.querySelectorAll('[data-view]')],
  viewTitle: document.getElementById('viewTitle'),
  viewSubtitle: document.getElementById('viewSubtitle'),
  headerCrumb: document.getElementById('headerCrumb'),
  dashboardSearch: document.getElementById('dashboardSearch'),
  autoRefreshToggle: document.getElementById('autoRefreshToggle'),
  refreshButton: document.getElementById('refreshButton'),
  mobileRefreshButton: document.getElementById('mobileRefreshButton'),
  mobileNavButton: document.getElementById('mobileNavButton'),
  modeNotice: document.getElementById('modeNotice'),
  railStatusCard: document.getElementById('railStatusCard'),
  railStatusLabel: document.getElementById('railStatusLabel'),
  railStatusCopy: document.getElementById('railStatusCopy'),
  summaryCards: document.getElementById('summaryCards'),
  priorityList: document.getElementById('priorityList'),
  priorityMeta: document.getElementById('priorityMeta'),
  overallCompletion: document.getElementById('overallCompletion'),
  overallCompletionBar: document.getElementById('overallCompletionBar'),
  memoryHealth: document.getElementById('memoryHealth'),
  overviewSprints: document.getElementById('overviewSprints'),
  overviewActivity: document.getElementById('overviewActivity'),
  sprintTable: document.getElementById('sprintTable'),
  sprintStatusFilter: document.getElementById('sprintStatusFilter'),
  sprintSort: document.getElementById('sprintSort'),
  taskTable: document.getElementById('taskTable'),
  taskStatusFilter: document.getElementById('taskStatusFilter'),
  issuesPanel: document.getElementById('issuesPanel'),
  issueStatusPanel: document.getElementById('issueStatusPanel'),
  issuesMeta: document.getElementById('issuesMeta'),
  rawPanel: document.getElementById('rawPanel'),
  rawMeta: document.getElementById('rawMeta'),
  inboxPressure: document.getElementById('inboxPressure'),
  discoveriesPanel: document.getElementById('discoveriesPanel'),
  activityTimeline: document.getElementById('activityTimeline'),
  activityTypeFilter: document.getElementById('activityTypeFilter'),
  systemPanel: document.getElementById('systemPanel'),
  systemMeta: document.getElementById('systemMeta'),
  jsonPreview: document.getElementById('jsonPreview'),
  detailDrawer: document.getElementById('detailDrawer'),
  detailDrawerScrim: document.getElementById('detailDrawerScrim'),
  detailCloseButton: document.getElementById('detailCloseButton'),
  detailEyebrow: document.getElementById('detailEyebrow'),
  detailTitle: document.getElementById('detailTitle'),
  detailMeta: document.getElementById('detailMeta'),
  detailBody: document.getElementById('detailBody'),
  navCounts: {
    overview: document.getElementById('navCountOverview'),
    sprints: document.getElementById('navCountSprints'),
    tasks: document.getElementById('navCountTasks'),
    issues: document.getElementById('navCountIssues'),
    inbox: document.getElementById('navCountInbox'),
    discoveries: document.getElementById('navCountDiscoveries'),
    activity: document.getElementById('navCountActivity'),
    system: document.getElementById('navCountSystem'),
  },
};

let refreshTimer = null;
let activeView = 'overview';
let latestData = null;
let latestMode = 'connecting';
let lastError = null;
const detailRegistry = new Map();
let detailSequence = 0;

const emptyData = {
  generatedAt: new Date().toISOString(),
  summary: {
    sprints: { active: 0, planned: 0, completed: 0, total: 0 },
    phases: { active: 0, completed: 0, total: 0 },
    tasks: { total: 0, done: 0, blocked: 0 },
    issues: {
      open: 0,
      total: 0,
      bySeverity: {},
      byStatus: {},
    },
    raw: { total: 0, unresolved: 0, processed: 0, rejected: 0 },
    discoveries: { total: 0, pending: 0, promoted: 0 },
    wiki: { pages: 0 },
    search: { ready: false, pages: 0, chunks: 0, mode: 'hybrid' },
  },
  focus: {
    sprints: [],
    featuredSprints: [],
    recentActivity: [],
    tasks: [],
  },
};

function apiUrl() {
  return new URL('/api/dashboard', window.location.href).toString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(asNumber(value))));
}

function humanize(value) {
  return String(value || 'unknown')
    .replaceAll(/[_-]+/g, ' ')
    .replace(/\b\w/g, match => match.toUpperCase());
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function toneForCount(value, { warn = 1, danger = 4 } = {}) {
  const count = asNumber(value);
  if (count <= 0) return 'good';
  if (count >= danger) return 'bad';
  if (count >= warn) return 'warn';
  return 'live';
}

function toneForStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['completed', 'done', 'verified', 'closed', 'processed'].includes(value)) return 'good';
  if (['blocked', 'rejected', 'duplicate', 'cancelled', 'failed'].includes(value)) return 'bad';
  if (['active', 'in_progress', 'needs_review', 'needs_verification', 'promoted', 'promoted_to_issue', 'open'].includes(value)) return 'live';
  if (['paused', 'pending', 'planned', 'deferred'].includes(value)) return 'warn';
  return 'idle';
}

function canonicalSprintStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['completed', 'done', 'verified', 'closed'].includes(value)) return 'completed';
  if (['active', 'in_progress'].includes(value)) return 'active';
  if (['planned', 'todo', 'ready_for_agent'].includes(value)) return 'planned';
  if (['paused'].includes(value)) return 'paused';
  if (['deferred'].includes(value)) return 'deferred';
  if (['blocked', 'cancelled', 'rejected'].includes(value)) return 'blocked';
  return value || 'unknown';
}

function canonicalTaskStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['done', 'completed', 'verified', 'closed'].includes(value)) return 'done';
  if (['blocked'].includes(value)) return 'blocked';
  if (['in_progress', 'active'].includes(value)) return 'active';
  return 'open';
}

function issueTone(key) {
  const value = String(key || '').toLowerCase();
  if (value.includes('critical') || value.includes('high') || value.includes('blocked')) return 'bad';
  if (value.includes('low') || value.includes('closed') || value.includes('resolved')) return 'good';
  if (value.includes('medium') || value.includes('review')) return 'warn';
  return 'live';
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function sprintProgress(sprint) {
  const progress = sprint?.progress || {};
  const taskCount = asNumber(progress.taskCount ?? sprint.taskCount ?? sprint.tasksTotal);
  const doneCount = asNumber(progress.doneCount ?? sprint.doneCount ?? sprint.tasksDone);
  const blockedCount = asNumber(progress.blockedCount ?? sprint.blockedCount ?? sprint.tasksBlocked);
  const percent = progress.percent ?? sprint.progressPercent ?? (taskCount ? Math.round((doneCount / taskCount) * 100) : 0);
  return {
    percent: clampPercent(percent),
    phaseCount: asNumber(progress.phaseCount ?? sprint.phaseCount),
    taskCount,
    doneCount,
    blockedCount,
    openCount: Math.max(0, taskCount - doneCount),
  };
}

function normalizeSummary(summary = {}) {
  return {
    sprints: {
      active: asNumber(summary.sprints?.active),
      planned: asNumber(summary.sprints?.planned),
      completed: asNumber(summary.sprints?.completed),
      total: asNumber(summary.sprints?.total),
    },
    phases: {
      active: asNumber(summary.phases?.active),
      completed: asNumber(summary.phases?.completed),
      total: asNumber(summary.phases?.total),
    },
    tasks: {
      total: asNumber(summary.tasks?.total),
      done: asNumber(summary.tasks?.done),
      blocked: asNumber(summary.tasks?.blocked),
    },
    issues: {
      open: asNumber(summary.issues?.open),
      total: asNumber(summary.issues?.total),
      bySeverity: summary.issues?.bySeverity || {},
      byStatus: summary.issues?.byStatus || {},
    },
    raw: {
      total: asNumber(summary.raw?.total),
      unresolved: asNumber(summary.raw?.unresolved),
      processed: asNumber(summary.raw?.processed),
      rejected: asNumber(summary.raw?.rejected),
    },
    discoveries: {
      total: asNumber(summary.discoveries?.total),
      pending: asNumber(summary.discoveries?.pending),
      promoted: asNumber(summary.discoveries?.promoted),
    },
    wiki: {
      pages: asNumber(summary.wiki?.pages),
    },
    search: {
      ready: Boolean(summary.search?.ready),
      builtAt: summary.search?.builtAt || '',
      pages: asNumber(summary.search?.pages),
      chunks: asNumber(summary.search?.chunks),
      mode: summary.search?.mode || 'hybrid',
      vectorDims: asNumber(summary.search?.vectorDims),
      indexed: Boolean(summary.search?.indexed),
    },
    comments: {
      total: asNumber(summary.comments?.total),
    },
    relationships: {
      total: asNumber(summary.relationships?.total),
    },
    containers: {
      total: asNumber(summary.containers?.total),
      byStatus: summary.containers?.byStatus || {},
    },
  };
}

function normalizeData(data) {
  const summary = normalizeSummary(data?.summary || {});
  const sprints = Array.isArray(data?.focus?.sprints) ? data.focus.sprints : [];
  const featuredSprints = Array.isArray(data?.focus?.featuredSprints)
    ? data.focus.featuredSprints
    : sprints.filter(sprint => ['planned', 'active', 'paused'].includes(String(sprint.status || '').toLowerCase())).slice(0, 8);
  const recentActivity = Array.isArray(data?.focus?.recentActivity) ? data.focus.recentActivity : [];
  const tasks = Array.isArray(data?.focus?.tasks) ? data.focus.tasks : [];
  return {
    generatedAt: data?.generatedAt || new Date().toISOString(),
    summary,
    focus: { sprints, featuredSprints, recentActivity, tasks },
    rawSource: data || {},
  };
}

function getTaskRows(data) {
  const explicitTasks = data.focus.tasks;
  if (explicitTasks.length) {
    return explicitTasks.map((task, index) => {
      const title = task.title || task.name || `Task ${index + 1}`;
      const status = task.status || 'unknown';
      const canonical = canonicalTaskStatus(status);
      return {
        id: task.id || `task_${index + 1}`,
        title,
        subtitle: task.description || task.goal || task.phaseTitle || task.sprintTitle || 'No task description recorded.',
        status,
        progress: clampPercent(task.progressPercent ?? (canonical === 'done' ? 100 : canonical === 'blocked' ? 0 : 15)),
        taskCount: 1,
        doneCount: canonical === 'done' ? 1 : 0,
        blockedCount: canonical === 'blocked' ? 1 : 0,
        openCount: canonical === 'done' ? 0 : 1,
        source: task.sprintTitle || task.entityType || 'Task',
        sprintTitle: task.sprintTitle || '',
        phaseTitle: task.phaseTitle || '',
        filesAffected: Array.isArray(task.filesAffected) ? task.filesAffected : [],
        issueTitles: Array.isArray(task.issueTitles) ? task.issueTitles : [],
        updatedAt: task.updatedAt || '',
      };
    });
  }

  return data.focus.sprints.map((sprint, index) => {
    const progress = sprintProgress(sprint);
    return {
      title: sprint.title || `Sprint ${index + 1}`,
      subtitle: sprint.goal || sprint.description || 'No sprint goal recorded.',
      status: sprint.status || 'unknown',
      progress: progress.percent,
      taskCount: progress.taskCount,
      doneCount: progress.doneCount,
      blockedCount: progress.blockedCount,
      openCount: progress.openCount,
      source: 'Sprint rollup',
    };
  });
}

function setMode(mode, copy, error = null) {
  latestMode = mode;
  lastError = error;
  els.railStatusCard.classList.remove('is-live', 'is-demo', 'is-error');
  if (mode === 'live') {
    els.railStatusCard.classList.add('is-live');
    els.railStatusLabel.textContent = 'Live';
    els.railStatusCopy.textContent = copy || 'Connected to dashboard API.';
    els.modeNotice.hidden = true;
    els.modeNotice.innerHTML = '';
    return;
  }
  if (mode === 'error') {
    els.railStatusCard.classList.add('is-error');
    els.railStatusLabel.textContent = 'API error';
    els.railStatusCopy.textContent = copy || 'Live fetch failed.';
    els.modeNotice.hidden = false;
    els.modeNotice.innerHTML = `<strong>Live data failed to load.</strong> ${escapeHtml(copy || 'The dashboard is showing the last safe state or demo data.')} `;
    return;
  }
  els.railStatusLabel.textContent = 'Connecting';
  els.railStatusCopy.textContent = copy || 'Waiting for dashboard API.';
}

function routeTo(route, { updateHash = true } = {}) {
  const next = VIEWS[route] ? route : 'overview';
  activeView = next;
  closeDetail();

  els.views.forEach(view => {
    const isActive = view.dataset.view === next;
    view.hidden = !isActive;
    view.classList.toggle('is-active', isActive);
  });

  els.navLinks.forEach(link => {
    const isActive = link.dataset.route === next;
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  els.viewTitle.textContent = VIEWS[next].title;
  els.viewSubtitle.textContent = VIEWS[next].subtitle;
  els.headerCrumb.textContent = VIEWS[next].title;
  els.dashboardSearch.value = '';
  applySearch();

  if (updateHash && window.location.hash !== `#${next}`) {
    history.pushState(null, '', `#${next}`);
  }
  document.body.classList.remove('nav-open');
  els.mobileNavButton?.setAttribute('aria-expanded', 'false');
}

function renderSummary(data) {
  const summary = data.summary;
  const openTasks = Math.max(0, summary.tasks.total - summary.tasks.done);
  const cards = [
    { label: 'Sprints', value: summary.sprints.active, detail: `${summary.sprints.planned} planned · ${summary.sprints.total} total`, route: 'sprints' },
    { label: 'Tasks open', value: openTasks, detail: `${summary.tasks.done} done · ${summary.tasks.blocked} blocked`, route: 'tasks' },
    { label: 'Wiki pages', value: summary.wiki.pages, detail: 'Canonical pages and notes', route: 'overview' },
    { label: 'Search ready', value: summary.search.ready ? 'Yes' : 'No', detail: `${summary.search.pages || 0} pages indexed`, route: 'system' },
    { label: 'Inbox waiting', value: summary.raw.unresolved, detail: `${summary.raw.total} raw records`, route: 'inbox' },
    { label: 'Discoveries', value: summary.discoveries.pending, detail: `${summary.discoveries.promoted} promoted`, route: 'discoveries' },
    { label: 'Activity', value: data.focus.recentActivity.length, detail: `Last refresh ${formatDate(data.generatedAt)}`, route: 'activity' },
  ];

  els.summaryCards.innerHTML = cards.map(card => `
    <article class="metric-card is-clickable" role="button" tabindex="0" data-route-button="${escapeHtml(card.route)}" data-search-text="${escapeHtml(`${card.label} ${card.value} ${card.detail}`)}">
      <div class="metric-label">${escapeHtml(card.label)}</div>
      <div class="metric-value">${escapeHtml(card.value)}</div>
      <p class="metric-detail">${escapeHtml(card.detail)}</p>
    </article>
  `).join('');

  els.navCounts.overview.textContent = 'Live';
  els.navCounts.sprints.textContent = summary.sprints.total;
  els.navCounts.tasks.textContent = openTasks;
  els.navCounts.issues.textContent = summary.issues.open;
  els.navCounts.inbox.textContent = summary.raw.unresolved;
  els.navCounts.discoveries.textContent = summary.discoveries.pending;
  els.navCounts.activity.textContent = data.focus.recentActivity.length;
  els.navCounts.system.textContent = latestMode === 'live' ? 'Live' : latestMode === 'demo' ? 'Demo' : 'API';

  const completion = summary.tasks.total ? Math.round((summary.tasks.done / summary.tasks.total) * 100) : 0;
  els.overallCompletion.textContent = `${completion}%`;
  els.overallCompletionBar.style.width = `${clampPercent(completion)}%`;

  const health = [
    { label: 'Blocked tasks', value: summary.tasks.blocked ? `${summary.tasks.blocked}` : 'Clear', copy: summary.tasks.blocked ? 'Blocked work should be handled before more scope gets added.' : 'No blocked task pressure in the summary.', tone: toneForCount(summary.tasks.blocked, { warn: 1, danger: 4 }) },
    { label: 'Raw inbox', value: summary.raw.unresolved ? `${summary.raw.unresolved}` : 'Clear', copy: summary.raw.unresolved ? 'Unrouted memory can turn into duplicate or stale work.' : 'No raw source material is waiting.', tone: toneForCount(summary.raw.unresolved, { warn: 1, danger: 8 }) },
    { label: 'Wiki pages', value: summary.wiki.pages ? `${summary.wiki.pages}` : 'Empty', copy: summary.wiki.pages ? 'Canonical pages are available for search and linking.' : 'No wiki pages have been created yet.', tone: toneForCount(summary.wiki.pages, { warn: 1, danger: 6 }) },
    { label: 'Search index', value: summary.search.ready ? 'Ready' : 'Missing', copy: summary.search.ready ? `${summary.search.pages || 0} pages and ${summary.search.chunks || 0} chunks indexed.` : 'Search artifacts need to be rebuilt.', tone: summary.search.ready ? 'good' : 'bad' },
  ];

  els.memoryHealth.innerHTML = health.map(item => `
    <article class="health-item" data-search-text="${escapeHtml(`${item.label} ${item.value} ${item.copy}`)}">
      <div class="health-top">
        <span class="mini-label">${escapeHtml(item.label)}</span>
        <strong class="status-badge tone-${escapeHtml(item.tone)}">${escapeHtml(item.value)}</strong>
      </div>
      <span class="health-copy">${escapeHtml(item.copy)}</span>
    </article>
  `).join('');
}

function priorityItems(summary) {
  return [
    {
      label: 'Blocked tasks',
      value: summary.tasks.blocked,
      copy: summary.tasks.blocked ? 'Resolve blockers before trusting sprint progress.' : 'No blocked task pressure.',
      route: 'tasks',
      tone: toneForCount(summary.tasks.blocked, { warn: 1, danger: 4 }),
    },
    {
      label: 'Unreconciled inbox',
      value: summary.raw.unresolved,
      copy: summary.raw.unresolved ? 'Route raw notes into issues, tasks, wiki, or rejection.' : 'Inbox is clear.',
      route: 'inbox',
      tone: toneForCount(summary.raw.unresolved, { warn: 1, danger: 8 }),
    },
    {
      label: 'Open issues',
      value: summary.issues.open,
      copy: summary.issues.open ? 'Triage issue severity and assign to sprint work.' : 'Issue queue is clear.',
      route: 'issues',
      tone: toneForCount(summary.issues.open, { warn: 1, danger: 12 }),
    },
    {
      label: 'Pending discoveries',
      value: summary.discoveries.pending,
      copy: summary.discoveries.pending ? 'Promote useful findings or fold them into docs.' : 'No pending discovery backlog.',
      route: 'discoveries',
      tone: toneForCount(summary.discoveries.pending, { warn: 2, danger: 10 }),
    },
  ].sort((a, b) => asNumber(b.value) - asNumber(a.value));
}

function registerDetail(record) {
  const key = `detail_${++detailSequence}`;
  detailRegistry.set(key, record);
  return key;
}

function renderDetailList(items, empty = 'None recorded.') {
  if (!items || !items.length) return `<div class="detail-empty">${escapeHtml(empty)}</div>`;
  return `<ul class="detail-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderDetailSections(sections) {
  return sections.map(section => `
    <section class="detail-section">
      <h3>${escapeHtml(section.title)}</h3>
      ${section.html}
    </section>
  `).join('');
}

function openDetail(key) {
  const detail = detailRegistry.get(key);
  if (!detail) return;
  els.detailEyebrow.textContent = detail.eyebrow || 'Record';
  els.detailTitle.textContent = detail.title || 'Record details';
  els.detailMeta.textContent = detail.meta || '';
  els.detailBody.innerHTML = detail.body || '<div class="empty-state">No additional detail available.</div>';
  els.detailDrawer.classList.add('is-open');
  els.detailDrawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('detail-open');
}

function closeDetail() {
  els.detailDrawer.classList.remove('is-open');
  els.detailDrawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('detail-open');
}

function renderPriority(summary, target = els.priorityList) {
  const items = priorityItems(summary);
  const active = items.filter(item => asNumber(item.value) > 0).length;
  els.priorityMeta.textContent = `${active} active`;
  target.innerHTML = items.map((item, index) => `
    <article class="priority-row" data-route-button="${escapeHtml(item.route)}" data-search-text="${escapeHtml(`${item.label} ${item.value} ${item.copy}`)}">
      <span class="priority-index">${String(index + 1).padStart(2, '0')}</span>
      <div class="priority-main">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.copy)}</span>
      </div>
      <span class="priority-badge tone-${escapeHtml(item.tone)}">${escapeHtml(item.value)}</span>
    </article>
  `).join('');
}

function sortedSprints(data) {
  const selected = els.sprintStatusFilter.value;
  const sort = els.sprintSort.value;
  const rows = data.focus.sprints.filter(sprint => {
    if (selected === 'all') return true;
    return canonicalSprintStatus(sprint.status) === selected;
  });

  rows.sort((a, b) => {
    const ap = sprintProgress(a);
    const bp = sprintProgress(b);
    if (sort === 'progress-desc') return bp.percent - ap.percent;
    if (sort === 'progress-asc') return ap.percent - bp.percent;
    if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
    return (bp.blockedCount - ap.blockedCount) || (bp.openCount - ap.openCount) || (ap.percent - bp.percent);
  });

  return rows;
}

function sprintRowsMarkup(rows, { compact = false } = {}) {
  if (!rows.length) return emptyState('No sprint records match the current filters.');
  const header = compact
    ? '<div class="compact-row header"><span>Sprint</span><span>Status</span><span>Progress</span><span>Blocked</span></div>'
    : '<div class="work-row header"><span>Sprint</span><span>Status</span><span>Phases</span><span>Tasks</span><span>Blocked</span><span>Progress</span></div>';

  const body = rows.map((sprint, index) => {
    const title = sprint.title || `Sprint ${index + 1}`;
    const goal = sprint.goal || sprint.description || 'No sprint goal recorded.';
    const status = sprint.status || 'unknown';
    const tone = sprint.tone || toneForStatus(status);
    const progress = sprintProgress(sprint);
    const phases = Array.isArray(sprint.phases) ? sprint.phases : [];
    const detailKey = registerDetail({
      eyebrow: 'Sprint',
      title,
      meta: `${humanize(status)} · ${sprint.id || 'No id'} · Updated ${formatDate(sprint.updatedAt)}`,
      body: renderDetailSections([
        {
          title: 'Goal',
          html: `<p>${escapeHtml(goal)}</p>`,
        },
        {
          title: 'Progress',
          html: `
            <div class="detail-stats">
              <article><span>Phases</span><strong>${escapeHtml(progress.phaseCount)}</strong></article>
              <article><span>Tasks</span><strong>${escapeHtml(progress.taskCount)}</strong></article>
              <article><span>Done</span><strong>${escapeHtml(progress.doneCount)}</strong></article>
              <article><span>Blocked</span><strong>${escapeHtml(progress.blockedCount)}</strong></article>
              <article><span>Completion</span><strong>${escapeHtml(`${progress.percent}%`)}</strong></article>
            </div>
          `,
        },
        {
          title: 'Phases',
          html: phases.length
            ? phases.map(phase => `
                <article class="detail-phase">
                  <div class="detail-phase__head">
                    <strong>${escapeHtml(phase.number ? `P${phase.number}. ` : '')}${escapeHtml(phase.title || phase.id)}</strong>
                    <span class="status-badge tone-${escapeHtml(phase.tone || toneForStatus(phase.status))}">${escapeHtml(humanize(phase.status))}</span>
                  </div>
                  <p>${escapeHtml(`${phase.progress?.doneCount || 0}/${phase.progress?.taskCount || 0} tasks complete`)}</p>
                  ${renderDetailList((phase.tasks || []).map(task => `${task.title} (${humanize(task.status)})`), 'No linked tasks.')}
                </article>
              `).join('')
            : '<div class="detail-empty">No phases linked to this sprint.</div>',
        },
        {
          title: 'CLI',
          html: `<code>./mm sprint show ${escapeHtml(sprint.id || '')}</code>`,
        },
      ]),
    });
    if (compact) {
      return `
        <article class="compact-row is-clickable" role="button" tabindex="0" data-detail-key="${escapeHtml(detailKey)}" data-status="${escapeHtml(status)}" data-search-text="${escapeHtml(`${title} ${goal} ${status}`)}">
          <div class="compact-title-cell"><strong class="compact-title">${escapeHtml(title)}</strong><span class="compact-subtitle">${escapeHtml(goal)}</span></div>
          <span class="status-badge tone-${escapeHtml(tone)}">${escapeHtml(humanize(status))}</span>
          <div class="progress-track"><span style="width:${progress.percent}%"></span></div>
          <span class="number-cell">${escapeHtml(progress.blockedCount)}</span>
        </article>
      `;
    }
    return `
      <article class="work-row is-clickable" role="button" tabindex="0" data-detail-key="${escapeHtml(detailKey)}" data-status="${escapeHtml(canonicalSprintStatus(status))}" data-search-text="${escapeHtml(`${title} ${goal} ${status} ${progress.phaseCount} ${progress.taskCount} ${progress.blockedCount}`)}">
        <div class="work-title-cell"><strong class="work-title">${escapeHtml(title)}</strong><span class="work-subtitle">${escapeHtml(goal)}</span></div>
        <span class="status-badge tone-${escapeHtml(tone)}">${escapeHtml(humanize(status))}</span>
        <span class="number-cell">${escapeHtml(progress.phaseCount)}</span>
        <span class="number-cell">${escapeHtml(progress.taskCount)}</span>
        <span class="number-cell">${escapeHtml(progress.blockedCount)}</span>
        <div class="progress-track" title="${progress.percent}% complete"><span style="width:${progress.percent}%"></span></div>
      </article>
    `;
  }).join('');
  return header + body;
}

function renderSprints(data) {
  const rows = sortedSprints(data);
  els.sprintTable.innerHTML = sprintRowsMarkup(rows);
  els.overviewSprints.innerHTML = sprintRowsMarkup((data.focus.featuredSprints || data.focus.sprints).slice(0, 5), { compact: true });
}

function renderTasks(data) {
  let rows = getTaskRows(data);
  const filter = els.taskStatusFilter.value;
  if (filter === 'blocked') rows = rows.filter(row => row.blockedCount > 0 || String(row.status).toLowerCase() === 'blocked');
  if (filter === 'open') rows = rows.filter(row => row.openCount > 0);
  if (filter === 'done') rows = rows.filter(row => row.doneCount >= row.taskCount && row.taskCount > 0);
  rows.sort((a, b) => (b.blockedCount - a.blockedCount) || (b.openCount - a.openCount) || (a.progress - b.progress));

  if (!rows.length) {
    els.taskTable.innerHTML = emptyState('No task rows match the current filters.');
    return;
  }

  const header = '<div class="work-row header"><span>Task source</span><span>Status</span><span>Open</span><span>Done</span><span>Blocked</span><span>Progress</span></div>';
  const body = rows.map(row => {
    const tone = row.blockedCount ? 'bad' : toneForStatus(row.status);
    const detailKey = registerDetail({
      eyebrow: 'Task',
      title: row.title,
      meta: `${humanize(row.status)} · ${row.id || 'No id'}${row.updatedAt ? ` · Updated ${formatDate(row.updatedAt)}` : ''}`,
      body: renderDetailSections([
        {
          title: 'Summary',
          html: `<p>${escapeHtml(row.subtitle)}</p>`,
        },
        {
          title: 'Placement',
          html: `
            <div class="detail-stats">
              <article><span>Sprint</span><strong>${escapeHtml(row.sprintTitle || row.source || 'Unassigned')}</strong></article>
              <article><span>Phase</span><strong>${escapeHtml(row.phaseTitle || 'Unassigned')}</strong></article>
              <article><span>Open</span><strong>${escapeHtml(row.openCount)}</strong></article>
              <article><span>Done</span><strong>${escapeHtml(row.doneCount)}</strong></article>
              <article><span>Blocked</span><strong>${escapeHtml(row.blockedCount)}</strong></article>
            </div>
          `,
        },
        {
          title: 'Files affected',
          html: renderDetailList((row.filesAffected || []).map(file => String(file)), 'No file list recorded.'),
        },
        {
          title: 'Linked issues',
          html: renderDetailList((row.issueTitles || []).map(issue => String(issue)), 'No linked issues.'),
        },
        {
          title: 'CLI',
          html: row.id ? `<code>./mm task show ${escapeHtml(row.id)}</code>` : '<div class="detail-empty">No CLI id available for this row.</div>',
        },
      ]),
    });
    return `
      <article class="work-row is-clickable" role="button" tabindex="0" data-detail-key="${escapeHtml(detailKey)}" data-search-text="${escapeHtml(`${row.title} ${row.subtitle} ${row.status} ${row.source}`)}">
        <div class="work-title-cell"><strong class="work-title">${escapeHtml(row.title)}</strong><span class="work-subtitle">${escapeHtml(row.subtitle)}</span></div>
        <span class="status-badge tone-${escapeHtml(tone)}">${escapeHtml(humanize(row.status))}</span>
        <span class="number-cell">${escapeHtml(row.openCount)}</span>
        <span class="number-cell">${escapeHtml(row.doneCount)}</span>
        <span class="number-cell">${escapeHtml(row.blockedCount)}</span>
        <div class="progress-track" title="${row.progress}% complete"><span style="width:${row.progress}%"></span></div>
      </article>
    `;
  }).join('');
  els.taskTable.innerHTML = header + body;
}

function sortedEntries(record) {
  return Object.entries(record || {})
    .map(([key, value]) => [key, asNumber(value)])
    .sort((a, b) => b[1] - a[1]);
}

function renderIssues(summary) {
  const severityItems = sortedEntries(summary.issues.bySeverity);
  const statusItems = sortedEntries(summary.issues.byStatus);
  els.issuesMeta.textContent = `${summary.issues.open} open`;

  els.issuesPanel.innerHTML = severityItems.length ? severityItems.map(([severity, count]) => {
    const tone = issueTone(severity);
    const detailKey = registerDetail({
      eyebrow: 'Issue severity',
      title: `${humanize(severity)} issues`,
      meta: `${plural(count, 'record')} in the current dashboard payload`,
      body: renderDetailSections([
        { title: 'Summary', html: `<p>${escapeHtml(`${humanize(severity)} issues are currently grouped together in the dashboard severity breakdown.`)}</p>` },
      ]),
    });
    return `
      <article class="issue-row is-clickable" role="button" tabindex="0" data-detail-key="${escapeHtml(detailKey)}" data-search-text="${escapeHtml(`${severity} ${count}`)}">
        <div class="issue-main">
          <span class="issue-dot ${tone === 'bad' ? 'bad' : tone === 'good' ? 'good' : tone === 'live' ? 'live' : ''}" aria-hidden="true"></span>
          <div><strong>${escapeHtml(humanize(severity))}</strong><span class="issue-subtext">${escapeHtml(tone === 'bad' ? 'Needs first look' : tone === 'good' ? 'Low pressure' : 'Needs triage')}</span></div>
        </div>
        <span class="issue-count">${escapeHtml(count)}</span>
      </article>
    `;
  }).join('') : emptyState('No issue severity breakdown returned by the memory payload.');

  const max = Math.max(...statusItems.map(([, count]) => count), 1);
  els.issueStatusPanel.innerHTML = statusItems.length ? statusItems.map(([status, count]) => {
    const percent = Math.round((count / max) * 100);
    const tone = toneForStatus(status);
    const detailKey = registerDetail({
      eyebrow: 'Issue status',
      title: `${humanize(status)} issues`,
      meta: `${plural(count, 'record')} in this status bucket`,
      body: renderDetailSections([
        { title: 'Summary', html: `<p>${escapeHtml(`${humanize(status)} issues account for ${count} records in the latest payload.`)}</p>` },
      ]),
    });
    return `
      <article class="status-row is-clickable" role="button" tabindex="0" data-detail-key="${escapeHtml(detailKey)}" data-search-text="${escapeHtml(`${status} ${count}`)}">
        <div><strong>${escapeHtml(humanize(status))}</strong><span class="issue-subtext">${escapeHtml(plural(count, 'record'))}</span></div>
        <span class="status-count">${escapeHtml(count)}</span>
        <div class="progress-track"><span class="tone-${escapeHtml(tone)}" style="width:${clampPercent(percent)}%"></span></div>
      </article>
    `;
  }).join('') : emptyState('No issue status mix returned by the memory payload.');
}

function renderInbox(summary) {
  const raw = summary.raw;
  els.rawMeta.textContent = `${raw.total} total`;
  const columns = [
    { label: 'Unreconciled', value: raw.unresolved, copy: 'Needs routing into sprint, task, issue, doc, or rejection.', tone: toneForCount(raw.unresolved, { warn: 1, danger: 8 }) },
    { label: 'Processed', value: raw.processed, copy: 'Already folded into deterministic memory records.', tone: raw.processed ? 'good' : 'idle' },
    { label: 'Rejected', value: raw.rejected, copy: 'Rejected or intentionally ignored source material.', tone: raw.rejected ? 'warn' : 'idle' },
  ];

  els.rawPanel.innerHTML = columns.map(item => {
    const detailKey = registerDetail({
      eyebrow: 'Inbox bucket',
      title: item.label,
      meta: `${plural(item.value, 'record')} in this bucket`,
      body: renderDetailSections([
        { title: 'Summary', html: `<p>${escapeHtml(item.copy)}</p>` },
      ]),
    });
    return `
    <article class="inbox-column is-clickable" role="button" tabindex="0" data-detail-key="${escapeHtml(detailKey)}" data-search-text="${escapeHtml(`${item.label} ${item.value} ${item.copy}`)}">
      <span class="mini-label">${escapeHtml(item.label)}</span>
      <div class="inbox-value">${escapeHtml(item.value)}</div>
      <p class="work-subtitle">${escapeHtml(item.copy)}</p>
      <span class="status-badge tone-${escapeHtml(item.tone)}">${escapeHtml(humanize(item.tone))}</span>
    </article>
  `;
  }).join('');

  renderPriority(summary, els.inboxPressure);
}

function renderDiscoveries(summary) {
  const items = [
    { label: 'Pending', value: summary.discoveries.pending, copy: 'Still need promotion, rejection, or wiki folding.', tone: toneForCount(summary.discoveries.pending, { warn: 2, danger: 10 }) },
    { label: 'Promoted', value: summary.discoveries.promoted, copy: 'Escalated into tracked issue or build work.', tone: summary.discoveries.promoted ? 'good' : 'idle' },
    { label: 'Total', value: summary.discoveries.total, copy: 'Discovery records known to memory.', tone: summary.discoveries.total ? 'live' : 'idle' },
  ];
  els.discoveriesPanel.innerHTML = items.map(item => {
    const detailKey = registerDetail({
      eyebrow: 'Discovery bucket',
      title: item.label,
      meta: `${plural(item.value, 'record')} in this bucket`,
      body: renderDetailSections([
        { title: 'Summary', html: `<p>${escapeHtml(item.copy)}</p>` },
      ]),
    });
    return `
    <article class="discovery-card is-clickable" role="button" tabindex="0" data-detail-key="${escapeHtml(detailKey)}" data-search-text="${escapeHtml(`${item.label} ${item.value} ${item.copy}`)}">
      <p class="kicker">${escapeHtml(item.label)}</p>
      <strong>${escapeHtml(item.value)}</strong>
      <p>${escapeHtml(item.copy)}</p>
      <span class="status-badge tone-${escapeHtml(item.tone)}">${escapeHtml(humanize(item.tone))}</span>
    </article>
  `;
  }).join('');
}

function activityRowsMarkup(events, { compact = false } = {}) {
  if (!events.length) return emptyState('No recent memory events returned.');
  const visible = compact ? events.slice(0, 5) : events;
  return visible.map(event => {
    const type = event.entityType || 'event';
    const title = event.title || `${humanize(type)} update`;
    const note = event.note || `${humanize(type)} ${event.entityId ? `#${event.entityId}` : ''}`.trim();
    const status = event.status || event.event || 'unknown';
    const tone = toneForStatus(status);
    const detailKey = registerDetail({
      eyebrow: 'Activity event',
      title,
      meta: `${humanize(type)} · ${humanize(event.event || status)} · ${formatDate(event.at)}`,
      body: renderDetailSections([
        { title: 'Summary', html: `<p>${escapeHtml(note)}</p>` },
        { title: 'Status', html: `<div class="detail-stats"><article><span>Type</span><strong>${escapeHtml(humanize(type))}</strong></article><article><span>Status</span><strong>${escapeHtml(humanize(status))}</strong></article>${event.entityId ? `<article><span>Entity</span><strong>${escapeHtml(event.entityId)}</strong></article>` : ''}</div>` },
      ]),
    });
    return `
      <article class="activity-row is-clickable" role="button" tabindex="0" data-detail-key="${escapeHtml(detailKey)}" data-activity-type="${escapeHtml(String(type).toLowerCase())}" data-search-text="${escapeHtml(`${title} ${note} ${type} ${status} ${event.event}`)}">
        <time class="activity-time" datetime="${escapeHtml(event.at || '')}">${escapeHtml(formatTime(event.at))}<br>${escapeHtml(formatDate(event.at).split(',')[0])}</time>
        <div>
          <strong class="activity-title">${escapeHtml(title)}</strong>
          <span class="activity-copy">${escapeHtml(note)}</span>
        </div>
        <div class="activity-meta">
          <span class="row-type">${escapeHtml(String(type).charAt(0).toUpperCase())}</span>
          <span class="status-badge tone-${escapeHtml(tone)}">${escapeHtml(humanize(event.event || status))}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderActivity(events) {
  const types = [...new Set(events.map(event => String(event.entityType || 'event').toLowerCase()))].sort();
  const current = els.activityTypeFilter.value || 'all';
  els.activityTypeFilter.innerHTML = '<option value="all">All types</option>' + types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(humanize(type))}</option>`).join('');
  els.activityTypeFilter.value = types.includes(current) ? current : 'all';

  const selectedType = els.activityTypeFilter.value;
  const filtered = selectedType === 'all' ? events : events.filter(event => String(event.entityType || 'event').toLowerCase() === selectedType);
  els.activityTimeline.innerHTML = activityRowsMarkup(filtered);
  els.overviewActivity.innerHTML = activityRowsMarkup(events, { compact: true });
}

function renderSystem(data) {
  const items = [
    ['Mode', humanize(latestMode)],
    ['API endpoint', '/api/dashboard'],
    ['Last refresh', formatDate(data.generatedAt)],
    ['Auto refresh', els.autoRefreshToggle.checked ? 'On · 15 seconds' : 'Off'],
    ['Last error', lastError ? lastError.message : 'None'],
  ];
  els.systemMeta.textContent = latestMode;
  els.systemPanel.innerHTML = items.map(([key, value]) => `
    <article class="system-row" data-search-text="${escapeHtml(`${key} ${value}`)}">
      <span class="system-key">${escapeHtml(key)}</span>
      <strong class="system-value">${escapeHtml(value)}</strong>
    </article>
  `).join('');
  els.jsonPreview.textContent = JSON.stringify(data.rawSource || data, null, 2);
}

function renderAll(data) {
  latestData = data;
  detailRegistry.clear();
  detailSequence = 0;
  renderSummary(data);
  renderPriority(data.summary);
  renderSprints(data);
  renderTasks(data);
  renderIssues(data.summary);
  renderInbox(data.summary);
  renderDiscoveries(data.summary);
  renderActivity(data.focus.recentActivity);
  renderSystem(data);
  bindDynamicRouteButtons();
  bindDetailButtons();
  applySearch();
}

function applySearch() {
  const query = els.dashboardSearch.value.trim().toLowerCase();
  const active = document.querySelector(`[data-view="${activeView}"]`);
  if (!active) return;
  active.querySelectorAll('[data-search-text]').forEach(item => {
    const text = item.dataset.searchText.toLowerCase();
    item.classList.toggle('hidden-by-filter', Boolean(query) && !text.includes(query));
  });
}

function bindDynamicRouteButtons() {
  document.querySelectorAll('[data-route-button]').forEach(button => {
    if (button.dataset.routeBound === 'true') return;
    button.dataset.routeBound = 'true';
    button.addEventListener('click', () => routeTo(button.dataset.routeButton));
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        routeTo(button.dataset.routeButton);
      }
    });
  });
}

function bindDetailButtons() {
  document.querySelectorAll('[data-detail-key]').forEach(button => {
    if (button.dataset.detailBound === 'true') return;
    button.dataset.detailBound = 'true';
    button.addEventListener('click', () => openDetail(button.dataset.detailKey));
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail(button.dataset.detailKey);
      }
    });
  });
}

async function refresh() {
  setMode('connecting', 'Fetching dashboard data.');
  try {
    const response = await fetch(apiUrl(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Dashboard API failed with ${response.status}`);
    const raw = await response.json();
    const data = normalizeData(raw);
    setMode('live', `Updated ${formatTime(data.generatedAt)}.`);
    renderAll(data);
  } catch (error) {
    const data = normalizeData(latestData?.rawSource || emptyData);
    setMode('error', error.message, error);
    renderAll(data);
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  if (!els.autoRefreshToggle.checked) return;
  refreshTimer = setInterval(() => {
    refresh().catch(error => setMode('error', error.message, error));
  }, 15000);
}

function bootRouting() {
  els.navLinks.forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      routeTo(link.dataset.route);
    });
  });

  els.routeButtons.forEach(button => {
    button.addEventListener('click', () => routeTo(button.dataset.routeButton));
  });

  window.addEventListener('hashchange', () => {
    routeTo(window.location.hash.slice(1) || 'overview', { updateHash: false });
  });

  routeTo(window.location.hash.slice(1) || 'overview', { updateHash: false });
}

function bootControls() {
  els.refreshButton.addEventListener('click', () => refresh());
  els.mobileRefreshButton.addEventListener('click', () => refresh());
  els.autoRefreshToggle.addEventListener('change', () => {
    if (latestData) renderSystem(latestData);
    scheduleRefresh();
  });
  els.dashboardSearch.addEventListener('input', applySearch);
  els.sprintStatusFilter.addEventListener('change', () => latestData && renderSprints(latestData));
  els.sprintSort.addEventListener('change', () => latestData && renderSprints(latestData));
  els.taskStatusFilter.addEventListener('change', () => latestData && renderTasks(latestData));
  els.activityTypeFilter.addEventListener('change', () => latestData && renderActivity(latestData.focus.recentActivity));
  els.mobileNavButton?.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('nav-open');
    els.mobileNavButton.setAttribute('aria-expanded', String(isOpen));
  });

  window.addEventListener('keydown', event => {
    if (event.key === '/' && document.activeElement !== els.dashboardSearch) {
      event.preventDefault();
      els.dashboardSearch.focus();
    }
    if (event.key === 'Escape') {
      closeDetail();
      document.body.classList.remove('nav-open');
      els.mobileNavButton?.setAttribute('aria-expanded', 'false');
    }
  });

  els.detailDrawerScrim?.addEventListener('click', closeDetail);
  els.detailCloseButton?.addEventListener('click', closeDetail);
}

bootRouting();
bootControls();
refresh().then(scheduleRefresh).catch(error => {
  setMode('error', error.message, error);
  renderAll(normalizeData(emptyData));
});
