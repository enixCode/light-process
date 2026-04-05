import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAllHelpers, getHelper, OUTPUT_FILE } from '../../dist/helpers.js';

describe('OUTPUT_FILE', () => {
  it('equals .lp-output.json', () => {
    assert.equal(OUTPUT_FILE, '.lp-output.json');
  });
});

describe('getHelper()', () => {
  describe('javascript', () => {
    it('returns correct filename', () => {
      const helper = getHelper('javascript');
      assert.equal(helper.filename, 'lp.js');
    });

    it('content reads stdin as input', () => {
      const helper = getHelper('javascript');
      assert.ok(helper.content.includes('input'));
      assert.ok(helper.content.includes("readFileSync(0, 'utf-8')"));
    });

    it('content provides send function', () => {
      const helper = getHelper('javascript');
      assert.ok(helper.content.includes('send'));
      assert.ok(helper.content.includes('.lp-output.json'));
    });

    it('content exports input and send', () => {
      const helper = getHelper('javascript');
      assert.ok(helper.content.includes('module.exports'));
      assert.ok(helper.content.includes('input'));
      assert.ok(helper.content.includes('send'));
    });
  });

  describe('python', () => {
    it('returns correct filename', () => {
      const helper = getHelper('python');
      assert.equal(helper.filename, 'lp.py');
    });

    it('content imports json and sys', () => {
      const helper = getHelper('python');
      assert.ok(helper.content.includes('import json'));
      assert.ok(helper.content.includes('sys'));
    });

    it('content reads stdin as input', () => {
      const helper = getHelper('python');
      assert.ok(helper.content.includes('sys.stdin.read()'));
    });

    it('content provides send function', () => {
      const helper = getHelper('python');
      assert.ok(helper.content.includes('def send'));
      assert.ok(helper.content.includes('.lp-output.json'));
    });
  });
});

describe('getAllHelpers()', () => {
  it('returns an array with both helpers', () => {
    const helpers = getAllHelpers();
    assert.equal(helpers.length, 2);
  });

  it('includes javascript helper', () => {
    const helpers = getAllHelpers();
    const js = helpers.find((h) => h.filename === 'lp.js');
    assert.ok(js);
    assert.ok(js.content.length > 0);
  });

  it('includes python helper', () => {
    const helpers = getAllHelpers();
    const py = helpers.find((h) => h.filename === 'lp.py');
    assert.ok(py);
    assert.ok(py.content.length > 0);
  });
});
