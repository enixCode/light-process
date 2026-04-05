import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkCondition, validateWhen } from '../../dist/models/conditions.js';

describe('validateWhen', () => {
  it('passes for valid operators', () => {
    assert.doesNotThrow(() => validateWhen({ count: { gt: 5 } }));
    assert.doesNotThrow(() => validateWhen({ count: { gte: 5 } }));
    assert.doesNotThrow(() => validateWhen({ count: { lt: 5 } }));
    assert.doesNotThrow(() => validateWhen({ count: { lte: 5 } }));
    assert.doesNotThrow(() => validateWhen({ count: { ne: 5 } }));
    assert.doesNotThrow(() => validateWhen({ status: { in: ['a', 'b'] } }));
    assert.doesNotThrow(() => validateWhen({ name: { exists: true } }));
  });

  it('passes for or operator with valid nested conditions', () => {
    assert.doesNotThrow(() =>
      validateWhen({
        or: [{ status: 'done' }, { count: { gt: 10 } }],
      }),
    );
  });

  it('passes for direct equality (not an operator)', () => {
    assert.doesNotThrow(() => validateWhen({ status: 'done' }));
  });

  it('throws for unknown nested operators', () => {
    assert.throws(() => validateWhen({ count: { unknown: 5 } }), { message: /Unknown operator: "unknown"/ });
  });

  it('throws for invalid operator with dollar prefix', () => {
    assert.throws(() => validateWhen({ count: { $invalid: 5 } }), { message: /Unknown operator/ });
  });

  it('does not throw for top-level valid operators used as field names', () => {
    // 'gt', 'gte' etc. are valid as top-level operator names
    assert.doesNotThrow(() => validateWhen({ gt: 5 }));
  });
});

describe('checkCondition', () => {
  describe('exact match', () => {
    it('returns true for matching value', () => {
      assert.equal(checkCondition({ status: 'done' }, { status: 'done' }), true);
    });

    it('returns false for non-matching value', () => {
      assert.equal(checkCondition({ status: 'done' }, { status: 'pending' }), false);
    });

    it('returns false for missing field', () => {
      assert.equal(checkCondition({ status: 'done' }, {}), false);
    });

    it('handles numeric exact match', () => {
      assert.equal(checkCondition({ count: 5 }, { count: 5 }), true);
      assert.equal(checkCondition({ count: 5 }, { count: 6 }), false);
    });

    it('handles boolean exact match', () => {
      assert.equal(checkCondition({ active: true }, { active: true }), true);
      assert.equal(checkCondition({ active: true }, { active: false }), false);
    });
  });

  describe('gt operator', () => {
    it('returns true when value is greater', () => {
      assert.equal(checkCondition({ count: { gt: 5 } }, { count: 10 }), true);
    });

    it('returns false when value equals', () => {
      assert.equal(checkCondition({ count: { gt: 5 } }, { count: 5 }), false);
    });

    it('returns false when value is less', () => {
      assert.equal(checkCondition({ count: { gt: 5 } }, { count: 3 }), false);
    });

    it('returns false when value is not a number', () => {
      assert.equal(checkCondition({ count: { gt: 5 } }, { count: 'ten' }), false);
    });
  });

  describe('gte operator', () => {
    it('returns true when value equals', () => {
      assert.equal(checkCondition({ count: { gte: 5 } }, { count: 5 }), true);
    });

    it('returns true when value is greater', () => {
      assert.equal(checkCondition({ count: { gte: 5 } }, { count: 10 }), true);
    });

    it('returns false when value is less', () => {
      assert.equal(checkCondition({ count: { gte: 5 } }, { count: 3 }), false);
    });
  });

  describe('lt operator', () => {
    it('returns true when value is less', () => {
      assert.equal(checkCondition({ count: { lt: 5 } }, { count: 3 }), true);
    });

    it('returns false when value equals', () => {
      assert.equal(checkCondition({ count: { lt: 5 } }, { count: 5 }), false);
    });

    it('returns false when value is greater', () => {
      assert.equal(checkCondition({ count: { lt: 5 } }, { count: 10 }), false);
    });
  });

  describe('lte operator', () => {
    it('returns true when value equals', () => {
      assert.equal(checkCondition({ count: { lte: 5 } }, { count: 5 }), true);
    });

    it('returns true when value is less', () => {
      assert.equal(checkCondition({ count: { lte: 5 } }, { count: 3 }), true);
    });

    it('returns false when value is greater', () => {
      assert.equal(checkCondition({ count: { lte: 5 } }, { count: 10 }), false);
    });
  });

  describe('ne operator', () => {
    it('returns true when values differ', () => {
      assert.equal(checkCondition({ status: { ne: 'error' } }, { status: 'ok' }), true);
    });

    it('returns false when values are equal', () => {
      assert.equal(checkCondition({ status: { ne: 'error' } }, { status: 'error' }), false);
    });

    it('returns true when field is undefined (undefined !== "error")', () => {
      assert.equal(checkCondition({ status: { ne: 'error' } }, {}), true);
    });
  });

  describe('in operator', () => {
    it('returns true when value is in array', () => {
      assert.equal(checkCondition({ color: { in: ['red', 'blue'] } }, { color: 'red' }), true);
    });

    it('returns false when value is not in array', () => {
      assert.equal(checkCondition({ color: { in: ['red', 'blue'] } }, { color: 'green' }), false);
    });

    it('returns false when field is missing', () => {
      assert.equal(checkCondition({ color: { in: ['red', 'blue'] } }, {}), false);
    });
  });

  describe('exists operator', () => {
    it('returns true when field exists and exists=true', () => {
      assert.equal(checkCondition({ name: { exists: true } }, { name: 'John' }), true);
    });

    it('returns false when field missing and exists=true', () => {
      assert.equal(checkCondition({ name: { exists: true } }, {}), false);
    });

    it('returns true when field missing and exists=false', () => {
      assert.equal(checkCondition({ name: { exists: false } }, {}), true);
    });

    it('returns false when field exists and exists=false', () => {
      assert.equal(checkCondition({ name: { exists: false } }, { name: 'John' }), false);
    });
  });

  describe('or operator', () => {
    it('returns true when at least one sub-condition matches', () => {
      assert.equal(checkCondition({ or: [{ status: 'done' }, { status: 'complete' }] }, { status: 'complete' }), true);
    });

    it('returns false when no sub-conditions match', () => {
      assert.equal(checkCondition({ or: [{ status: 'done' }, { status: 'complete' }] }, { status: 'pending' }), false);
    });

    it('returns false when or is not an array', () => {
      assert.equal(checkCondition({ or: 'invalid' }, { status: 'done' }), false);
    });
  });

  describe('multiple conditions (AND)', () => {
    it('returns true when all conditions match', () => {
      assert.equal(checkCondition({ status: 'done', count: { gt: 5 } }, { status: 'done', count: 10 }), true);
    });

    it('returns false when one condition fails', () => {
      assert.equal(checkCondition({ status: 'done', count: { gt: 5 } }, { status: 'done', count: 3 }), false);
    });
  });

  describe('edge cases', () => {
    it('returns true for empty condition object', () => {
      assert.equal(checkCondition({}, { anything: true }), true);
    });

    it('handles null output value with exact match', () => {
      assert.equal(checkCondition({ val: null }, { val: null }), true);
      assert.equal(checkCondition({ val: null }, { val: 'something' }), false);
    });

    it('handles undefined output value with exact match', () => {
      assert.equal(checkCondition({ val: undefined }, { val: undefined }), true);
      assert.equal(checkCondition({ val: undefined }, {}), true);
    });

    it('returns false for numeric operators when output is undefined', () => {
      assert.equal(checkCondition({ count: { gt: 0 } }, {}), false);
    });
  });
});
