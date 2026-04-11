import { spawnSync } from 'node:child_process';
import type { Command } from './utils.js';
import { wantsHelp } from './utils.js';

export const doctor: Command = {
  desc: 'Check environment and dependencies',
  usage: 'light doctor',
  run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light doctor

Checks environment and dependencies (Node.js, Docker, GPU support).`);
      return;
    }

    console.log('Checking environment...\n');

    const checks = [
      { name: 'Node.js', check: () => process.version, required: true },
      {
        name: 'Docker',
        check: () => {
          const r = spawnSync('docker', ['--version'], { encoding: 'utf-8' });
          return r.status === 0 ? r.stdout.trim().split('\n')[0] : null;
        },
        required: true,
      },
      {
        name: 'Docker daemon',
        check: () => {
          const r = spawnSync('docker', ['info'], { encoding: 'utf-8', stdio: 'pipe' });
          return r.status === 0 ? 'running' : null;
        },
        required: true,
      },
      {
        name: 'gVisor (runsc)',
        check: () => {
          const r = spawnSync('docker', ['info', '--format', '{{.Runtimes}}'], { encoding: 'utf-8' });
          return r.stdout?.includes('runsc') ? 'available' : null;
        },
        required: false,
      },
      {
        name: 'GPU (nvidia-smi)',
        check: () => {
          const r = spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
            encoding: 'utf-8',
            stdio: 'pipe',
          });
          return r.status === 0 ? r.stdout.trim().split('\n')[0] : null;
        },
        required: false,
      },
      {
        name: 'Docker GPU',
        check: () => {
          const r = spawnSync('docker', ['info'], { encoding: 'utf-8', stdio: 'pipe' });
          if (r.stdout?.includes('nvidia')) return 'available';
          const test = spawnSync('docker', ['run', '--rm', '--gpus', 'all', 'hello-world'], {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 10000,
          });
          return test.status === 0 ? 'available' : null;
        },
        required: false,
      },
    ];

    let allPassed = true;
    for (const { name, check, required } of checks) {
      try {
        const result = check();
        if (result) {
          console.log(`  [ok] ${name}: ${result}`);
        } else {
          console.log(`  ${required ? '[fail]' : '-'} ${name}: not found`);
          if (required) allPassed = false;
        }
      } catch {
        console.log(`  ${required ? '[fail]' : '-'} ${name}: error`);
        if (required) allPassed = false;
      }
    }

    console.log(allPassed ? '\n[ok] Ready' : '\n[fail] Some required dependencies are missing');
    if (!allPassed) process.exit(1);
  },
};
