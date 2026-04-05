import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import {
  exportWorkflowToFolder,
  isPathSafe,
  loadDirectory,
  loadWorkflowFromFolder,
  safeJsonParse,
  slugify,
} from '../../dist/CodeLoader.js';
import { Workflow } from '../../dist/Workflow.js';

describe('slugify()', () => {
  it('lowercases the string', () => {
    assert.equal(slugify('Hello World'), 'hello-world');
  });

  it('replaces spaces with dashes', () => {
    assert.equal(slugify('my node name'), 'my-node-name');
  });

  it('replaces multiple spaces with a single dash', () => {
    assert.equal(slugify('a   b'), 'a-b');
  });

  it('handles already lowercase no-space string', () => {
    assert.equal(slugify('simple'), 'simple');
  });

  it('handles empty string', () => {
    assert.equal(slugify(''), '');
  });
});

describe('safeJsonParse()', () => {
  it('parses valid JSON', () => {
    const result = safeJsonParse('{"name": "test", "value": 42}');
    assert.deepEqual(result, { name: 'test', value: 42 });
  });

  it('strips __proto__ keys', () => {
    const json = '{"__proto__": {"admin": true}, "name": "safe"}';
    const result = safeJsonParse(json);
    assert.equal(result.__proto__.admin, undefined);
    assert.equal(result.name, 'safe');
  });

  it('strips constructor keys', () => {
    const json = '{"constructor": "evil", "name": "safe"}';
    const result = safeJsonParse(json);
    // constructor should be stripped (returns undefined from reviver)
    assert.equal(result.name, 'safe');
    // The parsed object's own "constructor" property should not be "evil"
    assert.notEqual(result.constructor, 'evil');
  });

  it('throws on invalid JSON', () => {
    assert.throws(() => safeJsonParse('not json'), SyntaxError);
  });

  it('parses arrays', () => {
    const result = safeJsonParse('[1, 2, 3]');
    assert.deepEqual(result, [1, 2, 3]);
  });
});

describe('isPathSafe()', () => {
  it('allows safe relative paths', () => {
    assert.equal(isPathSafe('index.js', '/app'), true);
    assert.equal(isPathSafe('sub/file.js', '/app'), true);
  });

  it('rejects path traversal with ..', () => {
    assert.equal(isPathSafe('../etc/passwd', '/app'), false);
    assert.equal(isPathSafe('sub/../../etc/passwd', '/app'), false);
  });

  it('allows the base dir itself', () => {
    assert.equal(isPathSafe('.', '/app'), true);
  });

  it('rejects absolute paths outside base', () => {
    assert.equal(isPathSafe('/etc/passwd', '/app'), false);
  });
});

describe('loadDirectory()', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = join(tmpdir(), `lp-loaddir-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, 'sub'), { recursive: true });
    mkdirSync(join(tempDir, 'node_modules'), { recursive: true });
    writeFileSync(join(tempDir, 'index.js'), 'console.log("hello")');
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');
    writeFileSync(join(tempDir, 'sub', 'util.js'), 'exports.x = 1');
    writeFileSync(join(tempDir, 'node_modules', 'dep.js'), 'nope');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads files recursively with relative paths', () => {
    const files = loadDirectory(tempDir);
    assert.ok(files['index.js']);
    assert.ok(files['readme.md']);
    assert.ok(files['sub/util.js']);
  });

  it('ignores node_modules by default', () => {
    const files = loadDirectory(tempDir);
    assert.equal(files['node_modules/dep.js'], undefined);
  });

  it('respects custom ignore patterns', () => {
    const files = loadDirectory(tempDir, { ignore: ['sub'] });
    assert.ok(files['index.js']);
    assert.equal(files['sub/util.js'], undefined);
    // node_modules not in custom ignore, so it should be included
    assert.ok(files['node_modules/dep.js']);
  });

  it('filters by extension', () => {
    const files = loadDirectory(tempDir, { extensions: ['.js'] });
    assert.ok(files['index.js']);
    assert.ok(files['sub/util.js']);
    assert.equal(files['readme.md'], undefined);
  });

  it('returns all files when extensions is null', () => {
    const files = loadDirectory(tempDir, { extensions: null });
    assert.ok(files['index.js']);
    assert.ok(files['readme.md']);
  });

  it('returns empty object for empty directory', () => {
    const emptyDir = join(tmpdir(), `lp-empty-${randomUUID()}`);
    mkdirSync(emptyDir, { recursive: true });
    const files = loadDirectory(emptyDir);
    assert.deepEqual(files, {});
    rmSync(emptyDir, { recursive: true, force: true });
  });
});

describe('loadWorkflowFromFolder()', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = join(tmpdir(), `lp-wf-load-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null if workflow.json is missing', () => {
    assert.equal(loadWorkflowFromFolder(tempDir), null);
  });

  it('returns null if workflow.json has no name', () => {
    writeFileSync(
      join(tempDir, 'workflow.json'),
      JSON.stringify({
        id: 'wf-1',
        nodes: [{ id: 'n1', name: 'Node1', dir: 'node1' }],
        links: [],
      }),
    );
    assert.equal(loadWorkflowFromFolder(tempDir), null);
  });

  it('returns null if workflow.json has no nodes', () => {
    writeFileSync(
      join(tempDir, 'workflow.json'),
      JSON.stringify({
        id: 'wf-1',
        name: 'Test',
        links: [],
      }),
    );
    assert.equal(loadWorkflowFromFolder(tempDir), null);
  });

  it('returns null if node directory is missing', () => {
    writeFileSync(
      join(tempDir, 'workflow.json'),
      JSON.stringify({
        id: 'wf-1',
        name: 'Test',
        nodes: [{ id: 'n1', name: 'Node1', dir: 'node1' }],
        links: [],
      }),
    );
    assert.equal(loadWorkflowFromFolder(tempDir), null);
  });

  it('returns null if .node.json is missing', () => {
    const nodeDir = join(tempDir, 'node1');
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(
      join(tempDir, 'workflow.json'),
      JSON.stringify({
        id: 'wf-1',
        name: 'Test',
        nodes: [{ id: 'n1', name: 'Node1', dir: 'node1' }],
        links: [],
      }),
    );
    assert.equal(loadWorkflowFromFolder(tempDir), null);
  });

  it('loads a valid workflow from folder', () => {
    const nodeDir = join(tempDir, 'node1');
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(
      join(nodeDir, '.node.json'),
      JSON.stringify({
        id: 'n1',
        name: 'Node1',
        image: 'node:20',
        entrypoint: 'node index.js',
        setup: [],
        timeout: 0,
        network: null,
        inputs: null,
        outputs: null,
      }),
    );
    writeFileSync(join(nodeDir, 'index.js'), 'console.log("hi")');

    writeFileSync(
      join(tempDir, 'workflow.json'),
      JSON.stringify({
        id: 'wf-1',
        name: 'Test Workflow',
        network: null,
        nodes: [{ id: 'n1', name: 'Node1', dir: 'node1' }],
        links: [],
      }),
    );

    const wf = loadWorkflowFromFolder(tempDir);
    assert.ok(wf instanceof Workflow);
    assert.equal(wf.id, 'wf-1');
    assert.equal(wf.name, 'Test Workflow');
    assert.equal(wf.nodes.size, 1);
    const node = wf.getNode('n1');
    assert.ok(node);
    assert.equal(node.name, 'Node1');
    assert.equal(node.files['index.js'], 'console.log("hi")');
  });
});

describe('exportWorkflowToFolder()', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = join(tmpdir(), `lp-wf-export-${randomUUID()}`);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates correct folder structure', () => {
    const wf = new Workflow({ name: 'Export Test', id: 'wf-exp' });
    const node = wf.addNode({
      name: 'My Node',
      id: 'n1',
      image: 'node:20',
      entrypoint: 'node index.js',
    });
    node.addFiles({ 'index.js': 'console.log("exported")' });

    exportWorkflowToFolder(wf, tempDir);

    // Check workflow.json
    assert.ok(existsSync(join(tempDir, 'workflow.json')));
    const meta = JSON.parse(readFileSync(join(tempDir, 'workflow.json'), 'utf-8'));
    assert.equal(meta.id, 'wf-exp');
    assert.equal(meta.name, 'Export Test');
    assert.equal(meta.nodes.length, 1);
    assert.equal(meta.nodes[0].dir, 'my-node');

    // Check node directory and files
    const nodeDir = join(tempDir, 'my-node');
    assert.ok(existsSync(nodeDir));
    assert.equal(readFileSync(join(nodeDir, 'index.js'), 'utf-8'), 'console.log("exported")');

    // Check .node.json
    const nodeMeta = JSON.parse(readFileSync(join(nodeDir, '.node.json'), 'utf-8'));
    assert.equal(nodeMeta.id, 'n1');
    assert.equal(nodeMeta.name, 'My Node');
    assert.equal(nodeMeta.image, 'node:20');
    assert.equal(nodeMeta.entrypoint, 'node index.js');
  });

  it('overwrites existing directory', () => {
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, 'old-file.txt'), 'old');

    const wf = new Workflow({ name: 'Overwrite', id: 'wf-ow' });
    wf.addNode({ name: 'N', id: 'n1' });
    exportWorkflowToFolder(wf, tempDir);

    assert.ok(!existsSync(join(tempDir, 'old-file.txt')));
    assert.ok(existsSync(join(tempDir, 'workflow.json')));
  });

  it('creates subdirectories for nested file paths', () => {
    const wf = new Workflow({ name: 'Nested', id: 'wf-nest' });
    const node = wf.addNode({ name: 'Sub', id: 'n1' });
    node.addFiles({ 'lib/utils.js': 'exports.foo = 1' });

    exportWorkflowToFolder(wf, tempDir);

    const filePath = join(tempDir, 'sub', 'lib', 'utils.js');
    assert.ok(existsSync(filePath));
    assert.equal(readFileSync(filePath, 'utf-8'), 'exports.foo = 1');
  });

  it('includes links in workflow.json', () => {
    const wf = new Workflow({ name: 'WithLinks', id: 'wf-links' });
    wf.addNode({ name: 'A', id: 'a' });
    wf.addNode({ name: 'B', id: 'b' });
    wf.addLink({ from: 'a', to: 'b', id: 'link-1' });

    exportWorkflowToFolder(wf, tempDir);

    const meta = JSON.parse(readFileSync(join(tempDir, 'workflow.json'), 'utf-8'));
    assert.equal(meta.links.length, 1);
    assert.equal(meta.links[0].id, 'link-1');
    assert.equal(meta.links[0].from, 'a');
    assert.equal(meta.links[0].to, 'b');
  });
});
