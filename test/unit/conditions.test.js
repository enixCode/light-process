import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkCondition, validateWhen } from '../../dist/models/conditions.js';

describe('validateWhen', () => {
  it('accepts all valid operators', () => {
    assert.doesNotThrow(() => validateWhen({ count: { gt: 5 } }));
    assert.doesNotThrow(() => validateWhen({ count: { gte: 5 } }));
    assert.doesNotThrow(() => validateWhen({ count: { lt: 5 } }));
    assert.doesNotThrow(() => validateWhen({ count: { lte: 5 } }));
    assert.doesNotThrow(() => validateWhen({ count: { ne: 5 } }));
    assert.doesNotThrow(() => validateWhen({ status: { in: ['a', 'b'] } }));
    assert.doesNotThrow(() => validateWhen({ name: { exists: true } }));
    assert.doesNotThrow(() => validateWhen({ name: { regex: 'enzo' } }));
  });

  it('accepts direct equality and or clauses', () => {
    assert.doesNotThrow(() => validateWhen({ status: 'done' }));
    assert.doesNotThrow(() => validateWhen({ or: [{ status: 'done' }, { count: { gt: 10 } }] }));
  });

  it('rejects unknown operators', () => {
    assert.throws(() => validateWhen({ count: { unknown: 5 } }), { message: /Unknown operator: "unknown"/ });
    assert.throws(() => validateWhen({ count: { $invalid: 5 } }), { message: /Unknown operator/ });
  });
});

describe('checkCondition', () => {
  it('matches exact values (string, number, boolean)', () => {
    assert.equal(checkCondition({ status: 'done' }, { status: 'done' }), true);
    assert.equal(checkCondition({ status: 'done' }, { status: 'pending' }), false);
    assert.equal(checkCondition({ count: 5 }, { count: 5 }), true);
    assert.equal(checkCondition({ count: 5 }, { count: 6 }), false);
    assert.equal(checkCondition({ active: true }, { active: true }), true);
    assert.equal(checkCondition({ active: true }, { active: false }), false);
  });

  it('returns false when field is missing for exact match', () => {
    assert.equal(checkCondition({ status: 'done' }, {}), false);
  });

  it('evaluates comparison operators at boundaries', () => {
    // gt: strictly greater
    assert.equal(checkCondition({ n: { gt: 5 } }, { n: 6 }), true);
    assert.equal(checkCondition({ n: { gt: 5 } }, { n: 5 }), false);
    // gte: greater or equal
    assert.equal(checkCondition({ n: { gte: 5 } }, { n: 5 }), true);
    assert.equal(checkCondition({ n: { gte: 5 } }, { n: 4 }), false);
    // lt: strictly less
    assert.equal(checkCondition({ n: { lt: 5 } }, { n: 4 }), true);
    assert.equal(checkCondition({ n: { lt: 5 } }, { n: 5 }), false);
    // lte: less or equal
    assert.equal(checkCondition({ n: { lte: 5 } }, { n: 5 }), true);
    assert.equal(checkCondition({ n: { lte: 5 } }, { n: 6 }), false);
  });

  it('handles ne, in, and exists operators', () => {
    assert.equal(checkCondition({ s: { ne: 'error' } }, { s: 'ok' }), true);
    assert.equal(checkCondition({ s: { ne: 'error' } }, { s: 'error' }), false);
    assert.equal(checkCondition({ s: { ne: 'error' } }, {}), true);

    assert.equal(checkCondition({ c: { in: ['red', 'blue'] } }, { c: 'red' }), true);
    assert.equal(checkCondition({ c: { in: ['red', 'blue'] } }, { c: 'green' }), false);
    assert.equal(checkCondition({ c: { in: ['red', 'blue'] } }, {}), false);

    assert.equal(checkCondition({ name: { exists: true } }, { name: 'John' }), true);
    assert.equal(checkCondition({ name: { exists: true } }, {}), false);
    assert.equal(checkCondition({ name: { exists: false } }, {}), true);
    assert.equal(checkCondition({ name: { exists: false } }, { name: 'John' }), false);
  });

  it('evaluates regex operator', () => {
    assert.equal(checkCondition({ name: { regex: 'enzo' } }, { name: 'lorenzo' }), true);
    assert.equal(checkCondition({ name: { regex: '^enzo' } }, { name: 'enzo123' }), true);
    assert.equal(checkCondition({ name: { regex: '^enzo' } }, { name: 'lorenzo' }), false);
    assert.equal(checkCondition({ name: { regex: 'test$' } }, { name: 'mytest' }), true);
    assert.equal(checkCondition({ name: { regex: 'test$' } }, { name: 'testing' }), false);
    assert.equal(checkCondition({ name: { regex: 'enzo' } }, { name: 123 }), false, 'non-string fails');
    assert.equal(checkCondition({ name: { regex: 'enzo' } }, {}), false, 'missing field fails');
  });

  it('evaluates OR and AND combinations', () => {
    const or = { or: [{ status: 'done' }, { status: 'complete' }] };
    assert.equal(checkCondition(or, { status: 'complete' }), true);
    assert.equal(checkCondition(or, { status: 'pending' }), false);

    // AND: all top-level fields must match
    assert.equal(checkCondition({ status: 'done', count: { gt: 5 } }, { status: 'done', count: 10 }), true);
    assert.equal(checkCondition({ status: 'done', count: { gt: 5 } }, { status: 'done', count: 3 }), false);
  });

  it('handles complex nested OR with operators', () => {
    const cond = {
      or: [{ score: { gte: 90 } }, { status: 'override' }],
    };
    assert.equal(checkCondition(cond, { score: 95 }), true);
    assert.equal(checkCondition(cond, { status: 'override' }), true);
    assert.equal(checkCondition(cond, { score: 50 }), false);
  });

  it('handles edge cases', () => {
    assert.equal(checkCondition({}, { anything: true }), true, 'empty condition always passes');
    assert.equal(checkCondition({ val: null }, { val: null }), true);
    assert.equal(checkCondition({ val: null }, { val: 'something' }), false);
    assert.equal(checkCondition({ count: { gt: 5 } }, { count: 'ten' }), false, 'non-numeric fails comparison');
    assert.equal(checkCondition({ count: { gt: 0 } }, {}), false, 'missing field fails comparison');
    assert.equal(checkCondition({ or: 'invalid' }, {}), false, 'non-array or fails');
  });
});
