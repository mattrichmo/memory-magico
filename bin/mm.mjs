#!/usr/bin/env node
import { run } from '../src/commands/router.mjs';

const args = process.argv.slice(2);

run(args).catch(err => {
  console.error('mm error:', err.stack || err.message);
  process.exit(1);
});
