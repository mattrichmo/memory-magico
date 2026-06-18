import { spawnSync } from 'child_process';
import { buildDashboardData } from '../src/core/dashboard-data.mjs';

function run(args) {
  const result = spawnSync('node', ['./bin/mm.mjs', ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Command failed: mm ${args.join(' ')}`);
  }
}

run(['doctor']);
run(['index', 'status']);
run(['graph', 'rebuild']);
run(['claim', 'list']);
run(['search', 'sentinel radar']);
run(['resolve', 'sentinel radar']);

const dashboard = await buildDashboardData();
if (!dashboard?.summary?.search?.ready) {
  throw new Error('Dashboard payload missing search health.');
}
