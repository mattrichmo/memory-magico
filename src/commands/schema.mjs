import path from 'path';
import fs from 'fs/promises';
import { toolRoot } from '../core/paths.mjs';
import { validateAgainstSchema } from '../core/validation.mjs';
import { resolveContainedPath } from '../core/safe-path.mjs';

function getSchemasDir() {
  return path.join(toolRoot, 'schemas');
}

export async function run(argv) {
  const sub = argv[1] || 'list';
  const schemaName = argv[2];
  const schemasDir = getSchemasDir();

  if (sub === 'list') {
    try {
      const items = await fs.readdir(schemasDir);
      if (items.length === 0) console.log('No schemas found in', schemasDir);
      else items.forEach(i => console.log(i));
    } catch {
      console.log('No schemas directory found at', schemasDir);
    }
    return;
  }

  if (sub === 'show') {
    if (!schemaName) {
      console.log('Usage: mm schema show <schema-file>');
      return;
    }
    const schemaPath = await resolveContainedPath(schemasDir, schemaName, 'repo-read');
    try {
      const txt = await fs.readFile(schemaPath, 'utf8');
      console.log(txt);
    } catch {
      console.log('Schema not found:', schemaName);
    }
    return;
  }

  if (sub === 'validate') {
    if (!schemaName) {
      console.log('Usage: mm schema validate <schema-file> [data-file]');
      return;
    }
    const schemaPath = await resolveContainedPath(schemasDir, schemaName, 'repo-read');
    try {
      const schemaText = await fs.readFile(schemaPath, 'utf8');
      const schema = JSON.parse(schemaText);
      if (argv[3]) {
        const dataPath = path.isAbsolute(argv[3]) ? argv[3] : path.join(process.cwd(), argv[3]);
        const dataText = await fs.readFile(dataPath, 'utf8');
        const data = JSON.parse(dataText);
        const errors = validateAgainstSchema(schema, data);
        if (errors.length === 0) {
          console.log('Validation passed.');
        } else {
          errors.forEach(error => console.log('ERROR:', error));
          process.exitCode = 1;
        }
      } else {
        console.log('Schema is valid JSON:', schemaName);
      }
    } catch (err) {
      console.log('Validation failed:', err.message);
      process.exitCode = 1;
    }
    return;
  }

  console.log('Unknown schema subcommand:', sub);
}
