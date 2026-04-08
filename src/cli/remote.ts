import { readFileSync } from 'node:fs';
import {
  getRemote,
  listRemotes,
  loadConfig,
  removeRemote,
  saveConfig,
  setDefaultRemote,
  setRemote,
} from '../config.js';
import { deleteWorkflow, listWorkflows, ping, sendMessage } from '../remoteClient.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag } from './utils.js';

function resolveRemoteOrFail(nameOverride?: string) {
  const r = getRemote(nameOverride);
  if (!r) {
    console.error('No remote configured. Run: light remote bind <url> --key <key>');
    process.exit(1);
  }
  return r;
}

async function confirm(msg: string): Promise<boolean> {
  if (hasFlag('--yes') || hasFlag('-y')) return true;
  process.stdout.write(`${msg} (y/N) `);
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', (data) => {
      const ans = String(data).trim().toLowerCase();
      resolve(ans === 'y' || ans === 'yes');
      process.stdin.pause();
    });
  });
}

export const remote: Command = {
  desc: 'Manage remote light-process servers',
  usage: 'light remote <bind|list|use|forget|ping|run|delete> [...]',
  async run() {
    const action = getPositional(0);
    const nameFlag = getFlagValue('--name');
    const remoteOverride = getFlagValue('--remote');

    if (!action || action === 'list' || action === 'ls') {
      const remotes = listRemotes();
      const cfg = loadConfig();
      const names = Object.keys(remotes);
      if (names.length === 0) {
        console.log('No remotes. Bind one with: light remote bind <url> --key <key>');
        return;
      }
      for (const name of names) {
        const marker = name === cfg.defaultRemote ? '*' : ' ';
        console.log(`${marker} ${name.padEnd(20)} ${remotes[name].url}`);
      }
      return;
    }

    if (action === 'bind') {
      const url = getPositional(1);
      if (!url) {
        console.error('Usage: light remote bind <url> --key <key> [--name <name>]');
        process.exit(1);
      }
      const apiKey = getFlagValue('--key');
      const name = nameFlag ?? 'default';
      setRemote(name, { url, apiKey });
      console.log(`Bound remote "${name}" -> ${url}`);
      const cfg = loadConfig();
      if (cfg.defaultRemote === name) console.log(`Set as default remote.`);
      return;
    }

    if (action === 'use') {
      const name = getPositional(1);
      if (!name) {
        console.error('Usage: light remote use <name>');
        process.exit(1);
      }
      setDefaultRemote(name);
      console.log(`Default remote: ${name}`);
      return;
    }

    if (action === 'forget') {
      const name = getPositional(1);
      if (!name) {
        console.error('Usage: light remote forget <name>');
        process.exit(1);
      }
      const ok = removeRemote(name);
      console.log(ok ? `Removed remote "${name}"` : `No such remote: ${name}`);
      return;
    }

    if (action === 'ping') {
      const r = resolveRemoteOrFail(remoteOverride);
      try {
        const res = await ping(r.remote);
        console.log(`${r.name} (${r.remote.url}): ${res.status}`);
      } catch (err) {
        console.error(`${r.name}: ${(err as Error).message}`);
        process.exit(1);
      }
      return;
    }

    if (action === 'ls-workflows') {
      const r = resolveRemoteOrFail(remoteOverride);
      const list = await listWorkflows(r.remote);
      if (hasFlag('--pretty')) {
        for (const wf of list) console.log(`${wf.id.padEnd(24)} ${wf.name}  (${wf.nodeCount} nodes)`);
      } else {
        console.log(JSON.stringify(list, null, hasFlag('--pretty') ? 2 : 0));
      }
      return;
    }

    if (action === 'run') {
      const id = getPositional(1);
      if (!id) {
        console.error('Usage: light remote run <id> --input <json> | --input-file <path>');
        process.exit(1);
      }
      const r = resolveRemoteOrFail(remoteOverride);
      let input: unknown = {};
      const inputStr = getFlagValue('--input');
      const inputFile = getFlagValue('--input-file');
      if (inputStr) input = JSON.parse(inputStr);
      else if (inputFile) input = JSON.parse(readFileSync(inputFile, 'utf-8'));
      const result = await sendMessage(r.remote, id, input);
      console.log(JSON.stringify(result, null, hasFlag('--pretty') ? 2 : 0));
      return;
    }

    if (action === 'delete' || action === 'rm-workflow') {
      const id = getPositional(1);
      if (!id) {
        console.error('Usage: light remote delete <id> [--soft] [--yes]');
        process.exit(1);
      }
      const r = resolveRemoteOrFail(remoteOverride);
      const soft = hasFlag('--soft');
      const ok = await confirm(`Delete workflow "${id}" from ${r.name}${soft ? ' (soft)' : ''}?`);
      if (!ok) {
        console.log('Cancelled.');
        return;
      }
      const res = await deleteWorkflow(r.remote, id, !soft);
      console.log(JSON.stringify(res));
      return;
    }

    console.error(`Unknown remote action: ${action}`);
    process.exit(1);
  },
};

// Silence unused warning
void saveConfig;
