import { getConfigPath, loadConfig, saveConfig } from '../config.js';
import type { Command } from './utils.js';
import { getPositional, wantsHelp } from './utils.js';

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const p of parts) {
    if (current && typeof current === 'object' && p in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return current;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof current[p] !== 'object' || current[p] === null) current[p] = {};
    current = current[p] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

export const config: Command = {
  desc: 'Manage global config (~/.light/config.json)',
  usage: 'light config <get|set|list|path> [key] [value]',
  run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light config <get|set|list|path> [key] [value]

Manage global config (~/.light/config.json).

Subcommands:
  list, show   Show full config
  path         Show config file path
  get <key>    Get a config value (dot notation)
  set <key> <value>  Set a config value (JSON or string)

Examples:
  light config list
  light config get defaultRemote
  light config set defaultRemote my-server`);
      return;
    }

    const action = getPositional(0);
    if (!action || action === 'list' || action === 'show') {
      const cfg = loadConfig();
      console.log(JSON.stringify(cfg, null, 2));
      return;
    }
    if (action === 'path') {
      console.log(getConfigPath());
      return;
    }
    if (action === 'get') {
      const key = getPositional(1);
      if (!key) {
        console.error('Usage: light config get <key>');
        process.exit(1);
      }
      const cfg = loadConfig();
      const val = getByPath(cfg, key);
      console.log(val === undefined ? '' : typeof val === 'string' ? val : JSON.stringify(val, null, 2));
      return;
    }
    if (action === 'set') {
      const key = getPositional(1);
      const value = getPositional(2);
      if (!key || value === undefined) {
        console.error('Usage: light config set <key> <value>');
        process.exit(1);
      }
      const cfg = loadConfig() as unknown as Record<string, unknown>;
      let parsed: unknown = value;
      try {
        parsed = JSON.parse(value);
      } catch {
        // keep as string
      }
      setByPath(cfg, key, parsed);
      saveConfig(cfg as never);
      console.log(`Set ${key} = ${JSON.stringify(parsed)}`);
      return;
    }
    console.error(`Unknown action: ${action}`);
    process.exit(1);
  },
};
