import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LinkValidationError } from '../../dist/errors.js';
import { Link } from '../../dist/models/Link.js';
import { Node } from '../../dist/models/Node.js';
import { Workflow } from '../../dist/Workflow.js';

function makeNode(name, id) {
  return new Node({ name, id: id || name });
}

/** Mock runner that resolves nodes with configurable output */
function mockRunner(outputMap = {}) {
  return {
    runNode(node, input) {
      const fn = outputMap[node.id];
      const output = fn ? fn(input) : {};
      return {
        result: Promise.resolve({
          nodeId: node.id,
          nodeName: node.name,
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
          duration: 1,
          input,
          output,
          cancelled: false,
          resources: { cpu: null, memory: null },
        }),
      };
    },
  };
}

/** Mock runner where specific nodes fail */
function failingRunner(failNodeIds = []) {
  return {
    runNode(node, input) {
      const shouldFail = failNodeIds.includes(node.id);
      return {
        result: Promise.resolve({
          nodeId: node.id,
          nodeName: node.name,
          success: !shouldFail,
          exitCode: shouldFail ? 1 : 0,
          stdout: '',
          stderr: shouldFail ? 'error' : '',
          duration: 1,
          input,
          output: shouldFail ? {} : { ok: true },
          cancelled: false,
          resources: { cpu: null, memory: null },
        }),
      };
    },
  };
}

describe('Workflow', () => {
  describe('constructor', () => {
    it('generates uuid and accepts initial nodes/links', () => {
      const wf = new Workflow({ name: 'test' });
      assert.match(wf.id, /^[0-9a-f-]{36}$/);
      assert.equal(wf.nodes.size, 0);
      assert.equal(wf.links.size, 0);
    });

    it('accepts NodeJSON and LinkJSON in constructor', () => {
      const n1 = makeNode('A', 'a').toJSON();
      const n2 = makeNode('B', 'b').toJSON();
      const l = new Link({ from: 'a', to: 'b' }).toJSON();
      const wf = new Workflow({ name: 'test', nodes: [n1, n2], links: [l] });
      assert.equal(wf.nodes.size, 2);
      assert.equal(wf.links.size, 1);
    });
  });

  describe('addNode()', () => {
    it('adds node to map and inherits workflow network', () => {
      const wf = new Workflow({ name: 'test', network: 'wf-net' });
      const node = wf.addNode({ name: 'A', id: 'a' });
      assert.ok(node instanceof Node);
      assert.ok(wf.nodes.has('a'));
      assert.equal(node.network, 'wf-net');
    });

    it('does not overwrite node network if already set', () => {
      const wf = new Workflow({ name: 'test', network: 'wf-net' });
      const node = wf.addNode({ name: 'A', id: 'a', network: 'node-net' });
      assert.equal(node.network, 'node-net');
    });

    it('accepts Node instance directly', () => {
      const wf = new Workflow({ name: 'test' });
      const existing = makeNode('X', 'x');
      assert.equal(wf.addNode(existing), existing);
      assert.ok(wf.nodes.has('x'));
    });
  });

  describe('addLink() validation', () => {
    it('throws for non-existent source node', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'B', id: 'b' });
      assert.throws(
        () => wf.addLink({ from: 'missing', to: 'b' }),
        (err) => {
          assert.ok(err instanceof LinkValidationError);
          assert.ok(err.message.includes('non-existent source'));
          return true;
        },
      );
    });

    it('throws for non-existent target node', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      assert.throws(
        () => wf.addLink({ from: 'a', to: 'missing' }),
        (err) => {
          assert.ok(err instanceof LinkValidationError);
          assert.ok(err.message.includes('non-existent target'));
          return true;
        },
      );
    });

    it('throws for self-loop', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      assert.throws(
        () => wf.addLink({ from: 'a', to: 'a' }),
        (err) => {
          assert.ok(err.message.includes('self-loop'));
          return true;
        },
      );
    });

    it('throws for cycle without maxIterations, allows with', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b' });
      assert.throws(
        () => wf.addLink({ from: 'b', to: 'a' }),
        (err) => {
          assert.ok(err.message.includes('cycle'));
          return true;
        },
      );

      // With maxIterations it should work
      const wf2 = new Workflow({ name: 'test2' });
      wf2.addNode({ name: 'A', id: 'a' });
      wf2.addNode({ name: 'B', id: 'b' });
      wf2.addLink({ from: 'a', to: 'b' });
      const link = wf2.addLink({ from: 'b', to: 'a', maxIterations: 3 });
      assert.equal(link.maxIterations, 3);
    });

    it('throws for invalid when clause', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      assert.throws(() => wf.addLink({ from: 'a', to: 'b', when: { count: { badOp: 5 } } }));
    });
  });

  describe('getEntryNodes()', () => {
    it('returns only nodes with no incoming forward links', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addNode({ name: 'C', id: 'c' });
      wf.addLink({ from: 'a', to: 'b' });
      wf.addLink({ from: 'b', to: 'c' });
      const entries = wf.getEntryNodes();
      assert.equal(entries.length, 1);
      assert.equal(entries[0].id, 'a');
    });

    it('excludes back-links from entry calculation', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b' });
      wf.addLink({ from: 'b', to: 'a', maxIterations: 3 });
      const entries = wf.getEntryNodes();
      assert.equal(entries.length, 1);
      assert.equal(entries[0].id, 'a');
    });
  });

  describe('graph queries', () => {
    it('getOutgoingLinks/getIncomingLinks return correct links', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addNode({ name: 'C', id: 'c' });
      wf.addLink({ from: 'a', to: 'b' });
      wf.addLink({ from: 'a', to: 'c' });
      wf.addLink({ from: 'b', to: 'c' });

      assert.equal(wf.getOutgoingLinks('a').length, 2);
      assert.equal(wf.getIncomingLinks('c').length, 2);
      assert.deepEqual(wf.getOutgoingLinks('unknown'), []);
    });

    it('findLink and removeLink work correctly', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b', id: 'link-ab' });

      assert.equal(wf.findLink('a', 'b').id, 'link-ab');
      assert.equal(wf.findLink('b', 'a'), undefined);

      assert.equal(wf.removeLink('a', 'b'), true);
      assert.equal(wf.links.size, 0);
      assert.deepEqual(wf.getOutgoingLinks('a'), []);
      assert.deepEqual(wf.getIncomingLinks('b'), []);
      assert.equal(wf.removeLink('a', 'b'), false);
    });
  });

  describe('toJSON() / fromJSON() roundtrip', () => {
    it('preserves nodes, links, and metadata', () => {
      const wf = new Workflow({ name: 'roundtrip', id: 'wf-rt', network: 'test-net' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b', id: 'link-1' });

      const restored = Workflow.fromJSON(wf.toJSON());
      assert.equal(restored.id, 'wf-rt');
      assert.equal(restored.name, 'roundtrip');
      assert.equal(restored.network, 'test-net');
      assert.equal(restored.nodes.size, 2);
      assert.equal(restored.links.size, 1);
      assert.ok(restored.findLink('a', 'b'));
    });
  });

  describe('execute()', () => {
    it('runs a linear A->B->C pipeline passing output forward', async () => {
      const wf = new Workflow({ name: 'pipeline' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addNode({ name: 'C', id: 'c' });
      wf.addLink({ from: 'a', to: 'b' });
      wf.addLink({ from: 'b', to: 'c' });

      const runner = mockRunner({
        a: (input) => ({ step: 1, ...input }),
        b: (input) => ({ step: 2, prev: input.step }),
        c: (input) => ({ step: 3, prev: input.step }),
      });

      const result = await wf.execute({ seed: 42 }, { runner });
      assert.equal(result.success, true);
      assert.equal(Object.keys(result.results).length, 3);
      assert.equal(result.results.a.output.step, 1);
      assert.equal(result.results.b.output.prev, 1);
      assert.equal(result.results.c.output.prev, 2);
    });

    it('stops on node failure and marks workflow as failed', async () => {
      const wf = new Workflow({ name: 'fail-test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b' });

      const result = await wf.execute({}, { runner: failingRunner(['a']) });
      assert.equal(result.success, false);
      assert.ok(result.error.includes('A'));
      // B should not have executed
      assert.equal(result.results.b, undefined);
    });

    it('follows conditional links only when condition matches', async () => {
      const wf = new Workflow({ name: 'conditional' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'Pass', id: 'pass' });
      wf.addNode({ name: 'Fail', id: 'fail' });
      wf.addLink({ from: 'a', to: 'pass', when: { status: 'ok' } });
      wf.addLink({ from: 'a', to: 'fail', when: { status: 'error' } });

      const runner = mockRunner({
        a: () => ({ status: 'ok' }),
        pass: () => ({ reached: true }),
        fail: () => ({ reached: true }),
      });

      const result = await wf.execute({}, { runner });
      assert.equal(result.success, true);
      assert.ok(result.results.pass, 'pass node should execute');
      assert.equal(result.results.fail, undefined, 'fail node should not execute');
    });

    it('merges inputs from multiple parent nodes', async () => {
      // A -> C, B -> C (both feed into C)
      const wf = new Workflow({ name: 'merge' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addNode({ name: 'C', id: 'c' });
      wf.addLink({ from: 'a', to: 'c' });
      wf.addLink({ from: 'b', to: 'c' });

      const runner = mockRunner({
        a: () => ({ fromA: 1 }),
        b: () => ({ fromB: 2 }),
        c: (input) => ({ merged: true, ...input }),
      });

      const result = await wf.execute({}, { runner });
      assert.equal(result.success, true);
      assert.equal(result.results.c.output.fromA, 1);
      assert.equal(result.results.c.output.fromB, 2);
    });

    it('injects link data into downstream input', async () => {
      const wf = new Workflow({ name: 'data-inject' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b', data: { injected: 'value' } });

      const runner = mockRunner({
        a: () => ({ fromA: true }),
        b: (input) => ({ ...input }),
      });

      const result = await wf.execute({}, { runner });
      assert.equal(result.success, true);
      assert.equal(result.results.b.output.injected, 'value');
      assert.equal(result.results.b.output.fromA, true);
    });

    it('calls onNodeStart and onNodeComplete callbacks', async () => {
      const wf = new Workflow({ name: 'callbacks' });
      wf.addNode({ name: 'A', id: 'a' });

      const started = [];
      const completed = [];

      await wf.execute(
        {},
        {
          runner: mockRunner({ a: () => ({ done: true }) }),
          onNodeStart: (id, name) => started.push({ id, name }),
          onNodeComplete: (id, name, success) => completed.push({ id, name, success }),
        },
      );

      assert.equal(started.length, 1);
      assert.equal(started[0].name, 'A');
      assert.equal(completed.length, 1);
      assert.equal(completed[0].success, true);
    });

    it('runs parallel entry nodes in the same batch', async () => {
      const wf = new Workflow({ name: 'parallel' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      // No links - both are entry nodes

      const runner = mockRunner({
        a: () => ({ node: 'a' }),
        b: () => ({ node: 'b' }),
      });

      const result = await wf.execute({}, { runner });
      assert.equal(result.success, true);
      assert.ok(result.results.a);
      assert.ok(result.results.b);
    });

    it('respects maxIterations on back-links', async () => {
      const wf = new Workflow({ name: 'loop' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b' });
      wf.addLink({ from: 'b', to: 'a', maxIterations: 2 });

      let aCount = 0;
      let bCount = 0;
      const runner = mockRunner({
        a: () => {
          aCount++;
          return { iteration: aCount };
        },
        b: () => {
          bCount++;
          return { iteration: bCount };
        },
      });

      const result = await wf.execute({}, { runner });
      assert.equal(result.success, true);
      // A runs once initially, then up to 2 more times from back-link
      assert.ok(aCount <= 3, `A ran ${aCount} times, expected <= 3`);
      assert.ok(bCount <= 3, `B ran ${bCount} times, expected <= 3`);
    });
  });
});
