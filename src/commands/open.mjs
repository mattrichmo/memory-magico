import fs from 'node:fs/promises';
import path from 'node:path';
import { memoryRoot } from '../core/paths.mjs';
import { findEntityRecord } from '../core/entities.mjs';
import { scanMarkdownPages } from '../core/pages.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

async function resolveOpenTarget(id) {
  const record = await findEntityRecord(id);
  if (record) {
    return {
      kind: record.kind || 'unknown',
      id: record.id,
      title: record.title || record.id,
      status: record.status || 'unknown',
      path: record.paths?.self || record.path || null,
      body: record.bodyMarkdown || record.summary || record.description || '',
      record,
    };
  }

  const pages = await scanMarkdownPages([path.join(memoryRoot, 'wiki')]);
  const page = pages.find(entry => entry.id === id || entry.slug === id || entry.path === id || path.basename(entry.path, '.md') === id);
  if (page) {
    return {
      kind: 'wiki_page',
      id: page.id,
      title: page.title,
      status: page.status || 'draft',
      path: page.path,
      body: page.body || '',
      record: page,
    };
  }

  return null;
}

export async function run(argv = []) {
  const id = argv[1];
  const json = argv.includes('--json');
  if (!id || id.startsWith('--')) {
    console.log('Usage: mm open <id>');
    return;
  }
  const entity = await resolveOpenTarget(id);
  if (!entity) {
    if (json) writeJsonOutput({ ok: false, error: { code: 'NOT_FOUND', message: `No entity found for ${id}.` } });
    else console.log(`No entity found for ${id}.`);
    process.exitCode = 2;
    return;
  }
  const relPath = entity.path ? String(entity.path) : '';
  if (json) {
    writeJsonOutput({ ok: true, entity });
    return;
  }
  console.log(`${entity.kind} ${entity.id}`);
  console.log(entity.title);
  if (relPath) console.log(`Path: ${relPath}`);
  if (entity.body) {
    console.log('');
    console.log(entity.body.trimEnd());
  }
}
