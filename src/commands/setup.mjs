export async function run() {
  console.log('MemoryMagico setup');
  console.log('');
  console.log('Local invocation:');
  console.log('  ./mm <command>');
  console.log('  node ./bin/mm.mjs <command>');
  console.log('  npm run mm -- <command>');
  console.log('');
  console.log('Dashboard:');
  console.log('  ./mm dashboard build');
  console.log('  ./mm dashboard serve --no-open');
  console.log('  npm run dashboard');
  console.log('  npm run dashboard:build');
  console.log('  npm run dashboard:serve');
  console.log('');
  console.log('Global invocation after linking:');
  console.log('  npm link');
  console.log('  mm <command>');
}
