import { getTemplate, listTemplates } from '../core/templates.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const sub = argv[1] || 'list';
  const json = argv.includes('--json');

  if (sub === 'list') {
    const templates = listTemplates();
    if (json) {
      writeJsonOutput({ ok: true, templates });
      return;
    }
    templates.forEach(template => console.log(`${template.name} (${template.kind})`));
    return;
  }

  if (sub === 'show') {
    const name = argv[2];
    if (!name) {
      console.log('Usage: mm template show <name>');
      return;
    }
    const template = getTemplate(name);
    if (!template) {
      if (json) writeJsonOutput({ ok: false, error: { code: 'NOT_FOUND', message: `Unknown template: ${name}` } });
      else console.log(`Unknown template: ${name}`);
      process.exitCode = 2;
      return;
    }
    if (json) {
      writeJsonOutput({ ok: true, template: { name, ...template } });
      return;
    }
    console.log(template.body.trimEnd());
    return;
  }

  console.log('Usage: mm template <list|show>');
}
