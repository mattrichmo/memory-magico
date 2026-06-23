import fs from 'fs/promises';
import path from 'path';
import { memoryRoot } from './paths.mjs';
import { listRecords, readLatestIndex } from './records.mjs';
import { loadIndex, searchStatus } from './retrieval.mjs';
import { listDashboardRoutes } from './dashboard-contracts.mjs';

const sprintRoot = path.join(memoryRoot, 'work', 'sprints');
const phaseRoot = path.join(memoryRoot, 'work', 'phases');
const taskRoot = path.join(memoryRoot, 'work', 'tasks');
const issueRoot = path.join(memoryRoot, 'work', 'issues');
const containerRoot = path.join(memoryRoot, 'work', 'containers');
const discoveryRoot = path.join(memoryRoot, 'work', 'discoveries');
const commentRoot = path.join(memoryRoot, 'work', 'comments');

const sprintIndex = path.join(memoryRoot, 'work', 'sprints', 'index.jsonl');
const phaseIndex = path.join(memoryRoot, 'work', 'phases', 'index.jsonl');
const taskIndex = path.join(memoryRoot, 'work', 'tasks', 'index.jsonl');
const issueIndex = path.join(memoryRoot, 'work', 'issues', 'index.jsonl');
const discoveryIndex = path.join(memoryRoot, 'work', 'discoveries', 'index.jsonl');
const commentIndex = path.join(memoryRoot, 'work', 'comments', 'index.jsonl');
const rawIndex = path.join(memoryRoot, 'inbox', 'raw-items.jsonl');
const relationshipIndex = path.join(memoryRoot, 'issues', 'relationships.jsonl');
const wikiRoot = path.join(memoryRoot, 'wiki');

function compareUpdatedDesc(a, b) {
  const aTime = a?.updatedAt || a?.completedAt || a?.createdAt || '';
  const bTime = b?.updatedAt || b?.completedAt || b?.createdAt || '';
  if (aTime !== bTime) return bTime.localeCompare(aTime);
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function latestById(items) {
  const map = new Map();
  for (const item of items) {
    if (item?.id) map.set(item.id, item);
  }
  return [...map.values()];
}

function normalizeTitle(item, fallbackPrefix) {
  return item.title || item.name || `${fallbackPrefix} ${item.id || ''}`.trim();
}

function countBy(items, field, fallback = 'unknown') {
  const counts = {};
  for (const item of items) {
    const key = item?.[field] || fallback;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function clampText(value, max = 160) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function statusTone(status) {
  if (['completed', 'done', 'verified', 'closed'].includes(status)) return 'good';
  if (['blocked', 'deferred', 'rejected', 'cancelled'].includes(status)) return 'bad';
  if (['active', 'in_progress', 'ready_for_agent', 'needs_review', 'needs_verification'].includes(status)) return 'live';
  return 'idle';
}

function computeProgress(taskCount, doneCount) {
  if (!taskCount) return 0;
  return Math.round((doneCount / taskCount) * 100);
}

function uniqueIds(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(list.filter(Boolean).map(value => (typeof value === 'object' ? value.id || value.path || JSON.stringify(value) : value)))];
}

async function countWikiPages() {
  let total = 0;
  async function walk(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      if (['README.md', 'index.md', 'log.md'].includes(entry.name)) continue;
      total += 1;
    }
  }
  try {
    await walk(wikiRoot);
  } catch {
    return 0;
  }
  return total;
}

function extractEvents(collection, entityType, limit = 30) {
  const events = [];
  for (const item of collection) {
    const title = normalizeTitle(item, entityType);
    const history = Array.isArray(item.history) ? item.history : [];
    for (const entry of history) {
      events.push({
        at: entry.at || item.updatedAt || item.createdAt,
        entityType,
        entityId: item.id,
        title,
        event: entry.event || 'updated',
        status: entry.status || item.status || 'unknown',
        note: clampText(entry.note || ''),
        commits: entry.commits || [],
      });
    }
    if (!history.length && (item.updatedAt || item.createdAt)) {
      events.push({
        at: item.updatedAt || item.createdAt,
        entityType,
        entityId: item.id,
        title,
        event: item.completedAt ? 'completed' : 'updated',
        status: item.status || 'unknown',
        note: '',
        commits: [],
      });
    }
  }
  return events
    .filter(event => event.at)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

function buildSprintCards(sprints, phases, tasks, issues, containers) {
  const phaseBySprint = new Map();
  for (const phase of phases) {
    if (!phase?.sprintId) continue;
    if (!phaseBySprint.has(phase.sprintId)) phaseBySprint.set(phase.sprintId, []);
    phaseBySprint.get(phase.sprintId).push(phase);
  }

  const taskByPhase = new Map();
  const taskBySprint = new Map();
  for (const task of tasks) {
    if (task?.phaseId) {
      if (!taskByPhase.has(task.phaseId)) taskByPhase.set(task.phaseId, []);
      taskByPhase.get(task.phaseId).push(task);
    }
    if (task?.sprintId) {
      if (!taskBySprint.has(task.sprintId)) taskBySprint.set(task.sprintId, []);
      taskBySprint.get(task.sprintId).push(task);
    }
  }

  const issueMap = new Map(issues.map(issue => [issue.id, issue]));
  const containerMap = new Map(containers.map(container => [container.id, container]));

  return [...sprints]
    .sort(compareUpdatedDesc)
    .map(sprint => {
      const sprintPhases = [...(phaseBySprint.get(sprint.id) || [])].sort((a, b) => {
        const aNum = Number(a.number || 0);
        const bNum = Number(b.number || 0);
        if (aNum && bNum && aNum !== bNum) return aNum - bNum;
        return normalizeTitle(a, 'Phase').localeCompare(normalizeTitle(b, 'Phase'));
      });
      const sprintTasks = taskBySprint.get(sprint.id) || [];
      const doneCount = sprintTasks.filter(task => task.status === 'done').length;
      const activeCount = sprintTasks.filter(task => task.status === 'in_progress').length;
      const blockedCount = sprintTasks.filter(task => task.status === 'blocked').length;

      return {
        id: sprint.id,
        title: normalizeTitle(sprint, 'Sprint'),
        description: clampText(sprint.description || sprint.goal || ''),
        goal: sprint.goal || '',
        status: sprint.status || 'unknown',
        tone: statusTone(sprint.status),
        updatedAt: sprint.updatedAt || sprint.createdAt || '',
        containerLabels: uniqueIds(sprint.containerIds).map(id => containerMap.get(id)?.title || id),
        issueSummaries: uniqueIds(sprint.issueIds).map(id => {
          const issue = issueMap.get(id);
          return {
            id,
            title: issue ? normalizeTitle(issue, 'Issue') : id,
            status: issue?.status || 'unknown',
            severity: issue?.severity || '',
          };
        }),
        progress: {
          taskCount: sprintTasks.length,
          phaseCount: sprintPhases.length,
          doneCount,
          activeCount,
          blockedCount,
          percent: computeProgress(sprintTasks.length, doneCount),
        },
        phases: sprintPhases.map(phase => {
          const phaseTasks = [...(taskByPhase.get(phase.id) || [])].sort(compareUpdatedDesc);
          const phaseDone = phaseTasks.filter(task => task.status === 'done').length;
          return {
            id: phase.id,
            title: normalizeTitle(phase, 'Phase'),
            number: phase.number || null,
            status: phase.status || 'unknown',
            tone: statusTone(phase.status),
            successGates: phase.successGates || [],
            progress: {
              taskCount: phaseTasks.length,
              doneCount: phaseDone,
              percent: computeProgress(phaseTasks.length, phaseDone),
            },
            tasks: phaseTasks.map(task => ({
              id: task.id,
              title: normalizeTitle(task, 'Task'),
              status: task.status || 'unknown',
              tone: statusTone(task.status),
              filesAffected: (task.filesAffected || []).length,
              issueIds: task.issueIds || [],
            })),
          };
        }),
      };
    });
}

function summarizeRawItems(rawItems) {
  const unresolved = rawItems.filter(item => item.status === 'unreconciled');
  return {
    total: rawItems.length,
    unresolved: unresolved.length,
    processed: rawItems.filter(item => item.status === 'processed').length,
    rejected: rawItems.filter(item => item.status === 'rejected').length,
    recent: unresolved
      .sort(compareUpdatedDesc)
      .slice(0, 8)
      .map(item => ({
        id: item.id,
        title: item.title || item.summary || item.id,
        sourceType: item.sourceType || 'other',
        updatedAt: item.updatedAt || item.createdAt || '',
      })),
  };
}

function summarizeDiscoveries(discoveries) {
  const promoted = discoveries.filter(item => item.status === 'promoted_to_issue').length;
  return {
    total: discoveries.length,
    promoted,
    pending: discoveries.filter(item => !['promoted_to_issue', 'duplicate', 'rejected', 'resolved_by_existing_code'].includes(item.status)).length,
    byStatus: countBy(discoveries, 'status'),
    recent: discoveries
      .sort(compareUpdatedDesc)
      .slice(0, 8)
      .map(item => ({
        id: item.id,
        title: normalizeTitle(item, 'Discovery'),
        status: item.status || 'unknown',
        recommendedAction: item.recommendedAction || '',
      })),
  };
}

function buildTaskCards(tasks, sprints, phases, issues) {
  const sprintMap = new Map(sprints.map(sprint => [sprint.id, sprint]));
  const phaseMap = new Map(phases.map(phase => [phase.id, phase]));
  const issueMap = new Map(issues.map(issue => [issue.id, issue]));

  return [...tasks]
    .sort(compareUpdatedDesc)
    .map(task => ({
      id: task.id,
      title: normalizeTitle(task, 'Task'),
      description: clampText(task.description || task.goal || ''),
      status: task.status || 'unknown',
      tone: statusTone(task.status),
      updatedAt: task.updatedAt || task.createdAt || '',
      sprintId: task.sprintId || '',
      sprintTitle: task.sprintId ? normalizeTitle(sprintMap.get(task.sprintId) || { id: task.sprintId }, 'Sprint') : '',
      phaseId: task.phaseId || '',
      phaseTitle: task.phaseId ? normalizeTitle(phaseMap.get(task.phaseId) || { id: task.phaseId }, 'Phase') : '',
      filesAffected: task.filesAffected || [],
      issueIds: task.issueIds || [],
      issueTitles: uniqueIds(task.issueIds).map(id => normalizeTitle(issueMap.get(id) || { id }, 'Issue')),
    }));
}

function featuredSprintRank(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active') return 0;
  if (value === 'paused') return 1;
  if (value === 'planned') return 2;
  return 3;
}

export async function buildDashboardData() {
  const [sprints, phases, tasks, issues, containers, discoveries, comments] = await Promise.all([
    listRecords(sprintRoot),
    listRecords(phaseRoot),
    listRecords(taskRoot),
    listRecords(issueRoot),
    listRecords(containerRoot),
    listRecords(discoveryRoot),
    listRecords(commentRoot),
  ]);

  const [rawItems, relationships, wikiPageCount, sprintSummaries, taskSummaries, searchIndex, searchHealth] = await Promise.all([
    readLatestIndex(rawIndex),
    readLatestIndex(relationshipIndex),
    countWikiPages(),
    readLatestIndex(sprintIndex),
    readLatestIndex(taskIndex),
    loadIndex(),
    searchStatus(),
  ]);

  const sprintCards = buildSprintCards(sprints, phases, tasks, issues, containers);
  const taskCards = buildTaskCards(tasks, sprints, phases, issues);
  const focusSprints = sprintCards
    .filter(card => ['planned', 'active', 'paused'].includes(card.status))
    .sort((a, b) => {
      const rankDiff = featuredSprintRank(a.status) - featuredSprintRank(b.status);
      if (rankDiff !== 0) return rankDiff;
      return compareUpdatedDesc(a, b);
    })
    .slice(0, 8);
  const recentlyUpdated = sprintCards.slice(0, 8);
  const recentActivity = extractEvents([...sprints, ...phases, ...tasks], 'memory_event', 40);

  const issueOpen = issues.filter(issue => !['closed', 'verified'].includes(issue.status));
  const issueBySeverity = countBy(issueOpen, 'severity');
  const issueByStatus = countBy(issues, 'status');
  const issueByType = countBy(issues, 'issueType');
  const containerByStatus = countBy(containers, 'status');

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      sprints: { total: sprints.length, active: sprintCards.filter(card => card.status === 'active').length, planned: sprintCards.filter(card => card.status === 'planned').length, completed: sprintCards.filter(card => card.status === 'completed').length },
      phases: { total: phases.length, completed: phases.filter(item => item.status === 'completed').length, active: phases.filter(item => item.status === 'active').length },
      tasks: { total: tasks.length, done: tasks.filter(item => item.status === 'done').length, blocked: tasks.filter(item => item.status === 'blocked').length, inProgress: tasks.filter(item => item.status === 'in_progress').length },
      issues: { total: issues.length, open: issueOpen.length, bySeverity: issueBySeverity, byStatus: issueByStatus, byType: issueByType },
      containers: { total: containers.length, byStatus: containerByStatus },
      discoveries: summarizeDiscoveries(discoveries),
      raw: summarizeRawItems(rawItems),
      comments: { total: comments.length },
      relationships: { total: relationships.length },
      wiki: { pages: wikiPageCount },
      search: {
        ready: searchHealth.ready,
        builtAt: searchHealth.builtAt,
        pages: searchHealth.pageCount,
        chunks: searchHealth.chunkCount,
        mode: searchHealth.mode,
        vectorDims: searchHealth.vectorDims,
        indexed: Boolean(searchIndex),
      },
    },
    focus: {
      sprints: sprintCards,
      featuredSprints: focusSprints,
      recentSprints: recentlyUpdated,
      recentActivity,
      tasks: taskCards,
    },
    indices: {
      sprintSummaryCount: sprintSummaries.length,
      taskSummaryCount: taskSummaries.length,
    },
    routes: listDashboardRoutes(),
  };
}
