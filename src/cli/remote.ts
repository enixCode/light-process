import { existsSync, readFileSync } from 'node:fs';
import {
  getRemote,
  listRemotes,
  loadConfig,
  removeRemote,
  setDefaultRemote,
  setRemote,
  setRemoteKey,
} from '../config.js';
import { deleteWorkflow, listWorkflows, ping, sendMessage, type WorkflowSummary } from '../remoteClient.js';
import type { Command } from './utils.js';
import { confirm, getFlagValue, getPositional, hasFlag, wantsHelp } from './utils.js';

function resolveRemoteOrFail(nameOverride?: string) {
  const r = getRemote(nameOverride);
  if (!r) {
    console.error('No remote configured. Run: light remote bind <url> --key <key>');
    process.exit(1);
  }
  return r;
}

function printRemotes(): void {
  const remotes = listRemotes();
  const cfg = loadConfig();
  const names = Object.keys(remotes);
  if (names.length === 0) {
    console.log('No remotes. Bind one with: light remote bind <url> --key <key>');
    return;
  }
  if (hasFlag('--json')) {
    console.log(JSON.stringify({ default: cfg.defaultRemote, remotes }, null, 2));
    return;
  }
  for (const name of names) {
    const r = remotes[name];
    const marker = name === cfg.defaultRemote ? '*' : ' ';
    const key = r.apiKey ? `${r.apiKey.slice(0, 4)}...` : '(none)';
    console.log(`${marker} ${name.padEnd(20)} ${r.url}  [key: ${key}]`);
  }
}

function printWorkflows(list: WorkflowSummary[]): void {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  if (list.length === 0) {
    console.log('No workflows on remote.');
    return;
  }
  for (const wf of list) {
    const nodes = `${wf.nodeCount} node${wf.nodeCount !== 1 ? 's' : ''}`;
    const links = `${wf.linkCount} link${wf.linkCount !== 1 ? 's' : ''}`;
    console.log(`  ${wf.id.padEnd(24)} ${wf.name.padEnd(30)} ${nodes}, ${links}`);
  }
}

export const remote: Command = {
  desc: 'Manage remote light-process servers',
  usage: 'light remote <bind|set-key|use|forget|ping|ls|run|delete|rm> [...]',
  async run() {
    if (wantsHelp()) {
      console.log(`Manage remote light-process servers.

Usage:
  light remote                                                  List configured remote profiles
  light remote bind <url> [--key <key>] [--name <name>]         Register or overwrite a remote
  light remote set-key <key> [--name <name>]                    Update API key on a remote
  light remote use <name>                                       Change the default remote
  light remote forget <name>                                    Delete a remote from local config
  light remote ping [--remote <name>]                           Ping the current remote
  light remote ls [--remote <name>] [--json]                    List workflows on the remote
  light remote run <id> [--input <json> | --input-file <path>] [--remote <name>] [--json]
                                                                Run a workflow on the remote
  light remote delete <id> [--soft] [--yes] [--remote <name>]   Delete a workflow (alias: rm)

Defaults (used when flag is omitted):
  --name <name>     "default" on bind, current default remote on set-key
  --remote <name>   current default remote (marked with * in 'light remote')
  --input           {} (empty object) for run
  --json            off (pretty-printed output)

Config file: ~/.light/config.json`);
      return;
    }

    const action = getPositional(0);
    const nameFlag = getFlagValue('--name');
    const remoteOverride = getFlagValue('--remote');

    // No action (or `list`): list remote profiles (like `git remote`)
    if (!action || action === 'list') {
      printRemotes();
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

    if (action === 'set-key') {
      const key = getPositional(1);
      if (!key) {
        console.error('Usage: light remote set-key <key> [--name <name>]');
        process.exit(1);
      }
      const name = nameFlag ?? loadConfig().defaultRemote;
      if (!name) {
        console.error('No remote configured. Run: light remote bind <url> --key <key>');
        process.exit(1);
      }
      try {
        setRemoteKey(name, key);
        console.log(`Updated key on remote "${name}"`);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
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

    // ls = list workflows on the current remote (the common case)
    if (action === 'ls') {
      const r = resolveRemoteOrFail(remoteOverride);
      const list = await listWorkflows(r.remote);
      if (!hasFlag('--json')) console.log(`Remote: ${r.name} (${r.remote.url})`);
      printWorkflows(list);
      return;
    }

    if (action === 'run') {
      const id = getPositional(1);
      if (!id) {
        console.error('Usage: light remote run <id> [--input <json> | --input-file <path>] [--json]');
        process.exit(1);
      }
      const r = resolveRemoteOrFail(remoteOverride);
      let input: unknown = {};
      const inputStr = getFlagValue('--input');
      const inputFile = getFlagValue('--input-file');
      if (inputStr) input = JSON.parse(inputStr);
      else if (inputFile) {
        if (!existsSync(inputFile)) {
          console.error(`Input file not found: ${inputFile}`);
          process.exit(1);
        }
        input = JSON.parse(readFileSync(inputFile, 'utf-8'));
      }
      const result = await sendMessage(r.remote, id, input);
      // Default: pretty-printed JSON. `--json` gives compact raw JSON.
      console.log(JSON.stringify(result, null, hasFlag('--json') ? 0 : 2));
      return;
    }

    if (action === 'delete' || action === 'rm') {
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
      console.log(`Deleted "${res.id}" from ${r.name}${res.unpersisted ? ' (and removed from disk)' : ''}`);
      return;
    }

    console.error(`Unknown remote action: ${action}`);
    process.exit(1);
  },
};
