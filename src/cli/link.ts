import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeJsonParse } from '../CodeLoader.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag, wantsHelp } from './utils.js';

interface LinkJson {
  id?: string;
  name?: string;
  from: string;
  to: string;
  when?: Record<string, unknown>;
  data?: Record<string, unknown>;
  maxIterations?: number;
}

interface WorkflowMeta {
  id: string;
  name: string;
  network?: string | null;
  nodes: { id: string; name: string; dir: string }[];
  links: LinkJson[];
}

function loadMeta(dir: string): { path: string; meta: WorkflowMeta } {
  const path = join(dir, 'workflow.json');
  if (!existsSync(path)) {
    console.error(`Not a workflow folder: ${dir}`);
    process.exit(1);
  }
  const meta = safeJsonParse(readFileSync(path, 'utf-8')) as WorkflowMeta;
  meta.links = meta.links ?? [];
  return { path, meta };
}

function saveMeta(path: string, meta: WorkflowMeta): void {
  writeFileSync(path, JSON.stringify(meta, null, 2));
}

function openInEditor(filePath: string): void {
  const editor = process.env.EDITOR || process.env.VISUAL || (process.platform === 'win32' ? 'notepad' : 'vi');
  const result = spawnSync(editor, [filePath], { stdio: 'inherit' });
  if (result.error) {
    console.error(`Failed to open editor (${editor}): ${result.error.message}`);
    process.exit(1);
  }
}

const HELP = `Usage:
  light link <dir>                                    Open workflow.json in $EDITOR
  light link <dir> --list                             List links
  light link <dir> --from <id> --to <id> [options]    Add a link
  light link <dir> --edit <link-id> [options]          Edit a link (only given fields change)
  light link <dir> --remove <link-id>                 Remove a link
  light link <dir> --open                             Open workflow.json in $EDITOR

Options (for --from/--to and --edit):
  --when <json>           Condition - when to follow the link
  --data <json>           Static data to inject
  --max-iterations <n>    Limit for back-links (cycles)

Link structure in workflow.json:
  "links": [
    {
      "id": "a-b-1",          // unique id
      "from": "node-a",       // source node id
      "to": "node-b",         // target node id
      "when": { ... },        // optional condition (see below)
      "data": { ... },        // optional static data
      "maxIterations": 5      // required for back-links (cycles)
    }
  ]

Condition operators (--when):
  Equality:     {"field": "value"}          or  {"field": {"eq": "value"}}
  Comparison:   {"field": {"gt": 5}}        gt, gte, lt, lte
  Not equal:    {"field": {"ne": "bad"}}
  In list:      {"field": {"in": [1, 2]}}
  Exists:       {"field": {"exists": true}}
  Regex:        {"field": {"regex": "^ok"}}
  AND:          {"a": "x", "b": "y"}        (all top-level fields must match)
  OR:           {"or": [{"a": "x"}, {"b": "y"}]}

Examples:
  light link my-workflow --list
  light link my-workflow --from node-a --to node-b
  light link my-workflow --from a --to b --when '{"status": "ok"}'
  light link my-workflow --from a --to b --when '{"count": {"gt": 5}}' --max-iterations 10
  light link my-workflow --edit a-b-1 --when '{"status": {"ne": "error"}}'
  light link my-workflow --edit a-b-1 --data '{"retry": true}'
  light link my-workflow --remove a-b-1
  light link my-workflow                     # opens in $EDITOR`;

export const link: Command = {
  desc: 'Manage links in a workflow folder',
  usage: 'light link <dir> [--list | --from/--to | --edit <id> | --remove <id> | --open]',
  async run() {
    if (wantsHelp()) {
      console.log(HELP);
      return;
    }

    const dir = getPositional(0) || '.';

    if (hasFlag('--list')) {
      const { meta } = loadMeta(dir);
      if (meta.links.length === 0) {
        console.log('No links.');
        return;
      }
      for (const l of meta.links) {
        const cond = l.when ? ` when ${JSON.stringify(l.when)}` : '';
        const data = l.data ? ` data ${JSON.stringify(l.data)}` : '';
        const iter = l.maxIterations ? ` max ${l.maxIterations}` : '';
        console.log(`${l.id ?? '?'}  ${l.from} -> ${l.to}${cond}${data}${iter}`);
      }
      return;
    }

    const removeId = getFlagValue('--remove');
    if (removeId) {
      const { path, meta } = loadMeta(dir);
      const before = meta.links.length;
      meta.links = meta.links.filter((l) => l.id !== removeId);
      if (meta.links.length === before) {
        console.error(`Link not found: ${removeId}`);
        process.exit(1);
      }
      saveMeta(path, meta);
      console.log(`Removed ${removeId}`);
      return;
    }

    const editId = getFlagValue('--edit');
    if (editId) {
      const { path, meta } = loadMeta(dir);
      const link = meta.links.find((l) => l.id === editId);
      if (!link) {
        console.error(`Link not found: ${editId}`);
        process.exit(1);
      }
      const from = getFlagValue('--from');
      if (from) link.from = from;
      const to = getFlagValue('--to');
      if (to) link.to = to;
      const whenStr = getFlagValue('--when');
      if (whenStr) link.when = JSON.parse(whenStr);
      const dataStr = getFlagValue('--data');
      if (dataStr) link.data = JSON.parse(dataStr);
      const maxIter = getFlagValue('--max-iterations');
      if (maxIter) link.maxIterations = parseInt(maxIter, 10);
      saveMeta(path, meta);
      console.log(`Updated ${editId}`);
      return;
    }

    const from = getFlagValue('--from');
    const to = getFlagValue('--to');
    if (from && to) {
      const { path, meta } = loadMeta(dir);
      const link: LinkJson = { from, to };
      const whenStr = getFlagValue('--when');
      if (whenStr) link.when = JSON.parse(whenStr);
      const dataStr = getFlagValue('--data');
      if (dataStr) link.data = JSON.parse(dataStr);
      const maxIter = getFlagValue('--max-iterations');
      if (maxIter) link.maxIterations = parseInt(maxIter, 10);
      link.id = `${from}-${to}-${meta.links.length + 1}`;
      meta.links.push(link);
      saveMeta(path, meta);
      console.log(`Added ${link.id}`);
      return;
    }

    // Default: open in editor
    const { path } = loadMeta(dir);
    openInEditor(path);
  },
};
