import { v4 as uuidv4 } from 'uuid';
import { type LoadOptions, loadDirectory } from '../CodeLoader.js';
import { DEFAULT_WORKDIR } from '../defaults.js';
import { type CodeLanguage, getAllHelpers, getHelper, OUTPUT_FILE } from '../helpers.js';
import type { IOSchema } from '../schema.js';

export interface CodeFiles {
  [path: string]: string;
}

export type NodeType = 'docker' | 'human';

export interface NodeJSON {
  id: string;
  name: string;
  type: NodeType;
  inputs: IOSchema | null;
  outputs: IOSchema | null;
  files: CodeFiles;
  image: string | null;
  /** Shell commands executed before the entrypoint (e.g. 'pip install numpy') */
  setup: string[];
  entrypoint: string | null;
  workdir: string;
  /** Timeout in ms - 0 means no timeout */
  timeout: number;
  /** Docker network name - null uses default, 'none' isolates the container */
  network: string | null;
}

export interface NodeConfig {
  name: string;
  id?: string;
  type?: NodeType;
  image?: string | null;
  files?: Record<string, string>;
  setup?: string[];
  entrypoint?: string | null;
  workdir?: string;
  timeout?: number;
  network?: string | null;
  inputs?: import('../schema.js').IOSchema | null;
  outputs?: import('../schema.js').IOSchema | null;
}

export class Node implements NodeJSON {
  public readonly id: string;
  public name: string;
  public type: NodeType;
  public inputs: IOSchema | null;
  public outputs: IOSchema | null;
  public files: CodeFiles;
  public image: string | null;
  public setup: string[];
  public entrypoint: string | null;
  public workdir: string;
  public timeout: number;
  public network: string | null;

  constructor(config: NodeConfig) {
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.type = config.type ?? 'docker';
    this.inputs = config.inputs ?? null;
    this.outputs = config.outputs ?? null;
    this.files = config.files || {};
    this.image = config.image ?? null;
    this.setup = config.setup || [];
    this.entrypoint = config.entrypoint ?? null;
    this.workdir = config.workdir || DEFAULT_WORKDIR;
    this.timeout = config.timeout ?? 0; // 0 = no timeout
    this.network = config.network ?? null;
  }

  addFiles(files: CodeFiles): this {
    Object.assign(this.files, files);
    return this;
  }

  addFolder(folderPath: string, entrypoint: string, options?: LoadOptions): this {
    const files = loadDirectory(folderPath, options);
    this.addFiles(files);
    this.entrypoint = entrypoint;
    return this;
  }

  /** Set code from a JS function. Closures/external vars won't be available at runtime. */
  setCode(fn: Function): this {
    if (typeof fn !== 'function') {
      throw new Error('setCode expects a function');
    }

    const fnStr = Function.prototype.toString.call(fn);

    if (/\{\s*\[native code\]\s*\}/.test(fnStr)) {
      throw new Error('setCode: native or bound functions cannot be serialized');
    }

    const code = `const { writeFileSync } = require('fs');
let __data = '';
process.stdin.on('data', chunk => __data += chunk);
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(__data || '{}');
    const __fn = ${fnStr};
    const __out = await __fn(input);
    if (__out !== undefined) writeFileSync(${JSON.stringify(OUTPUT_FILE)}, JSON.stringify(__out));
  } catch (err) {
    process.stderr.write(err?.stack ?? String(err));
    process.exitCode = 1;
  }
});`;

    this.files['index.js'] = code;
    if (!this.entrypoint) {
      this.entrypoint = `node index.js`;
    }
    return this;
  }

  /** Add language helper (provides `input` and `send`). No arg = all helpers. */
  addHelper(language?: CodeLanguage): this {
    if (language) {
      const helper = getHelper(language);
      this.files[helper.filename] = helper.content;
    } else {
      for (const helper of getAllHelpers()) {
        this.files[helper.filename] = helper.content;
      }
    }
    return this;
  }

  toJSON(): NodeJSON {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      inputs: this.inputs,
      outputs: this.outputs,
      files: this.files,
      image: this.image,
      setup: this.setup,
      entrypoint: this.entrypoint,
      workdir: this.workdir,
      timeout: this.timeout,
      network: this.network,
    };
  }

  static fromJSON(json: NodeJSON): Node {
    return new Node(json);
  }
}
