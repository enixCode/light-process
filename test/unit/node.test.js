import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { OUTPUT_FILE } from '../../dist/helpers.js';
import { Node } from '../../dist/models/Node.js';

describe('Node', () => {
  it('generates uuid when no id provided', () => {
    const node = new Node({ name: 'test' });
    assert.match(node.id, /^[0-9a-f-]{36}$/);
  });

  describe('env variable validation', () => {
    it('accepts valid env names', () => {
      assert.doesNotThrow(() => new Node({ name: 'test', env: ['MY_VAR', 'API_KEY', 'x'] }));
    });

    it('rejects invalid env names', () => {
      assert.throws(() => new Node({ name: 'test', env: ['123BAD'] }), { message: /Invalid env name/ });
      assert.throws(() => new Node({ name: 'test', env: ['my-var'] }), { message: /Invalid env name/ });
      assert.throws(() => new Node({ name: 'test', env: [''] }), { message: /Invalid env name/ });
    });

    it('rejects reserved LP_ prefix', () => {
      assert.throws(() => new Node({ name: 'test', env: ['LP_SECRET'] }), { message: /Reserved env name/ });
      assert.throws(() => new Node({ name: 'test', env: ['LP_INPUT'] }), { message: /Reserved env name/ });
    });
  });

  describe('setCode()', () => {
    it('generates code that reads stdin, runs function, and writes output file', () => {
      const node = new Node({ name: 'test' });
      node.setCode((input) => ({ result: input.x + 1 }));
      const code = node.files['index.js'];
      assert.ok(code);
      assert.ok(code.includes('JSON.parse'), 'parses input');
      assert.ok(code.includes('writeFileSync'), 'writes output');
      assert.ok(code.includes(OUTPUT_FILE), 'uses correct output filename');
      assert.equal(node.entrypoint, 'node index.js');
    });

    it('preserves existing entrypoint', () => {
      const node = new Node({ name: 'test', entrypoint: 'custom-run' });
      node.setCode((input) => input);
      assert.equal(node.entrypoint, 'custom-run');
    });

    it('rejects native functions and non-functions', () => {
      const node = new Node({ name: 'test' });
      assert.throws(() => node.setCode(Math.sqrt), { message: /native or bound/ });
      assert.throws(() => node.setCode('not a function'), { message: /setCode expects a function/ });
    });

    it('returns this for chaining', () => {
      const node = new Node({ name: 'test' });
      assert.equal(
        node.setCode(() => ({})),
        node,
      );
    });
  });

  describe('addHelper()', () => {
    it('adds language-specific helpers', () => {
      const node = new Node({ name: 'test' });
      node.addHelper('javascript');
      assert.ok(node.files['lp.js']);
      assert.ok(!node.files['lp.py']);

      const node2 = new Node({ name: 'test2' });
      node2.addHelper('python');
      assert.ok(node2.files['lp.py']);
      assert.ok(!node2.files['lp.js']);
    });

    it('adds all helpers when called without argument', () => {
      const node = new Node({ name: 'test' });
      node.addHelper();
      assert.ok(node.files['lp.js']);
      assert.ok(node.files['lp.py']);
    });
  });

  describe('addFiles()', () => {
    it('merges and overwrites files', () => {
      const node = new Node({ name: 'test', files: { 'a.js': 'old-a' } });
      node.addFiles({ 'a.js': 'new-a', 'b.js': 'b' });
      assert.equal(node.files['a.js'], 'new-a');
      assert.equal(node.files['b.js'], 'b');
    });
  });

  describe('toJSON() / fromJSON() roundtrip', () => {
    it('preserves all fields through serialization', () => {
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

      const restored = Node.fromJSON(node.toJSON());
      assert.equal(restored.id, 'abc');
      assert.equal(restored.name, 'roundtrip');
      assert.equal(restored.type, 'human');
      assert.equal(restored.image, 'alpine');
      assert.deepEqual(restored.files, { 'main.sh': 'echo hello' });
      assert.deepEqual(restored.setup, ['apk add curl']);
      assert.equal(restored.entrypoint, 'sh main.sh');
      assert.equal(restored.workdir, '/tmp');
      assert.equal(restored.timeout, 3000);
      assert.equal(restored.network, 'test-net');
      assert.deepEqual(restored.inputs, node.inputs);
      assert.deepEqual(restored.outputs, node.outputs);
    });
  });

  describe('addFolder()', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = join(tmpdir(), `lp-test-${randomUUID()}`);
      mkdirSync(join(tempDir, 'sub'), { recursive: true });
      writeFileSync(join(tempDir, 'index.js'), 'console.log("hello")');
      writeFileSync(join(tempDir, 'sub', 'util.js'), 'module.exports = {}');
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('loads nested files and sets entrypoint', () => {
      const node = new Node({ name: 'test' });
      node.addFolder(tempDir, 'node index.js');
      assert.equal(node.files['index.js'], 'console.log("hello")');
      assert.equal(node.files['sub/util.js'], 'module.exports = {}');
      assert.equal(node.entrypoint, 'node index.js');
    });

    it('returns this for chaining', () => {
      const node = new Node({ name: 'test' });
      assert.equal(node.addFolder(tempDir, 'node index.js'), node);
    });
  });
});
