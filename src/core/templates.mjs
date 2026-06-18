const TEMPLATES = {
  task: {
    kind: 'task',
    title: 'New Task',
    body: `# New Task

## Goal

## Acceptance Criteria

## Verification Plan
`,
  },
  issue: {
    kind: 'issue',
    title: 'New Issue',
    body: `# New Issue

## Risk

## Acceptance Criteria

## Verification Plan
`,
  },
  sprint: {
    kind: 'sprint',
    title: 'New Sprint',
    body: `# New Sprint

## Goal

## Scope

## Success Gates
`,
  },
  phase: {
    kind: 'phase',
    title: 'New Phase',
    body: `# New Phase

## Goal

## Scope

## Success Gates
`,
  },
  discovery: {
    kind: 'discovery',
    title: 'New Discovery',
    body: `# New Discovery

## Observation

## Evidence

## Suggested Next Step
`,
  },
  wiki: {
    kind: 'concept',
    title: 'New Wiki Page',
    body: `# New Wiki Page

## Current Truth

## Notes

## Open Questions
`,
  },
};

export function listTemplates() {
  return Object.entries(TEMPLATES).map(([name, template]) => ({
    name,
    kind: template.kind,
    title: template.title,
    preview: template.body.split('\n').slice(0, 6).join('\n'),
  }));
}

export function getTemplate(name) {
  return TEMPLATES[name] || null;
}
