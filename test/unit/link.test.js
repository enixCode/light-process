import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Link } from '../../dist/models/Link.js';

describe('Link', () => {
  it('generates uuid and auto-names from endpoints', () => {
    const link = new Link({ from: 'nodeA', to: 'nodeB' });
    assert.match(link.id, /^[0-9a-f-]{36}$/);
    assert.equal(link.name, 'nodeA->nodeB');
  });

  it('throws when from or to is missing', () => {
    assert.throws(() => new Link({ to: 'b' }), { message: /Link requires "from" and "to"/ });
    assert.throws(() => new Link({ from: 'a' }), { message: /Link requires "from" and "to"/ });
    assert.throws(() => new Link({}), { message: /Link requires "from" and "to"/ });
  });

  it('roundtrips through toJSON/fromJSON preserving all fields', () => {
    const link = new Link({
      id: 'link-rt',
      name: 'roundtrip-link',
      from: 'n1',
      to: 'n2',
      data: { key: 'value' },
      when: { count: { gt: 5 } },
      maxIterations: 10,
    });

    const restored = Link.fromJSON(link.toJSON());
    assert.equal(restored.id, 'link-rt');
    assert.equal(restored.name, 'roundtrip-link');
    assert.equal(restored.from, 'n1');
    assert.equal(restored.to, 'n2');
    assert.deepEqual(restored.data, { key: 'value' });
    assert.deepEqual(restored.when, { count: { gt: 5 } });
    assert.equal(restored.maxIterations, 10);
  });

  it('roundtrips a minimal link with defaults', () => {
    const link = new Link({ from: 'x', to: 'y' });
    const restored = Link.fromJSON(link.toJSON());
    assert.equal(restored.from, 'x');
    assert.equal(restored.to, 'y');
    assert.deepEqual(restored.data, {});
    assert.equal(restored.when, null);
    assert.equal(restored.maxIterations, null);
  });
});
