export const DASHBOARD_ROUTES = [
  { id: 'home', label: 'Home', domain: 'system', kind: 'home', endpoint: '/api/dashboard', readOnly: true, canonical: true },
  { id: 'sprints', label: 'Sprints', domain: 'work', kind: 'sprint', endpoint: '/api/work/sprints', readOnly: true, canonical: true },
  { id: 'phases', label: 'Phases', domain: 'work', kind: 'phase', endpoint: '/api/work/phases', readOnly: true, canonical: true },
  { id: 'tasks', label: 'Tasks', domain: 'work', kind: 'task', endpoint: '/api/work/tasks', readOnly: true, canonical: true },
  { id: 'issues', label: 'Issues', domain: 'work', kind: 'issue', endpoint: '/api/work/issues', readOnly: true, canonical: true },
  { id: 'bugs', label: 'Bugs', domain: 'work', kind: 'issue', endpoint: '/api/work/issues?issueType=bug', readOnly: true, canonical: false, viewOf: 'issues' },
  { id: 'discoveries', label: 'Discoveries', domain: 'work', kind: 'discovery', endpoint: '/api/work/discoveries', readOnly: true, canonical: true },
  { id: 'containers', label: 'Containers', domain: 'work', kind: 'container', endpoint: '/api/work/containers', readOnly: true, canonical: true },
  { id: 'initiatives', label: 'Initiatives', domain: 'work', kind: 'initiative', endpoint: '/api/work/initiatives', readOnly: true, canonical: true },
  { id: 'comments', label: 'Comments', domain: 'knowledge', kind: 'comment', endpoint: '/api/knowledge/comments', readOnly: true, canonical: true },
  { id: 'claims', label: 'Claims', domain: 'knowledge', kind: 'claim', endpoint: '/api/knowledge/claims', readOnly: true, canonical: true },
  { id: 'wiki', label: 'Wiki', domain: 'knowledge', kind: 'wiki', endpoint: '/api/knowledge/wiki', readOnly: true, canonical: true },
  { id: 'raw', label: 'Raw Intake', domain: 'intake', kind: 'raw', endpoint: '/api/intake/raw', readOnly: true, canonical: true },
  { id: 'graph', label: 'Graph', domain: 'graph', kind: 'edge', endpoint: '/api/graph', readOnly: true, canonical: true },
  { id: 'system', label: 'System', domain: 'system', kind: 'system', endpoint: '/api/system/status', readOnly: true, canonical: true },
];

export function listDashboardRoutes() {
  return DASHBOARD_ROUTES.map(route => ({ ...route }));
}

