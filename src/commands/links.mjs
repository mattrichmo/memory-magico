import { graphLinks } from '../core/graph-queries.mjs';
import { writeJsonOutput } from '../core/renderers.mjs';

export async function run(argv = []) {
  const id = argv[1];
  const json = argv.includes('--json');
  if (!id || id.startsWith('--')) {
    console.log('Usage: mm links <id>');
    return;
  }
  const edges = await graphLinks(id);
  if (json) {
    writeJsonOutput({ ok: true, id, edges });
    return;
  }
  if (!edges.length) {
    console.log(`No outgoing links found for ${id}.`);
    return;
  }
  edges.forEach(edge => console.log(`${edge.id} ${edge.from?.id} -[${edge.type}]-> ${edge.to?.id}`));
}
