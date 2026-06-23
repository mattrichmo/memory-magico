import { run as helpRun } from '../commands/help.mjs';
import { run as commandsRun } from '../commands/commands.mjs';
import { run as infoRun } from '../commands/info.mjs';
import { run as setupRun } from '../commands/setup.mjs';
import { run as doctorRun } from '../commands/doctor.mjs';
import { run as statusRun } from '../commands/status.mjs';
import { run as safeRun } from '../commands/safe.mjs';
import { run as auditRun } from '../commands/audit.mjs';
import { run as lintRun } from '../commands/lint.mjs';
import { run as schemaRun } from '../commands/schema.mjs';
import { run as addRun } from '../commands/add.mjs';
import { run as captureRun } from '../commands/capture.mjs';
import { run as installRun } from '../commands/install.mjs';
import { run as updateRun } from '../commands/update.mjs';
import { run as dashboardRun } from '../commands/dashboard.mjs';
import { run as openRun } from '../commands/open.mjs';
import { run as backlinksRun } from '../commands/backlinks.mjs';
import { run as linksRun } from '../commands/links.mjs';
import { run as templateRun } from '../commands/template.mjs';
import { run as tagsRun } from '../commands/tags.mjs';
import { run as gitRun } from '../commands/git.mjs';
import { run as initRun } from '../commands/init.mjs';
import { run as indexRun } from '../commands/index.mjs';
import { run as resolveRun } from '../commands/resolve.mjs';
import { run as ingestRun } from '../commands/ingest.mjs';
import { run as claimRun } from '../commands/claim.mjs';
import { run as rawRun } from '../commands/raw.mjs';
import { run as containerRun } from '../commands/container.mjs';
import { run as initiativeRun } from '../commands/initiative.mjs';
import { run as issueRun } from '../commands/issue.mjs';
import { run as discoveryRun } from '../commands/discovery.mjs';
import { run as commentRun } from '../commands/comment.mjs';
import { run as wikiRun } from '../commands/wiki.mjs';
import { run as graphRun } from '../commands/graph.mjs';
import { run as sprintRun } from '../commands/sprint.mjs';
import { run as phaseRun } from '../commands/phase.mjs';
import { run as taskRun } from '../commands/task.mjs';
import { run as nextRun } from '../commands/next.mjs';
import { run as contextRun } from '../commands/context.mjs';
import { run as searchRun } from '../commands/search.mjs';
import { run as readRun } from '../commands/read.mjs';
import { run as frontmatterRun } from '../commands/frontmatter.mjs';
import { run as resultsRun } from '../commands/results.mjs';
import { run as imageRun } from '../commands/image.mjs';
import { run as ledgerRun } from '../commands/ledger.mjs';
import { run as lockRun } from '../commands/lock.mjs';
import { run as snapshotRun } from '../commands/snapshot.mjs';
import { run as repairRun } from '../commands/repair.mjs';
import { run as fsckRun } from '../commands/fsck.mjs';
import { run as migrateRun } from '../commands/migrate.mjs';

export const COMMAND_HANDLERS = {
  help: helpRun,
  commands: commandsRun,
  info: infoRun,
  setup: setupRun,
  status: statusRun,
  safe: safeRun,
  audit: auditRun,
  doctor: doctorRun,
  lint: lintRun,
  schema: schemaRun,
  add: addRun,
  capture: captureRun,
  install: installRun,
  update: updateRun,
  dashboard: dashboardRun,
  open: openRun,
  backlinks: backlinksRun,
  links: linksRun,
  template: templateRun,
  tags: tagsRun,
  git: gitRun,
  init: initRun,
  index: indexRun,
  resolve: resolveRun,
  ingest: ingestRun,
  claim: claimRun,
  raw: rawRun,
  container: containerRun,
  initiative: initiativeRun,
  issue: issueRun,
  discovery: discoveryRun,
  comment: commentRun,
  wiki: wikiRun,
  graph: graphRun,
  sprint: sprintRun,
  phase: phaseRun,
  task: taskRun,
  next: nextRun,
  context: contextRun,
  search: searchRun,
  read: readRun,
  frontmatter: frontmatterRun,
  results: resultsRun,
  image: imageRun,
  ledger: ledgerRun,
  lock: lockRun,
  snapshot: snapshotRun,
  repair: repairRun,
  fsck: fsckRun,
  migrate: migrateRun,
};
