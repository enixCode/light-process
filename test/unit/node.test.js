import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DEFAULT_WORKDIR } from '../../dist/defaults.js';
import { OUTPUT_FILE } from '../../dist/helpers.js';
import { Node } from '../../dist/models/Node.js';

describe('Node', () => {
  describe('constructor defaults', () => {
    it('generates a uuid id when none provided', () => {
      const node = new Node({ name: 'test' });
      assert.ok(node.id);
      assert.match(node.id, /^[0-9a-f-]{36}$/);
    });

    it('defaults type to docker', () => {
      const node = new Node({ name: 'test' });
      assert.equal(node.type, 'docker');
    });

    it('defaults image to null', () => {
      const node = new Node({ name: 'test' });
      assert.equal(node.image, null);
    });

    it('defaults inputs and outputs to null', () => {
      const node = new Node({ name: 'test' });
      assert.equal(node.inputs, null);
      assert.equal(node.outputs, null);
    });

    it('defaults files to empty object', () => {
      const node = new Node({ name: 'test' });
      assert.deepEqual(node.files, {});
    });

    it('defaults setup to empty array', () => {
      const node = new Node({ name: 'test' });
      assert.deepEqual(node.setup, []);
    });

    it('defaults entrypoint to null', () => {
      const node = new Node({ name: 'test' });
      assert.equal(node.entrypoint, null);
    });

    it('defaults workdir to DEFAULT_WORKDIR', () => {
      const node = new Node({ name: 'test' });
      assert.equal(node.workdir, DEFAULT_WORKDIR);
    });

    it('defaults timeout to 0', () => {
      const node = new Node({ name: 'test' });
      assert.equal(node.timeout, 0);
    });

    it('defaults network to null', () => {
      const node = new Node({ name: 'test' });
      assert.equal(node.network, null);
    });
  });

  describe('constructor with all options', () => {
    it('uses all provided values', () => {
      const config = {
        id: 'custom-id',
        name: 'my-node',
        type: 'human',
        image: 'node:20',
        files: { 'main.js': 'console.log("hi")' },
        setup: ['npm install'],
        entrypoint: 'node main.js',
        workdir: '/workspace',
        timeout: 5000,
        network: 'my-net',
        inputs: { type: 'object', properties: { x: { type: 'number' } } },
        outputs: { type: 'object', properties: { y: { type: 'string' } } },
      };
      const node = new Node(config);
      assert.equal(node.id, 'custom-id');
      assert.equal(node.name, 'my-node');
      assert.equal(node.type, 'human');
      assert.equal(node.image, 'node:20');
      assert.deepEqual(node.files, { 'main.js': 'console.log("hi")' });
      assert.deepEqual(node.setup, ['npm install']);
      assert.equal(node.entrypoint, 'node main.js');
      assert.equal(node.workdir, '/workspace');
      assert.equal(node.timeout, 5000);
      assert.equal(node.network, 'my-net');
      assert.deepEqual(node.inputs, config.inputs);
      assert.deepEqual(node.outputs, config.outputs);
    });
  });

  describe('setCode()', () => {
    it('generates valid JS code in files["index.js"]', () => {
      const node = new Node({ name: 'test' });
      node.setCode((input) => ({ result: input.x + 1 }));
      assert.ok(node.files['index.js']);
      assert.ok(node.files['index.js'].includes('writeFileSync'));
      assert.ok(node.files['index.js'].includes('JSON.parse'));
      assert.ok(node.files['index.js'].includes(OUTPUT_FILE));
    });

    it('sets entrypoint to "node index.js" if none set', () => {
      const node = new Node({ name: 'test' });
      node.setCode((input) => input);
      assert.equal(node.entrypoint, 'node index.js');
    });

    it('does not overwrite existing entrypoint', () => {
      const node = new Node({ name: 'test', entrypoint: 'custom-run' });
      node.setCode((input) => input);
      assert.equal(node.entrypoint, 'custom-run');
    });

    it('rejects native functions', () => {
      const node = new Node({ name: 'test' });
      assert.throws(() => node.setCode(Math.sqrt), { message: /native or bound functions cannot be serialized/ });
    });

    it('rejects non-function arguments', () => {
      const node = new Node({ name: 'test' });
      assert.throws(() => node.setCode('not a function'), { message: /setCode expects a function/ });
    });

    it('returns this for chaining', () => {
      const node = new Node({ name: 'test' });
      const result = node.setCode(() => ({}));
      assert.equal(result, node);
    });
  });

  describe('addHelper()', () => {
    it('adds javascript helper file', () => {
      const node = new Node({ name: 'test' });
      node.addHelper('javascript');
      assert.ok(node.files['lp.js']);
      assert.ok(node.files['lp.js'].includes('input'));
      assert.ok(node.files['lp.js'].includes('send'));
    });

    it('adds python helper file', () => {
      const node = new Node({ name: 'test' });
      node.addHelper('python');
      assert.ok(node.files['lp.py']);
      assert.ok(node.files['lp.py'].includes('import json'));
      assert.ok(node.files['lp.py'].includes('send'));
    });

    it('adds all helpers when no argument', () => {
      const node = new Node({ name: 'test' });
      node.addHelper();
      assert.ok(node.files['lp.js']);
      assert.ok(node.files['lp.py']);
    });

    it('returns this for chaining', () => {
      const node = new Node({ name: 'test' });
      const result = node.addHelper('javascript');
      assert.equal(result, node);
    });
  });

  describe('addFiles()', () => {
    it('merges files into existing files', () => {
      const node = new Node({ name: 'test', files: { 'a.js': 'a' } });
      node.addFiles({ 'b.js': 'b', 'c.js': 'c' });
      assert.equal(node.files['a.js'], 'a');
      assert.equal(node.files['b.js'], 'b');
      assert.equal(node.files['c.js'], 'c');
    });

    it('overwrites existing files with same key', () => {
      const node = new Node({ name: 'test', files: { 'a.js': 'old' } });
      node.addFiles({ 'a.js': 'new' });
      assert.equal(node.files['a.js'], 'new');
    });

    it('returns this for chaining', () => {
      const node = new Node({ name: 'test' });
      const result = node.addFiles({ 'x.js': 'x' });
      assert.equal(result, node);
    });
  });

  describe('toJSON() / fromJSON() roundtrip', () => {
    it('produces a plain object and reconstructs the node', () => {
      const node = new Node({
        id: 'abc',
        name: 'roundtrip',
        type: 'human',
        image: 'alpine',
        files: { 'main.sh': 'echo hello' },
        setup: ['apk add curl'],
        entrypoint: 'sh main.sh',
        workdir: '/tmp',
        timeout: 3000,
        network: 'test-net',
        inputs: { type: 'object', properties: { a: { type: 'string' } } },
        outputs: { type: 'object', properties: { b: { type: 'number' } } },
      });

      const json = node.toJSON();
      assert.equal(typeof json, 'object');
      assert.equal(json.id, 'abc');
      assert.equal(json.name, 'roundtrip');

      const restored = Node.fromJSON(json);
      assert.equal(restored.id, node.id);
      assert.equal(restored.name, node.name);
      assert.equal(restored.type, node.type);
      assert.equal(restored.image, node.image);
      assert.deepEqual(restored.files, node.files);
      assert.deepEqual(restored.setup, node.setup);
      assert.equal(restored.entrypoint, node.entrypoint);
      assert.equal(restored.workdir, node.workdir);
      assert.equal(restored.timeout, node.timeout);
      assert.equal(restored.network, node.network);
      assert.deepEqual(restored.inputs, node.inputs);
      assert.deepEqual(restored.outputs, node.outputs);
    });
  });

  describe('addFolder()', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = join(tmpdir(), `lp-test-${randomUUID()}`);
      mkdirSync(tempDir, { recursive: true });
      mkdirSync(join(tempDir, 'sub'), { recursive: true });
      writeFileSync(join(tempDir, 'index.js'), 'console.log("hello")');
      writeFileSync(join(tempDir, 'sub', 'util.js'), 'module.exports = {}');
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('loads directory files and sets entrypoint', () => {
      const node = new Node({ name: 'test' });
      node.addFolder(tempDir, 'node index.js');
      assert.equal(node.files['index.js'], 'console.log("hello")');
      assert.equal(node.files['sub/util.js'], 'module.exports = {}');
      assert.equal(node.entrypoint, 'node index.js');
    });

    it('returns this for chaining', () => {
      const node = new Node({ name: 'test' });
      const result = node.addFolder(tempDir, 'node index.js');
      assert.equal(result, node);
    });
  });
});
