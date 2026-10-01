// Cross-platform postinstall.
// On macOS/Linux, node-pty's prebuilt `spawn-helper` sometimes loses its
// execute bit when extracted, causing "posix_spawnp failed". We re-apply +x.
// On Windows there is no spawn-helper (node-pty uses ConPTY) → no-op.

import { chmodSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

if (process.platform === 'win32') {
  process.exit(0);
}

const prebuilds = join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds');

try {
  if (!existsSync(prebuilds)) process.exit(0);
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper');
    if (existsSync(helper)) {
      chmodSync(helper, 0o755);
    }
  }
} catch {
  // best-effort: never fail the install over this
}
