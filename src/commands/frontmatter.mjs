import { readMarkdownPage, updateMarkdownFrontmatter } from '../core/frontmatter.mjs';
import { resolveMemoryPath } from '../core/safe-path.mjs';
import { memoryRoot } from '../core/paths.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const sub = argv[1] || 'get';
  const target = argv[2];
  if (!target) {
    console.log('Usage: mm frontmatter get <page> | mm frontmatter set <page> --key value');
    return;
  }

  const file = await resolveMemoryPath(memoryRoot, target, 'memory-read');
  if (sub === 'get') {
    const page = await readMarkdownPage(file);
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, frontmatter: page.frontmatter });
      return;
    }
    console.log(JSON.stringify(page.frontmatter, null, 2));
    return;
  }

  if (sub === 'set') {
    const patch = {};
    for (let i = 3; i < argv.length; i += 1) {
      const arg = argv[i];
      if (!arg.startsWith('--')) continue;
      const key = arg.replace(/^--/, '');
      patch[key] = argv[i + 1];
      i += 1;
    }
    const next = await updateMarkdownFrontmatter(file, patch);
    if (argv.includes('--json')) {
      writeJsonOutput({ ok: true, frontmatter: next });
      return;
    }
    console.log(`Updated frontmatter for ${target}`);
    return;
  }

  console.log(`Unknown frontmatter subcommand: ${sub}`);
}

