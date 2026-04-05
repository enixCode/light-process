import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Schema, validate, validateInput, validateOutput } from '../../dist/schema.js';

describe('Schema builders', () => {
  it('Schema.string() returns string type', () => {
    const s = Schema.string();
    assert.equal(s.type, 'string');
  });

  it('Schema.string() with options merges them', () => {
    const s = Schema.string({ minLength: 1, maxLength: 10, description: 'name' });
    assert.equal(s.type, 'string');
    assert.equal(s.minLength, 1);
    assert.equal(s.maxLength, 10);
    assert.equal(s.description, 'name');
  });

  it('Schema.number() returns number type', () => {
    const s = Schema.number();
    assert.equal(s.type, 'number');
  });

  it('Schema.number() with options', () => {
    const s = Schema.number({ minimum: 0, maximum: 100 });
    assert.equal(s.minimum, 0);
    assert.equal(s.maximum, 100);
  });

  it('Schema.integer() returns integer type', () => {
    const s = Schema.integer();
    assert.equal(s.type, 'integer');
  });

  it('Schema.boolean() returns boolean type', () => {
    const s = Schema.boolean();
    assert.equal(s.type, 'boolean');
  });

  it('Schema.array() returns array type with items', () => {
    const s = Schema.array(Schema.string());
    assert.equal(s.type, 'array');
    assert.deepEqual(s.items, { type: 'string' });
  });

  it('Schema.array() with options', () => {
    const s = Schema.array(Schema.number(), { description: 'numbers list' });
    assert.equal(s.type, 'array');
    assert.equal(s.description, 'numbers list');
    assert.deepEqual(s.items, { type: 'number' });
  });

  it('Schema.object() returns object type with properties', () => {
    const s = Schema.object({ name: Schema.string(), age: Schema.integer() }, ['name']);
    assert.equal(s.type, 'object');
    assert.deepEqual(s.properties.name, { type: 'string' });
    assert.deepEqual(s.properties.age, { type: 'integer' });
    assert.deepEqual(s.required, ['name']);
  });

  it('Schema.object() without required', () => {
    const s = Schema.object({ x: Schema.number() });
    assert.equal(s.type, 'object');
    assert.equal(s.required, undefined);
  });
});

describe('validate()', () => {
  it('returns valid for null schema (skip validation)', () => {
    const result = validate({ anything: true }, null);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('returns valid for correct data', () => {
    const schema = Schema.object({ name: Schema.string() }, ['name']);
    const result = validate({ name: 'Alice' }, schema);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('returns invalid for wrong type', () => {
    const schema = Schema.object({ name: Schema.string() }, ['name']);
    const result = validate({ name: 123 }, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('returns invalid for missing required field', () => {
    const schema = Schema.object({ name: Schema.string() }, ['name']);
    const result = validate({}, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('returns invalid when data is undefined', () => {
    const schema = Schema.object({ name: Schema.string() });
    const result = validate(undefined, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('required')));
  });

  it('returns valid when data is undefined but schema has default', () => {
    const schema = Schema.object({ name: Schema.string() });
    schema.default = { name: 'default' };
    const result = validate(undefined, schema);
    assert.equal(result.valid, true);
  });

  it('error messages include the label', () => {
    const schema = Schema.object({ x: Schema.number() }, ['x']);
    const result = validate({}, schema, 'myData');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('myData')));
  });

  it('error messages include path for nested properties', () => {
    const schema = Schema.object(
      {
        nested: Schema.object({ val: Schema.number() }, ['val']),
      },
      ['nested'],
    );
    const result = validate({ nested: {} }, schema, 'input');
    assert.equal(result.valid, false);
    // Should contain the path to the nested field
    assert.ok(result.errors.length > 0);
  });

  it('validates array items', () => {
    const schema = Schema.object({ items: Schema.array(Schema.number()) }, ['items']);
    const valid = validate({ items: [1, 2, 3] }, schema);
    assert.equal(valid.valid, true);

    const invalid = validate({ items: [1, 'two', 3] }, schema);
    assert.equal(invalid.valid, false);
  });

  it('validates boolean fields', () => {
    const schema = Schema.object({ active: Schema.boolean() }, ['active']);
    assert.equal(validate({ active: true }, schema).valid, true);
    assert.equal(validate({ active: 'yes' }, schema).valid, false);
  });

  it('validates integer vs number', () => {
    const schema = Schema.object({ count: Schema.integer() }, ['count']);
    assert.equal(validate({ count: 5 }, schema).valid, true);
    assert.equal(validate({ count: 5.5 }, schema).valid, false);
  });
});

describe('validateInput()', () => {
  it('uses "input" as default label', () => {
    const schema = Schema.object({ x: Schema.number() }, ['x']);
    const result = validateInput({}, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('input')));
  });

  it('returns valid for null schema', () => {
    const result = validateInput({ anything: true }, null);
    assert.equal(result.valid, true);
  });
});

describe('validateOutput()', () => {
  it('uses "output" as default label', () => {
    const schema = Schema.object({ y: Schema.string() }, ['y']);
    const result = validateOutput({}, schema);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('output')));
  });

  it('returns valid for null schema', () => {
    const result = validateOutput({ anything: true }, null);
    assert.equal(result.valid, true);
  });
});
