import type { Command } from './utils.js';
import { wantsHelp } from './utils.js';

export const doctor: Command = {
  desc: 'Check environment and light-run connectivity',
  usage: 'light doctor',
  async run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light doctor

Checks Node.js version, LIGHT_RUN_URL, and pings the light-run service.`);
      return;
    }

    console.log('Checking environment...\n');

    let allPassed = true;

    console.log(`  [ok] Node.js: ${process.version}`);

    const url = process.env.LIGHT_RUN_URL;
    if (!url) {
      console.log('  [fail] LIGHT_RUN_URL: not set');
      console.log('\n[fail] Set LIGHT_RUN_URL=http://localhost:3001 to point to your light-run instance.');
      process.exit(1);
    }
    console.log(`  [ok] LIGHT_RUN_URL: ${url}`);

    const token = process.env.LIGHT_RUN_TOKEN;
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`${url}/health`, { headers });
      if (res.ok) {
        console.log(`  [ok] light-run /health: ${res.status}`);
      } else {
        console.log(`  [fail] light-run /health: ${res.status}`);
        allPassed = false;
      }
    } catch (err) {
      console.log(`  [fail] light-run unreachable: ${(err as Error).message}`);
      allPassed = false;
    }

    console.log(allPassed ? '\n[ok] Ready' : '\n[fail] light-run is not reachable');
    if (!allPassed) process.exit(1);
  },
};
