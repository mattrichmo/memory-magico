import fs from 'fs/promises';
import path from 'path';
import { memoryRoot } from '../core/paths.mjs';
import { mkdirp, readDirRecursive } from '../core/fs.mjs';
import { uniqueMarkdownPath, slugify } from '../core/slugs.mjs';
import { readMarkdownPage, updateMarkdownFrontmatter, writeMarkdownPage, parseMarkdownPage } from '../core/frontmatter.mjs';
import { rebuildIndex, loadIndex } from '../core/retrieval.mjs';
import { resolveMemoryPath } from '../core/safe-path.mjs';
import { assertSafePathSegment } from '../core/safe-path.mjs';
import { withLock } from '../core/lock.mjs';
import { scanMarkdownPages } from '../core/pages.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';
import { ENUMS, assertEnum } from '../core/guards.mjs';

const wikiRoot = path.join(memoryRoot, 'wiki');
const WIKI_KIND_DIRS = {
  note: wikiRoot,
  concept: path.join(wikiRoot, 'concepts'),
  decision: path.join(wikiRoot, 'decisions'),
  system: path.join(wikiRoot, 'systems'),
  project: path.join(wikiRoot, 'projects'),
  process: path.join(wikiRoot, 'processes'),
  source: path.join(wikiRoot, 'sources'),
  synthesis: path.join(wikiRoot, 'synthesis'),
};

function pageFrontmatter(title, kind = 'note', status = 'draft') {
  return {
    id: `${kind}_${slugify(title)}`,
    kind,
    title,
    status,
    aliases: [],
    tags: [],
    sourceRefs: [],
    related: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function bodyTemplate(kind, title) {
  if (kind === 'source') return `# ${title}\n\n## Summary\n\n## Evidence\n\n## Open Questions\n`;
  if (kind === 'concept') return `# ${title}\n\n## Current Truth\n\n## Notes\n\n## Open Questions\n`;
  if (kind === 'decision') return `# ${title}\n\n## Context\n\n## Decision\n\n## Consequences\n`;
  if (kind === 'system') return `# ${title}\n\n## Contract\n\n## Flow\n\n## Open Questions\n`;
  if (kind === 'project') return `# ${title}\n\n## Goal\n\n## Scope\n\n## Status\n`;
  if (kind === 'process') return `# ${title}\n\n## Steps\n\n## Guardrails\n`;
  if (kind === 'synthesis') return `# ${title}\n\n## Synthesis\n\n## Sources\n`;
  return `# ${title}\n\n## Notes\n`;
}

async function ensureWikiRoot() {
  await mkdirp(wikiRoot);
}

function allWikiFiles() {
  return readDirRecursive(wikiRoot, { filter: filePath => filePath.endsWith('.md') });
}

async function findWikiPage(target) {
  if (!target) return null;
  const direct = target.endsWith('.md') ? await resolveMemoryPath(memoryRoot, target, 'memory-read') : null;
  if (direct) {
    try {
      await fs.access(direct);
      return direct;
    } catch {
      // fall through
    }
  }
  const slug = slugify(target.replace(/\.md$/, ''));
  const files = await allWikiFiles();
  for (const file of files) {
    if (path.basename(file, '.md') === slug) return file;
  }
  return null;
}

async function appendLog(line) {
  const logFile = path.join(wikiRoot, 'log.md');
  try {
    await fs.appendFile(logFile, `${line}\n`, 'utf8');
  } catch {
    await writeMarkdownPage(logFile, {
      id: 'wiki_log',
      kind: 'note',
      title: 'Memory Log',
      status: 'draft',
      aliases: [],
      tags: [],
      sourceRefs: [],
      related: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paths: { self: path.relative(memoryRoot, logFile).split(path.sep).join('/') },
    }, line);
  }
}

export async function run(argv) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');
  await ensureWikiRoot();

  if (sub === 'create') {
    return withLock('workspace-write', async () => {
      const optionStart = argv.slice(2).findIndex(arg => arg.startsWith('--'));
      const title = (optionStart === -1 ? argv.slice(2) : argv.slice(2, 2 + optionStart)).join(' ').trim();
      const kindIndex = argv.indexOf('--kind');
      const kind = kindIndex !== -1 ? argv[kindIndex + 1] : 'note';
      const statusIndex = argv.indexOf('--status');
      const status = statusIndex !== -1 ? argv[statusIndex + 1] : 'draft';
      if (!title) {
        console.log('Usage: mm wiki create <title> [--kind concept|decision|system|project|process|source|synthesis|note] [--status draft|active|stable|deprecated|archived]');
        return;
      }
      if (!Object.hasOwn(WIKI_KIND_DIRS, kind)) {
        console.log('Unknown wiki kind:', kind);
        return;
      }
      assertEnum(status, ENUMS.wikiStatus, 'wiki status');
      assertSafePathSegment(kind, 'wiki kind');
      const file = await uniqueMarkdownPath(WIKI_KIND_DIRS[kind], title);
      const frontmatter = pageFrontmatter(title, kind, status);
      frontmatter.paths = {
        self: path.relative(memoryRoot, file).split(path.sep).join('/'),
      };
      await writeMarkdownPage(file, frontmatter, bodyTemplate(kind, title));
      await appendLog(`## [${new Date().toISOString()}] wiki | Created ${title}\n`);
      await rebuildIndex();
      if (json) {
        writeJsonOutput({
          ok: true,
          page: {
            path: path.relative(memoryRoot, file),
            frontmatter,
            body: bodyTemplate(kind, title),
          },
        });
        return;
      }
      console.log(`Created wiki page: ${path.relative(memoryRoot, file)}`);
    }, { command: 'mm wiki create' });
  }

  if (sub === 'list') {
    const files = await allWikiFiles();
    if (json) {
      writeJsonOutput({ ok: true, files: files.map(file => path.relative(memoryRoot, file)) });
      return;
    }
    if (!files.length) {
      console.log('No wiki pages found.');
      return;
    }
    files.forEach(file => console.log(path.relative(memoryRoot, file)));
    return;
  }

  if (sub === 'manifest') {
    const pages = await scanMarkdownPages([path.join(memoryRoot, 'wiki')]);
    const manifest = pages.map(page => ({
      id: page.id,
      kind: page.kind,
      title: page.title,
      path: page.path,
      summary: (page.body || '').split('\n').find(line => line.trim() && !line.startsWith('#')) || '',
      aliases: page.aliases,
      tags: page.tags,
      sourceRefs: page.sourceRefs,
      updatedAt: page.updatedAt,
    }));
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, pages: manifest });
      return;
    }
    manifest.forEach(page => console.log(`${page.kind} ${page.title} (${page.path})`));
    return;
  }

  if (sub === 'orphans') {
    const index = await loadIndex();
    const wikiPages = (index?.pages || []).filter(page => String(page.path || '').startsWith('wiki/'));
    const orphans = wikiPages.filter(page => !(page.links || []).length && !(page.sourceRefs || []).length && !['index.md', 'log.md', 'overview.md', 'open-questions.md'].includes(path.basename(page.path)));
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, pages: orphans });
      return;
    }
    if (!orphans.length) {
      console.log('No orphan wiki pages found.');
      return;
    }
    orphans.forEach(page => console.log(`${page.title} (${page.path})`));
    return;
  }

  if (sub === 'show' || sub === 'view') {
    const target = argv[2];
    if (!target) {
      console.log('Usage: mm wiki show <page>');
      return;
    }
    const file = await findWikiPage(target);
    if (!file) {
      console.log('Wiki page not found:', target);
      return;
    }
    if (json) {
      const page = await readMarkdownPage(file);
      writeJsonOutput({
        ok: true,
        page: {
          path: path.relative(memoryRoot, file),
          frontmatter: page.frontmatter,
          body: page.body,
        },
      });
      return;
    }
    console.log(await fs.readFile(file, 'utf8'));
    return;
  }

  if (sub === 'update-frontmatter') {
    return withLock('workspace-write', async () => {
      const target = argv[2];
      const file = await findWikiPage(target);
      if (!file) {
        console.log('Wiki page not found:', target);
        return;
      }
      const titleIndex = argv.indexOf('--title');
      const statusIndex = argv.indexOf('--status');
      const tagIndex = argv.indexOf('--tag');
      const patch = {};
      if (titleIndex !== -1) patch.title = argv[titleIndex + 1];
      if (statusIndex !== -1) {
        assertEnum(argv[statusIndex + 1], ENUMS.wikiStatus, 'wiki status');
        patch.status = argv[statusIndex + 1];
      }
      if (tagIndex !== -1) patch.tags = [argv[tagIndex + 1]];
      await updateMarkdownFrontmatter(file, patch);
      await rebuildIndex();
      if (json) {
        const page = await readMarkdownPage(file);
        writeJsonOutput({
          ok: true,
          page: {
            path: path.relative(memoryRoot, file),
            frontmatter: page.frontmatter,
            body: page.body,
          },
        });
        return;
      }
      console.log(`Updated wiki page: ${target}`);
    }, { command: 'mm wiki update-frontmatter' });
  }

  if (sub === 'link') {
    return withLock('workspace-write', async () => {
      const from = argv[2];
      const to = argv[3];
      if (!from || !to) {
        console.log('Usage: mm wiki link <from> <to>');
        return;
      }
      const fromFile = await findWikiPage(from);
      if (!fromFile) {
        console.log('Wiki page not found:', from);
        return;
      }
      const page = await readMarkdownPage(fromFile);
      const nextBody = `${page.body.trimEnd()}\n\n[[${to}]]\n`;
      await writeMarkdownPage(fromFile, page.frontmatter, nextBody);
      await appendLog(`## [${new Date().toISOString()}] wiki | Linked ${from} -> ${to}\n`);
      await rebuildIndex();
      if (json) {
        writeJsonOutput({
          ok: true,
          page: {
            path: path.relative(memoryRoot, fromFile),
            frontmatter: page.frontmatter,
            body: nextBody,
          },
        });
        return;
      }
      console.log(`Linked ${from} -> ${to}`);
    }, { command: 'mm wiki link' });
  }

  if (sub === 'backlinks') {
    const target = argv[2];
    const targetFile = await findWikiPage(target);
    const targetSlug = targetFile ? path.basename(targetFile, '.md') : slugify(target);
    const index = await loadIndex();
    if (!index) {
      console.log('No index found. Run `mm index rebuild`.');
      return;
    }
    const matches = index.pages.filter(page => page.links?.some(link => slugify(link).includes(targetSlug) || String(link).toLowerCase().includes(String(target).toLowerCase())) || page.sourceRefs?.some(ref => String(ref).toLowerCase().includes(String(target).toLowerCase())));
    if (json) {
      writeJsonOutput({ ok: true, pages: matches });
      return;
    }
    if (!matches.length) {
      console.log('No backlinks found.');
      return;
    }
    matches.forEach(page => console.log(`${page.title} (${page.path})`));
    return;
  }

  console.log('Unknown wiki subcommand:', sub);
}
