import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAllHelpers, getHelper } from '../../dist/helpers.js';

describe('getHelper()', () => {
  it('javascript helper reads stdin, writes output file, and exports send', () => {
    const h = getHelper('javascript');
    assert.equal(h.filename, 'lp.js');
    // Must form a valid CommonJS module that reads stdin and writes output
    assert.ok(h.content.includes("readFileSync(0, 'utf-8')"), 'reads stdin');
    assert.ok(h.content.includes('.lp-output.json'), 'writes output file');
    assert.ok(h.content.includes('module.exports'), 'exports for require()');
  });

  it('python helper reads stdin and provides send function', () => {
    const h = getHelper('python');
    assert.equal(h.filename, 'lp.py');
    assert.ok(h.content.includes('sys.stdin.read()'), 'reads stdin');
    assert.ok(h.content.includes('def send'), 'defines send function');
    assert.ok(h.content.includes('.lp-output.json'), 'writes output file');
  });
});

describe('getAllHelpers()', () => {
  it('returns both language helpers with non-empty content', () => {
    const helpers = getAllHelpers();
    assert.equal(helpers.length, 2);
    const filenames = helpers.map((h) => h.filename).sort();
    assert.deepEqual(filenames, ['lp.js', 'lp.py']);
    for (const h of helpers) {
      assert.ok(h.content.length > 50, `${h.filename} should have substantial content`);
    }
  });
});
