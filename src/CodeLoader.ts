import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { DEFAULT_IGNORE, DEFAULT_WORKDIR } from './defaults.js';
import { Workflow } from './Workflow.js';

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Strips __proto__ and constructor keys to prevent prototype pollution */
export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (key, value) => {
    if (key === '__proto__' || key === 'constructor') return undefined;
    return value;
  });
}

/** Prevents path traversal - checks resolved path stays within baseDir */
export function isPathSafe(filePath: string, baseDir: string): boolean {
  const resolved = resolve(baseDir, filePath);
  const safeBase = resolve(baseDir);
  return resolved.startsWith(safeBase + sep) || resolved === safeBase;
}

export interface LoadOptions {
  /** e.g. ['.ts', '.js'] - null means all files */
  extensions?: string[] | null;
  /** Patterns to skip. Default: ['node_modules', '.git', '__pycache__', '.env'] */
  ignore?: string[];
}

/** Recursively load files into a flat { relativePath: content } record */
export function loadDirectory(dirPath: string, options: LoadOptions = {}): Record<string, string> {
  const { extensions = null, ignore = DEFAULT_IGNORE } = options;

  const files: Record<string, string> = {};

  const walk = (dir: string): void => {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      if (ignore.some((pattern) => entry.includes(pattern))) {
        continue;
      }

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        if (extensions && !extensions.some((ext) => entry.endsWith(ext))) {
          continue;
        }
        const relativePath = relative(dirPath, fullPath).replace(/\\/g, '/');
        files[relativePath] = readFileSync(fullPath, 'utf-8');
      }
    }
  };

  walk(dirPath);
  return files;
}

/** Load from exported folder (workflow.json + node folders). Returns null if invalid. */
export function loadWorkflowFromFolder(dir: string): Workflow | null {
  const metaPath = join(dir, 'workflow.json');
  if (!existsSync(metaPath)) return null;

  const meta = safeJsonParse(readFileSync(metaPath, 'utf-8')) as Record<string, any>;
  if (!meta.nodes || !meta.name) return null;

  const nodes = [];
  for (const nodeRef of meta.nodes) {
    const nodeDir = join(dir, nodeRef.dir);
    if (!existsSync(nodeDir)) return null;

    const nodeMetaPath = join(nodeDir, '.node.json');
    if (!existsSync(nodeMetaPath)) return null;

    const nodeMeta = safeJsonParse(readFileSync(nodeMetaPath, 'utf-8')) as Record<string, any>;
    const files = loadDirectory(nodeDir, { ignore: ['.node.json'] });

    nodes.push({
      id: nodeMeta.id,
      name: nodeMeta.name,
      type: nodeMeta.type ?? 'docker',
      inputs: nodeMeta.inputs ?? null,
      outputs: nodeMeta.outputs ?? null,
      files,
      image: nodeMeta.image ?? null,
      setup: nodeMeta.setup ?? [],
      entrypoint: nodeMeta.entrypoint ?? null,
      workdir: DEFAULT_WORKDIR,
      timeout: nodeMeta.timeout ?? 0,
      network: nodeMeta.network ?? null,
      env: nodeMeta.env ?? [],
    });
  }

  return Workflow.fromJSON({
    id: meta.id,
    name: meta.name,
    network: meta.network ?? null,
    nodes,
    links: meta.links ?? [],
  });
}

export function exportWorkflowToFolder(workflow: Workflow, dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });

  for (const node of workflow.nodes.values()) {
    const nodeName = slugify(node.name);
    const nodeDir = join(dir, nodeName);
    if (!existsSync(nodeDir)) mkdirSync(nodeDir, { recursive: true });

    for (const [filename, content] of Object.entries(node.files)) {
      if (!isPathSafe(filename, nodeDir)) {
        throw new Error(`Path traversal detected in node "${node.name}": ${filename}`);
      }
      const filePath = resolve(nodeDir, filename);
      const fileDir = join(nodeDir, filename.split('/').slice(0, -1).join('/'));
      if (fileDir !== nodeDir && !existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
      writeFileSync(filePath, content);
    }

    writeFileSync(
      join(nodeDir, '.node.json'),
      JSON.stringify(
        {
          id: node.id,
          name: node.name,
          image: node.image,
          setup: node.setup,
          entrypoint: node.entrypoint,
          timeout: node.timeout,
          network: node.network,
          inputs: node.inputs,
          outputs: node.outputs,
          env: node.env && node.env.length > 0 ? node.env : undefined,
        },
        null,
        2,
      ),
    );
  }

  writeFileSync(
    join(dir, 'workflow.json'),
    JSON.stringify(
      {
        id: workflow.id,
        name: workflow.name,
        network: workflow.network,
        nodes: Array.from(workflow.nodes.values()).map((n) => ({
          id: n.id,
          name: n.name,
          dir: slugify(n.name),
        })),
        links: Array.from(workflow.links.values()).map((l) => l.toJSON()),
      },
      null,
      2,
    ),
  );
}
