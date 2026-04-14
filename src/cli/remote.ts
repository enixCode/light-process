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
    const marker = name === cfg.defaultRemote ? '*' : ' ';
    console.log(`${marker} ${name.padEnd(20)} ${remotes[name].url}`);
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
  light remote                              List configured remote profiles
  light remote bind <url> [options]         Register a new remote, or overwrite an existing one
  light remote set-key <key> [options]      Update the API key on an existing remote (keeps url)
  light remote use <name>                   Change the default remote
  light remote forget <name>                Delete a remote from local config
  light remote ping [options]               Ping the current remote (health check)
  light remote ls [options]                 List workflows on the remote
  light remote run <id> [options]           Run a workflow on the remote
  light remote delete <id> [options]        Delete a workflow from the remote (alias: rm)

Options by subcommand:

  bind <url>
    --key <key>           API key for this remote (skip if the remote has no auth)
    --name <name>         Profile name to create or overwrite (default: "default")

  set-key <key>
    <key>                 The new API key (first positional argument)
    --name <name>         Which profile to update (default: the current default remote)

  ping | ls | run | delete
    --remote <name>       Target a specific remote instead of the default

  ls | run
    --json                Output raw JSON instead of the pretty-printed format

  run <id>
    --input <json>        Inline JSON input, e.g. '{"x": 1}'
    --input-file <path>   Read input from a file

  delete <id>
    --soft                Soft delete (keeps the file on disk, marks as deleted)
    --yes, -y             Skip the confirmation prompt

Common questions:

  How do I add or change the API key on a remote I already bound?
    light remote set-key <newkey>                  # updates the default remote
    light remote set-key <newkey> --name test      # updates the 'test' remote
    # Alternative: 'bind' overwrites by name (requires re-typing the url)
    light remote bind <url> --key <newkey> --name default

  How do I check if my key is correct?
    light remote ls         # 401 if the key is wrong, list of workflows if ok

  Where is my config stored?
    ~/.light/config.json    # JSON file, safe to edit by hand

Examples:
  light remote bind https://my-server.com --key abc123
  light remote set-key newkey123
  light remote set-key newkey123 --name test
  light remote use test
  light remote ls
  light remote run my-workflow --input '{"key": "value"}'
  light remote delete old-workflow --yes`);
      return;
    }

    const action = getPositional(0);
    const nameFlag = getFlagValue('--name');
    const remoteOverride = getFlagValue('--remote');

    // No action: list remote profiles (like `git remote`)
    if (!action) {
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
