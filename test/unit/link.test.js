import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Link } from '../../dist/models/Link.js';

describe('Link', () => {
  describe('constructor defaults', () => {
    it('generates a uuid id when none provided', () => {
      const link = new Link({ from: 'a', to: 'b' });
      assert.ok(link.id);
      assert.match(link.id, /^[0-9a-f-]{36}$/);
    });

    it('auto-generates name from from->to', () => {
      const link = new Link({ from: 'nodeA', to: 'nodeB' });
      assert.equal(link.name, 'nodeA->nodeB');
    });

    it('defaults data to empty object', () => {
      const link = new Link({ from: 'a', to: 'b' });
      assert.deepEqual(link.data, {});
    });

    it('defaults when to null', () => {
      const link = new Link({ from: 'a', to: 'b' });
      assert.equal(link.when, null);
    });

    it('defaults maxIterations to null', () => {
      const link = new Link({ from: 'a', to: 'b' });
      assert.equal(link.maxIterations, null);
    });
  });

  describe('constructor with all options', () => {
    it('uses all provided values', () => {
      const config = {
        id: 'link-1',
        name: 'my-link',
        from: 'nodeA',
        to: 'nodeB',
        data: { extra: 'info' },
        when: { status: 'done' },
        maxIterations: 3,
      };
      const link = new Link(config);
      assert.equal(link.id, 'link-1');
      assert.equal(link.name, 'my-link');
      assert.equal(link.from, 'nodeA');
      assert.equal(link.to, 'nodeB');
      assert.deepEqual(link.data, { extra: 'info' });
      assert.deepEqual(link.when, { status: 'done' });
      assert.equal(link.maxIterations, 3);
    });
  });

  describe('constructor validation', () => {
    it('throws when from is missing', () => {
      assert.throws(() => new Link({ to: 'b' }), { message: /Link requires "from" and "to"/ });
    });

    it('throws when to is missing', () => {
      assert.throws(() => new Link({ from: 'a' }), { message: /Link requires "from" and "to"/ });
    });

    it('throws when both from and to are missing', () => {
      assert.throws(() => new Link({}), { message: /Link requires "from" and "to"/ });
    });
  });

  describe('toJSON() / fromJSON() roundtrip', () => {
    it('produces a plain object and reconstructs the link', () => {
      const link = new Link({
        id: 'link-rt',
        name: 'roundtrip-link',
        from: 'n1',
        to: 'n2',
        data: { key: 'value' },
        when: { count: { gt: 5 } },
        maxIterations: 10,
      });

      const json = link.toJSON();
      assert.equal(typeof json, 'object');
      assert.equal(json.id, 'link-rt');
      assert.equal(json.name, 'roundtrip-link');
      assert.equal(json.from, 'n1');
      assert.equal(json.to, 'n2');
      assert.deepEqual(json.data, { key: 'value' });
      assert.deepEqual(json.when, { count: { gt: 5 } });
      assert.equal(json.maxIterations, 10);

      const restored = Link.fromJSON(json);
      assert.equal(restored.id, link.id);
      assert.equal(restored.name, link.name);
      assert.equal(restored.from, link.from);
      assert.equal(restored.to, link.to);
      assert.deepEqual(restored.data, link.data);
      assert.deepEqual(restored.when, link.when);
      assert.equal(restored.maxIterations, link.maxIterations);
    });

    it('roundtrips a minimal link', () => {
      const link = new Link({ from: 'x', to: 'y' });
      const json = link.toJSON();
      const restored = Link.fromJSON(json);
      assert.equal(restored.from, 'x');
      assert.equal(restored.to, 'y');
      assert.deepEqual(restored.data, {});
      assert.equal(restored.when, null);
      assert.equal(restored.maxIterations, null);
    });
  });
});
