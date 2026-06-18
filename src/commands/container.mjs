import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { makeId, slugify } from '../core/ids.mjs';
import { readJsonFile, writeJsonFile } from '../core/json.mjs';
import { findRecordById, listRecordsWithIndexFallback, upsertIndexRecord } from '../core/records.mjs';
import { parseArgs, splitList } from '../core/cli.mjs';
import { assertSafePathSegment } from '../core/safe-path.mjs';

const indexFile = path.join(memoryRoot, 'work', 'containers', 'index.jsonl');
const containerRoot = path.join(memoryRoot, 'work', 'containers');

function toIndexRecord(item) {
  return {
    id: item.id,
    kind: 'container',
    title: item.title,
    status: item.status,
    domain: item.domain,
    path: item.paths?.self,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

export async function run(argv) {
  const sub = argv[1] || 'list';
  if (sub === 'create') {
    const opts = parseArgs(argv, 2);
    const title = opts._.join(' ').trim();
    if (!title) {
      console.log('Usage: mm container create <title> [--description "..."] [--domain <domain>] [--category <category>] [--status <status>] [--close-policy <policy>] [--tags tag1,tag2]');
      return;
    }
    const now = new Date().toISOString();
    const domain = opts.domain || slugify(title).replace(/^container-/, '') || 'general';
    const id = opts.id || `container_${domain}`;
    assertSafePathSegment(id, 'container id');
    const item = {
      id,
      kind: 'container',
      title,
      description: opts.description || title,
      domain,
      category: opts.category || '',
      status: opts.status || 'active',
      closePolicy: opts['close-policy'] || 'long_lived',
      tags: splitList(opts.tags),
      owner: opts.owner || '',
      paths: {},
      createdAt: now,
      updatedAt: now
    };
    await writeJsonFile(path.join(containerRoot, `${id}.json`), item);
    await upsertIndexRecord(indexFile, item, toIndexRecord);
    console.log('Created container:', id);
    return;
  }

  if (sub === 'list') {
    const items = await listRecordsWithIndexFallback(containerRoot, indexFile, item => item.kind === 'container');
    if (!items.length) {
      console.log('No containers found.');
      return;
    }
    items.forEach(item => console.log(`${item.id} [${item.status}] ${item.title}`));
    return;
  }

  if (sub === 'show') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm container show <id>');
      return;
    }
    try {
      const item = await findRecordById(containerRoot, indexFile, id);
      if (!item) throw new Error('not found');
      console.log(JSON.stringify(item, null, 2));
    } catch {
      console.log('Container not found:', id);
    }
    return;
  }

  if (sub === 'update') {
    const id = argv[2];
    const status = argv[3];
    if (!id || !status) {
      console.log('Usage: mm container update <id> <status>');
      return;
    }
    const file = path.join(containerRoot, `${id}.json`);
    try {
      const item = await readJsonFile(file);
      item.status = status;
      item.updatedAt = new Date().toISOString();
      await writeJsonFile(file, item);
      await upsertIndexRecord(indexFile, item, toIndexRecord);
      console.log('Updated container:', id);
    } catch {
      console.log('Container not found:', id);
    }
    return;
  }

  if (sub === 'archive') {
    const id = argv[2];
    if (!id) {
      console.log('Usage: mm container archive <id>');
      return;
    }
    const file = path.join(containerRoot, `${id}.json`);
    try {
      const item = await readJsonFile(file);
      item.status = 'archived';
      item.updatedAt = new Date().toISOString();
      await writeJsonFile(file, item);
      await upsertIndexRecord(indexFile, item, toIndexRecord);
      console.log('Archived container:', id);
    } catch {
      console.log('Container not found:', id);
    }
    return;
  }

  console.log('Unknown container subcommand:', sub);
}
