import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { safeJsonParse } from './CodeLoader.js';

export interface RemoteConfig {
  url: string;
  apiKey?: string;
  createdAt?: string;
}

export interface ConfigDefaults {
  workflowsDir?: string;
  outputFormat?: 'json' | 'pretty';
}

export interface LightConfig {
  defaultRemote?: string;
  remotes: Record<string, RemoteConfig>;
  defaults: ConfigDefaults;
}

const DEFAULT_CONFIG: LightConfig = {
  remotes: {},
  defaults: { workflowsDir: './workflows', outputFormat: 'json' },
};

export function getConfigPath(): string {
  return join(homedir(), '.light', 'config.json');
}

export function loadConfig(): LightConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return { ...DEFAULT_CONFIG, remotes: {}, defaults: { ...DEFAULT_CONFIG.defaults } };
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = safeJsonParse(raw) as Partial<LightConfig>;
    return {
      defaultRemote: parsed.defaultRemote,
      remotes: parsed.remotes ?? {},
      defaults: { ...DEFAULT_CONFIG.defaults, ...(parsed.defaults ?? {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG, remotes: {}, defaults: { ...DEFAULT_CONFIG.defaults } };
  }
}

export function saveConfig(config: LightConfig): void {
  const path = getConfigPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2));
  if (platform() !== 'win32') {
    try {
      chmodSync(path, 0o600);
    } catch {
      // best-effort
    }
  }
}

export function getRemote(name?: string): { name: string; remote: RemoteConfig } | null {
  const config = loadConfig();
  const target = name ?? config.defaultRemote;
  if (!target) return null;
  const remote = config.remotes[target];
  if (!remote) return null;
  return { name: target, remote };
}

export function setRemote(name: string, remote: RemoteConfig): void {
  const config = loadConfig();
  config.remotes[name] = { ...remote, createdAt: remote.createdAt ?? new Date().toISOString() };
  if (!config.defaultRemote) config.defaultRemote = name;
  saveConfig(config);
}

export function setDefaultRemote(name: string): void {
  const config = loadConfig();
  if (!config.remotes[name]) throw new Error(`Unknown remote: ${name}`);
  config.defaultRemote = name;
  saveConfig(config);
}

export function removeRemote(name: string): boolean {
  const config = loadConfig();
  if (!config.remotes[name]) return false;
  delete config.remotes[name];
  if (config.defaultRemote === name) {
    const next = Object.keys(config.remotes)[0];
    config.defaultRemote = next;
  }
  saveConfig(config);
  return true;
}

export function listRemotes(): Record<string, RemoteConfig> {
  return loadConfig().remotes;
}

/**
 * Resolve the remote to use for a given workflow directory.
 * Priority:
 *   1. `.light-remote` file inside the workflow dir (contains a remote profile name)
 *   2. Global default remote
 */
export function resolveWorkflowRemote(workflowDir: string): { name: string; remote: RemoteConfig } | null {
  const overrideFile = join(workflowDir, '.light-remote');
  if (existsSync(overrideFile)) {
    const name = readFileSync(overrideFile, 'utf-8').trim();
    if (name) {
      const found = getRemote(name);
      if (found) return found;
    }
  }
  return getRemote();
}
