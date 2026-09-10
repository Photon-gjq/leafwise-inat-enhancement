import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, files, targets } from './build.mjs';

function run(args, env = {}) {
  const result = spawnSync(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', ...args], {
    cwd: root, stdio: 'inherit', env: { ...process.env, ...env }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const target of targets) {
  console.log(`\nTesting ${target}`);
  for (const file of files(path.join(root, 'build', target)).filter(file => file.endsWith('.js'))) run(['--check', file]);
  run(['--test', 'tests/higher-taxa.test.cjs', 'tests/uploader-ai.test.cjs', 'tests/build.test.cjs', 'tests/explore-tools.test.cjs'], { LEAFWISE_TARGET: target });
}
