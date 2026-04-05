import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LinkValidationError } from '../../dist/errors.js';
import { Link } from '../../dist/models/Link.js';
import { Node } from '../../dist/models/Node.js';
import { Workflow } from '../../dist/Workflow.js';

function makeNode(name, id) {
  return new Node({ name, id: id || name });
}

describe('Workflow', () => {
  describe('constructor', () => {
    it('generates id when none provided', () => {
      const wf = new Workflow({ name: 'test' });
      assert.ok(wf.id);
      assert.match(wf.id, /^[0-9a-f-]{36}$/);
    });

    it('uses provided id', () => {
      const wf = new Workflow({ name: 'test', id: 'wf-1' });
      assert.equal(wf.id, 'wf-1');
    });

    it('sets name', () => {
      const wf = new Workflow({ name: 'my-workflow' });
      assert.equal(wf.name, 'my-workflow');
    });

    it('defaults network to null', () => {
      const wf = new Workflow({ name: 'test' });
      assert.equal(wf.network, null);
    });

    it('sets network when provided', () => {
      const wf = new Workflow({ name: 'test', network: 'my-net' });
      assert.equal(wf.network, 'my-net');
    });

    it('starts with empty nodes and links', () => {
      const wf = new Workflow({ name: 'test' });
      assert.equal(wf.nodes.size, 0);
      assert.equal(wf.links.size, 0);
    });

    it('accepts initial nodes and links', () => {
      const n1 = makeNode('A', 'a');
      const n2 = makeNode('B', 'b');
      const wf = new Workflow({
        name: 'test',
        nodes: [n1, n2],
        links: [new Link({ from: 'a', to: 'b' })],
      });
      assert.equal(wf.nodes.size, 2);
      assert.equal(wf.links.size, 1);
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
    it('returns a Node instance', () => {
      const wf = new Workflow({ name: 'test' });
      const node = wf.addNode({ name: 'A', id: 'a' });
      assert.ok(node instanceof Node);
      assert.equal(node.name, 'A');
    });

    it('adds node to the nodes map', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      assert.equal(wf.nodes.size, 1);
      assert.ok(wf.nodes.has('a'));
    });

    it('inherits workflow network when node has none', () => {
      const wf = new Workflow({ name: 'test', network: 'wf-net' });
      const node = wf.addNode({ name: 'A', id: 'a' });
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
      const result = wf.addNode(existing);
      assert.equal(result, existing);
      assert.ok(wf.nodes.has('x'));
    });
  });

  describe('addLink() validation', () => {
    it('throws LinkValidationError for non-existent source node', () => {
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

    it('throws LinkValidationError for non-existent target node', () => {
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

    it('throws LinkValidationError for self-loop', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      assert.throws(
        () => wf.addLink({ from: 'a', to: 'a' }),
        (err) => {
          assert.ok(err instanceof LinkValidationError);
          assert.ok(err.message.includes('self-loop'));
          return true;
        },
      );
    });

    it('throws LinkValidationError for cycle without maxIterations', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b' });
      assert.throws(
        () => wf.addLink({ from: 'b', to: 'a' }),
        (err) => {
          assert.ok(err instanceof LinkValidationError);
          assert.ok(err.message.includes('cycle'));
          return true;
        },
      );
    });

    it('allows cycle with maxIterations', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b' });
      const link = wf.addLink({ from: 'b', to: 'a', maxIterations: 3 });
      assert.ok(link instanceof Link);
      assert.equal(link.maxIterations, 3);
    });

    it('throws LinkValidationError for invalid when clause', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      assert.throws(
        () => wf.addLink({ from: 'a', to: 'b', when: { count: { badOp: 5 } } }),
        (err) => {
          assert.ok(err instanceof LinkValidationError);
          assert.ok(err.message.includes('invalid'));
          return true;
        },
      );
    });

    it('accepts Link instance directly', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      const link = new Link({ from: 'a', to: 'b', id: 'link-1' });
      const result = wf.addLink(link);
      assert.equal(result, link);
      assert.ok(wf.links.has('link-1'));
    });
  });

  describe('getEntryNodes()', () => {
    it('returns all nodes when no links exist', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      const entries = wf.getEntryNodes();
      assert.equal(entries.length, 2);
    });

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

    it('excludes back-links (maxIterations) from entry calculation', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b' });
      wf.addLink({ from: 'b', to: 'a', maxIterations: 3 });
      // A has a back-link incoming but it should still be an entry node
      const entries = wf.getEntryNodes();
      assert.equal(entries.length, 1);
      assert.equal(entries[0].id, 'a');
    });

    it('returns empty array for empty workflow', () => {
      const wf = new Workflow({ name: 'test' });
      assert.deepEqual(wf.getEntryNodes(), []);
    });
  });

  describe('getOutgoingLinks() / getIncomingLinks()', () => {
    it('returns outgoing links for a node', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addNode({ name: 'C', id: 'c' });
      wf.addLink({ from: 'a', to: 'b' });
      wf.addLink({ from: 'a', to: 'c' });

      const outgoing = wf.getOutgoingLinks('a');
      assert.equal(outgoing.length, 2);
    });

    it('returns incoming links for a node', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addNode({ name: 'C', id: 'c' });
      wf.addLink({ from: 'a', to: 'c' });
      wf.addLink({ from: 'b', to: 'c' });

      const incoming = wf.getIncomingLinks('c');
      assert.equal(incoming.length, 2);
    });

    it('returns empty array for node with no links', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      assert.deepEqual(wf.getOutgoingLinks('a'), []);
      assert.deepEqual(wf.getIncomingLinks('a'), []);
    });

    it('returns empty array for unknown node id', () => {
      const wf = new Workflow({ name: 'test' });
      assert.deepEqual(wf.getOutgoingLinks('nope'), []);
      assert.deepEqual(wf.getIncomingLinks('nope'), []);
    });
  });

  describe('findLink()', () => {
    it('finds existing link by from/to', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b', id: 'link-ab' });

      const found = wf.findLink('a', 'b');
      assert.ok(found);
      assert.equal(found.id, 'link-ab');
    });

    it('returns undefined for non-existent link', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      assert.equal(wf.findLink('a', 'b'), undefined);
    });
  });

  describe('removeLink()', () => {
    it('removes existing link and returns true', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b' });

      const removed = wf.removeLink('a', 'b');
      assert.equal(removed, true);
      assert.equal(wf.links.size, 0);
      assert.equal(wf.findLink('a', 'b'), undefined);
    });

    it('returns false for non-existent link', () => {
      const wf = new Workflow({ name: 'test' });
      assert.equal(wf.removeLink('a', 'b'), false);
    });

    it('cleans up outgoing and incoming caches', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b' });
      wf.removeLink('a', 'b');
      assert.deepEqual(wf.getOutgoingLinks('a'), []);
      assert.deepEqual(wf.getIncomingLinks('b'), []);
    });
  });

  describe('toJSON() / fromJSON() roundtrip', () => {
    it('serializes and deserializes correctly', () => {
      const wf = new Workflow({ name: 'roundtrip', id: 'wf-rt', network: 'test-net' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addLink({ from: 'a', to: 'b', id: 'link-1' });

      const json = wf.toJSON();
      assert.equal(json.id, 'wf-rt');
      assert.equal(json.name, 'roundtrip');
      assert.equal(json.network, 'test-net');
      assert.equal(json.nodes.length, 2);
      assert.equal(json.links.length, 1);

      const restored = Workflow.fromJSON(json);
      assert.equal(restored.id, wf.id);
      assert.equal(restored.name, wf.name);
      assert.equal(restored.network, wf.network);
      assert.equal(restored.nodes.size, 2);
      assert.equal(restored.links.size, 1);
      assert.ok(restored.nodes.has('a'));
      assert.ok(restored.nodes.has('b'));
      assert.ok(restored.findLink('a', 'b'));
    });

    it('handles empty workflow', () => {
      const wf = new Workflow({ name: 'empty', id: 'wf-empty' });
      const json = wf.toJSON();
      const restored = Workflow.fromJSON(json);
      assert.equal(restored.nodes.size, 0);
      assert.equal(restored.links.size, 0);
    });
  });

  describe('addLinks()', () => {
    it('adds multiple links at once', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      wf.addNode({ name: 'B', id: 'b' });
      wf.addNode({ name: 'C', id: 'c' });
      const links = wf.addLinks([
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ]);
      assert.equal(links.length, 2);
      assert.equal(wf.links.size, 2);
    });
  });

  describe('getNode()', () => {
    it('returns node by id', () => {
      const wf = new Workflow({ name: 'test' });
      wf.addNode({ name: 'A', id: 'a' });
      const node = wf.getNode('a');
      assert.ok(node);
      assert.equal(node.name, 'A');
    });

    it('returns undefined for unknown id', () => {
      const wf = new Workflow({ name: 'test' });
      assert.equal(wf.getNode('nope'), undefined);
    });
  });
});
